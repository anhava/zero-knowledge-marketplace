import express from 'express';
import { Docker } from 'node-docker-api';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import YAML from 'yaml';
import { TorController } from './tor-controller';
import { ShopDeployer } from './shop-deployer';
import { logger } from './utils/logger';
import { config } from './config';

const app = express();
const docker = new Docker({ socketPath: config.docker.socketPath });
const torController = new TorController(config.tor);
const shopDeployer = new ShopDeployer(docker, torController);

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Deploy a new shop
app.post('/deploy', async (req, res) => {
  try {
    const {
      shopId,
      encryptedConfig,
      cryptoCurrencies,
      lightningEnabled,
      network = 'mainnet'
    } = req.body;

    // Validate input
    if (!shopId || !encryptedConfig) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Generate unique identifiers and keys
    const deploymentId = crypto.randomBytes(16).toString('hex');
    const dbPassword = crypto.randomBytes(32).toString('base64');
    const redisPassword = crypto.randomBytes(32).toString('base64');
    const shopEncryptionKey = crypto.randomBytes(32).toString('hex');

    // Prepare deployment configuration
    const deploymentConfig = {
      shopId,
      deploymentId,
      network,
      cryptoCurrencies: cryptoCurrencies || ['btc'],
      lightningEnabled: lightningEnabled || false,
      credentials: {
        dbPassword,
        redisPassword,
        shopEncryptionKey,
      },
      subnet: generateSubnet(shopId),
    };

    // Deploy the shop
    const result = await shopDeployer.deployShop(deploymentConfig);

    // Return only the necessary information
    res.json({
      success: true,
      shopId,
      onionAddress: result.onionAddress,
      deploymentId,
      // Don't return sensitive credentials
    });

  } catch (error) {
    logger.error('Deployment error:', error);
    res.status(500).json({ error: 'Deployment failed' });
  }
});

// Get shop status (minimal information)
app.get('/status/:shopId', async (req, res) => {
  try {
    const { shopId } = req.params;
    const status = await shopDeployer.getShopStatus(shopId);
    
    res.json({
      shopId,
      status: status.running ? 'running' : 'stopped',
      onionAddress: status.onionAddress,
      // No other identifying information
    });
  } catch (error) {
    logger.error('Status check error:', error);
    res.status(404).json({ error: 'Shop not found' });
  }
});

// Stop a shop
app.post('/stop/:shopId', async (req, res) => {
  try {
    const { shopId } = req.params;
    const { verificationToken } = req.body;

    // Verify ownership (simplified - in production use proper authentication)
    if (!verificationToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await shopDeployer.stopShop(shopId);
    
    res.json({
      success: true,
      shopId,
      status: 'stopped',
    });
  } catch (error) {
    logger.error('Stop error:', error);
    res.status(500).json({ error: 'Failed to stop shop' });
  }
});

// Delete a shop (permanent)
app.delete('/shop/:shopId', async (req, res) => {
  try {
    const { shopId } = req.params;
    const { verificationToken, confirmDelete } = req.body;

    // Verify ownership and confirm deletion
    if (!verificationToken || confirmDelete !== true) {
      return res.status(401).json({ error: 'Unauthorized or unconfirmed' });
    }

    await shopDeployer.deleteShop(shopId);
    
    res.json({
      success: true,
      shopId,
      status: 'deleted',
    });
  } catch (error) {
    logger.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete shop' });
  }
});

// Update shop configuration (limited)
app.put('/shop/:shopId/config', async (req, res) => {
  try {
    const { shopId } = req.params;
    const { verificationToken, encryptedConfig } = req.body;

    if (!verificationToken || !encryptedConfig) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Update only allowed configuration
    await shopDeployer.updateShopConfig(shopId, encryptedConfig);
    
    res.json({
      success: true,
      shopId,
      status: 'updated',
    });
  } catch (error) {
    logger.error('Update error:', error);
    res.status(500).json({ error: 'Failed to update shop' });
  }
});

// Monitor shops for ToS violations
app.post('/monitor/scan', async (req, res) => {
  try {
    const { adminToken } = req.body;
    
    // Verify admin access
    if (!verifyAdminToken(adminToken)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const violations = await shopDeployer.scanForViolations();
    
    res.json({
      success: true,
      violationsFound: violations.length,
      // Return only hashes, not shop identities
      violations: violations.map(v => ({
        hash: crypto.createHash('sha256').update(v.shopId).digest('hex'),
        type: v.type,
        severity: v.severity,
      })),
    });
  } catch (error) {
    logger.error('Monitoring error:', error);
    res.status(500).json({ error: 'Monitoring failed' });
  }
});

// Generate unique subnet for shop isolation
function generateSubnet(shopId: string): string {
  const hash = crypto.createHash('sha256').update(shopId).digest();
  const octet2 = (hash[0] % 254) + 1; // 1-254
  const octet3 = hash[1]; // 0-255
  return `172.${octet2}.${octet3}.0/24`;
}

// Verify admin token (simplified)
function verifyAdminToken(token: string): boolean {
  if (!token) return false;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return hash === config.admin.tokenHash;
}

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logger.info(`Deployment service started on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

export default app;