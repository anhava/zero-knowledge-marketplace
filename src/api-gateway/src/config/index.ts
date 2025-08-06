import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  
  database: {
    url: process.env.DATABASE_URL || '',
    pool: {
      min: 2,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    }
  },
  
  redis: {
    url: process.env.REDIS_URL || '',
    ttl: {
      default: 3600, // 1 hour
      session: 86400, // 24 hours
      cache: 300, // 5 minutes
    }
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: '24h',
    algorithm: 'HS256' as const,
  },
  
  encryption: {
    key: process.env.ENCRYPTION_KEY || '',
    algorithm: 'aes-256-gcm',
  },
  
  tor: {
    enabled: process.env.TOR_ENABLED === 'true',
    proxyHost: process.env.TOR_PROXY_HOST || 'tor-proxy',
    proxyPort: parseInt(process.env.TOR_PROXY_PORT || '9050', 10),
  },
  
  cors: {
    origins: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
  },
  
  blindSignature: {
    publicKey: process.env.BLIND_SIGNATURE_PUBLIC_KEY || '',
    privateKey: process.env.BLIND_SIGNATURE_PRIVATE_KEY || '',
  },
  
  limits: {
    maxShopsPerUser: parseInt(process.env.MAX_SHOPS_PER_USER || '5', 10),
    maxRequestSize: '1mb',
    maxUploadSize: '10mb',
  },
  
  security: {
    bcryptRounds: 12,
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
    maxLoginAttempts: 5,
    lockoutDuration: 15 * 60 * 1000, // 15 minutes
  },
  
  deployment: {
    dockerSocket: process.env.DOCKER_HOST || '/var/run/docker.sock',
    shopDataPath: process.env.SHOP_DATA_PATH || '/data/shops',
    torControlPassword: process.env.TOR_CONTROL_PASSWORD || '',
  },
  
  btcpay: {
    defaultImage: 'btcpayserver/btcpayserver:latest',
    networkConfigs: {
      mainnet: {
        network: 'mainnet',
        lightning: 'lnd',
        crypto: ['btc', 'ltc', 'eth'],
      },
      testnet: {
        network: 'testnet',
        lightning: 'clightning',
        crypto: ['btc'],
      },
    },
  },
  
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    prometheusPort: parseInt(process.env.PROMETHEUS_PORT || '9090', 10),
  },
};

// Validate required configuration
const requiredEnvVars = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'BLIND_SIGNATURE_PUBLIC_KEY',
  'BLIND_SIGNATURE_PRIVATE_KEY',
  'TOR_CONTROL_PASSWORD',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}