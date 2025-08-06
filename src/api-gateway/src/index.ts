import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { shopRouter } from './routes/shops';
import { paymentRouter } from './routes/payments';
import { healthRouter } from './routes/health';
import { initializeDatabase } from './database';
import { initializeRedis } from './cache';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
app.use(cors({
  origin: config.cors.origins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Request-ID'],
  maxAge: 86400 // 24 hours
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Compression
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);

// Strict rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
});

app.use('/api/auth', authLimiter);

// Request logging
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || generateRequestId();
  req.id = requestId as string;
  res.setHeader('X-Request-ID', requestId);
  
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  
  next();
});

// Routes
app.use('/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/shops', shopRouter);
app.use('/api/payments', paymentRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource does not exist',
    path: req.path
  });
});

// Error handling
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  await shutdown();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  await shutdown();
});

async function shutdown() {
  // Close database connections
  await initializeDatabase.close();
  
  // Close Redis connections
  await initializeRedis.close();
  
  process.exit(0);
}

// Start server
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    
    // Initialize Redis
    await initializeRedis();
    
    const port = config.port || 3000;
    
    app.listen(port, () => {
      logger.info(`API Gateway started on port ${port}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`Tor proxy: ${config.tor.enabled ? 'enabled' : 'disabled'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Start the server
startServer();