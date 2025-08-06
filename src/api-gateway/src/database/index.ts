import { Pool, PoolClient } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

let pool: Pool | null = null;

export async function initializeDatabase(): Promise<void> {
  try {
    pool = new Pool({
      connectionString: config.database.url,
      ...config.database.pool,
      ssl: {
        rejectUnauthorized: false,
      },
    });

    // Test connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    logger.info('Database connection established');

    // Set up connection error handling
    pool.on('error', (err) => {
      logger.error('Unexpected database error:', err);
    });

  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
}

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<{ rows: T[]; rowCount: number }> {
  if (!pool) {
    throw new Error('Database not initialized');
  }

  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    
    logger.debug('Query executed', {
      text: text.substring(0, 100),
      duration,
      rows: result.rowCount,
    });

    return result;
  } catch (error) {
    logger.error('Query error:', { text, error });
    throw error;
  }
}

export async function getClient(): Promise<PoolClient> {
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool.connect();
}

export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Database schema - minimal data storage
export const schema = `
-- Payment tracking table (minimal data)
CREATE TABLE IF NOT EXISTS payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMP WITH TIME ZONE,
    -- No user_id, shop_id, amount, or any identifying information
    CONSTRAINT valid_status CHECK (status IN ('pending', 'completed', 'expired', 'failed'))
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_payments_expires_at ON payments(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

-- Automatic cleanup of expired payments
CREATE OR REPLACE FUNCTION cleanup_expired_payments() RETURNS void AS $$
BEGIN
    DELETE FROM payments 
    WHERE status = 'pending' 
    AND expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Authentication tokens (temporary, encrypted)
CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash VARCHAR(64) PRIMARY KEY,
    encrypted_data TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires_at ON auth_tokens(expires_at);

-- Rate limiting (temporary)
CREATE TABLE IF NOT EXISTS rate_limits (
    identifier VARCHAR(64) PRIMARY KEY,
    requests INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits(window_start);

-- Blind signatures for payment verification
CREATE TABLE IF NOT EXISTS blind_signatures (
    signature_hash VARCHAR(64) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blind_signatures_expires_at ON blind_signatures(expires_at);

-- Terms of Service violations (for enforcement)
CREATE TABLE IF NOT EXISTS tos_violations (
    violation_hash VARCHAR(64) PRIMARY KEY,
    violation_type VARCHAR(50) NOT NULL,
    detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    -- No user or shop identification
    CONSTRAINT valid_violation_type CHECK (violation_type IN ('content', 'behavior', 'technical', 'other'))
);

-- Canary tokens for monitoring
CREATE TABLE IF NOT EXISTS canary_tokens (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    triggered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
`;

// Close database connection
initializeDatabase.close = async function() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection closed');
  }
};

export default {
  query,
  getClient,
  transaction,
  initializeDatabase,
};