import net from 'net';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { logger } from './utils/logger';

interface TorConfig {
  controlHost: string;
  controlPort: number;
  controlPassword: string;
  socksHost: string;
  socksPort: number;
}

interface HiddenService {
  serviceId: string;
  privateKey: string;
  hostname: string;
  ports: Array<{
    virtualPort: number;
    targetHost: string;
    targetPort: number;
  }>;
}

export class TorController extends EventEmitter {
  private config: TorConfig;
  private connection: net.Socket | null = null;
  private authenticated: boolean = false;
  private commandQueue: Array<{
    command: string;
    resolve: (response: string) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(config: TorConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connection = net.createConnection({
        host: this.config.controlHost,
        port: this.config.controlPort,
      });

      this.connection.on('connect', () => {
        logger.info('Connected to Tor control port');
        this.authenticate()
          .then(() => resolve())
          .catch(reject);
      });

      this.connection.on('data', (data) => {
        this.handleResponse(data.toString());
      });

      this.connection.on('error', (error) => {
        logger.error('Tor control connection error:', error);
        reject(error);
      });

      this.connection.on('close', () => {
        logger.info('Tor control connection closed');
        this.authenticated = false;
        this.connection = null;
      });
    });
  }

  private async authenticate(): Promise<void> {
    const response = await this.sendCommand(
      `AUTHENTICATE "${this.config.controlPassword}"`
    );
    
    if (!response.startsWith('250')) {
      throw new Error('Tor authentication failed');
    }
    
    this.authenticated = true;
    logger.info('Authenticated with Tor control port');
  }

  private sendCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.connection) {
        reject(new Error('Not connected to Tor'));
        return;
      }

      this.commandQueue.push({ command, resolve, reject });
      this.connection.write(command + '\r\n');
    });
  }

  private handleResponse(data: string): void {
    const lines = data.trim().split('\r\n');
    const fullResponse = lines.join('\n');
    
    const pending = this.commandQueue.shift();
    if (pending) {
      if (fullResponse.startsWith('250')) {
        pending.resolve(fullResponse);
      } else {
        pending.reject(new Error(`Tor command failed: ${fullResponse}`));
      }
    }
  }

  async createHiddenService(
    serviceId: string,
    ports: Array<{ virtualPort: number; targetHost: string; targetPort: number }>
  ): Promise<HiddenService> {
    if (!this.authenticated) {
      await this.connect();
    }

    // Generate Ed25519 key pair for v3 onion service
    const privateKey = crypto.randomBytes(32).toString('base64');
    
    // Configure hidden service
    const commands = [
      `ADD_ONION NEW:ED25519-V3 ${ports
        .map(p => `Port=${p.virtualPort},${p.targetHost}:${p.targetPort}`)
        .join(' ')}`,
    ];

    const response = await this.sendCommand(commands.join(' '));
    
    // Parse response to get hostname
    const hostnameMatch = response.match(/250-ServiceID=(\w+)/);
    if (!hostnameMatch) {
      throw new Error('Failed to create hidden service');
    }

    const hostname = `${hostnameMatch[1]}.onion`;
    
    logger.info(`Created hidden service: ${hostname}`);

    return {
      serviceId,
      privateKey,
      hostname,
      ports,
    };
  }

  async removeHiddenService(serviceId: string): Promise<void> {
    if (!this.authenticated) {
      await this.connect();
    }

    await this.sendCommand(`DEL_ONION ${serviceId}`);
    logger.info(`Removed hidden service: ${serviceId}`);
  }

  async getHiddenServiceInfo(serviceId: string): Promise<{
    hostname: string;
    active: boolean;
  } | null> {
    if (!this.authenticated) {
      await this.connect();
    }

    try {
      const response = await this.sendCommand(`GETINFO onions/detached`);
      const services = response.split('\n')[0].split('=')[1]?.split(',') || [];
      
      const active = services.includes(serviceId);
      
      return {
        hostname: `${serviceId}.onion`,
        active,
      };
    } catch (error) {
      logger.error('Failed to get hidden service info:', error);
      return null;
    }
  }

  async updateHiddenService(
    serviceId: string,
    ports: Array<{ virtualPort: number; targetHost: string; targetPort: number }>
  ): Promise<void> {
    // Remove and recreate the service with new ports
    await this.removeHiddenService(serviceId);
    await this.createHiddenService(serviceId, ports);
  }

  async listHiddenServices(): Promise<string[]> {
    if (!this.authenticated) {
      await this.connect();
    }

    const response = await this.sendCommand('GETINFO onions/detached');
    const match = response.match(/250\+OK\r?\n(.+)/);
    
    if (!match || !match[1]) {
      return [];
    }

    return match[1].split(',').filter(Boolean);
  }

  async getCircuits(): Promise<Array<{
    id: string;
    status: string;
    path: string[];
  }>> {
    if (!this.authenticated) {
      await this.connect();
    }

    const response = await this.sendCommand('GETINFO circuit-status');
    const circuits: Array<{ id: string; status: string; path: string[] }> = [];
    
    // Parse circuit information
    const lines = response.split('\n').slice(1, -1);
    for (const line of lines) {
      const parts = line.split(' ');
      if (parts.length >= 3) {
        circuits.push({
          id: parts[0],
          status: parts[1],
          path: parts.slice(2),
        });
      }
    }

    return circuits;
  }

  async newIdentity(): Promise<void> {
    if (!this.authenticated) {
      await this.connect();
    }

    await this.sendCommand('SIGNAL NEWNYM');
    logger.info('Requested new Tor identity');
  }

  disconnect(): void {
    if (this.connection) {
      this.connection.end();
      this.connection = null;
      this.authenticated = false;
    }
  }

  // Monitor Tor connection health
  async checkHealth(): Promise<{
    connected: boolean;
    authenticated: boolean;
    version: string | null;
  }> {
    try {
      if (!this.authenticated) {
        await this.connect();
      }

      const response = await this.sendCommand('GETINFO version');
      const versionMatch = response.match(/version=(.+)/);
      
      return {
        connected: true,
        authenticated: this.authenticated,
        version: versionMatch ? versionMatch[1] : null,
      };
    } catch (error) {
      return {
        connected: false,
        authenticated: false,
        version: null,
      };
    }
  }
}

export default TorController;