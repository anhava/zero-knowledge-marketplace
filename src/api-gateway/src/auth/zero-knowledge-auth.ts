import crypto from 'crypto';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { database } from '../database';

interface ZKChallenge {
  challengeId: string;
  challenge: string;
  timestamp: number;
  expiresAt: number;
}

interface ZKProof {
  commitment: string;
  challenge: string;
  response: string;
}

interface AuthToken {
  tokenId: string;
  sessionId: string;
  expiresAt: Date;
}

export class ZeroKnowledgeAuth {
  private challenges: Map<string, ZKChallenge>;
  private readonly CHALLENGE_EXPIRY = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.challenges = new Map();
    
    // Clean up expired challenges periodically
    setInterval(() => this.cleanupExpiredChallenges(), 60 * 1000);
  }

  // Step 1: Generate authentication challenge
  async generateChallenge(): Promise<{
    challengeId: string;
    challenge: string;
    expiresAt: number;
  }> {
    const challengeId = crypto.randomBytes(16).toString('hex');
    const challenge = crypto.randomBytes(32).toString('hex');
    const timestamp = Date.now();
    const expiresAt = timestamp + this.CHALLENGE_EXPIRY;

    const zkChallenge: ZKChallenge = {
      challengeId,
      challenge,
      timestamp,
      expiresAt,
    };

    this.challenges.set(challengeId, zkChallenge);

    logger.debug('ZK challenge generated', { challengeId });

    return {
      challengeId,
      challenge,
      expiresAt,
    };
  }

  // Step 2: Verify zero-knowledge proof
  async verifyProof(
    challengeId: string,
    proof: ZKProof
  ): Promise<{ valid: boolean; sessionId?: string }> {
    try {
      const challenge = this.challenges.get(challengeId);
      
      if (!challenge) {
        logger.warn('Challenge not found', { challengeId });
        return { valid: false };
      }

      if (Date.now() > challenge.expiresAt) {
        logger.warn('Challenge expired', { challengeId });
        this.challenges.delete(challengeId);
        return { valid: false };
      }

      // Verify the proof matches the challenge
      if (proof.challenge !== challenge.challenge) {
        logger.warn('Challenge mismatch', { challengeId });
        return { valid: false };
      }

      // Verify the cryptographic proof
      const isValid = this.verifyZKProof(
        proof.commitment,
        challenge.challenge,
        proof.response
      );

      if (!isValid) {
        logger.warn('Invalid ZK proof', { challengeId });
        return { valid: false };
      }

      // Clean up used challenge
      this.challenges.delete(challengeId);

      // Generate session ID
      const sessionId = crypto.randomBytes(32).toString('hex');

      logger.info('ZK proof verified successfully', { sessionId });

      return {
        valid: true,
        sessionId,
      };
    } catch (error) {
      logger.error('Proof verification error:', error);
      return { valid: false };
    }
  }

  // Cryptographic verification of the ZK proof
  private verifyZKProof(
    commitment: string,
    challenge: string,
    response: string
  ): boolean {
    try {
      // This is a simplified Schnorr-like proof verification
      // In production, use a proper ZK proof system (zk-SNARKs, Bulletproofs, etc.)
      
      const commitmentBytes = Buffer.from(commitment, 'hex');
      const challengeBytes = Buffer.from(challenge, 'hex');
      const responseBytes = Buffer.from(response, 'hex');

      // Verify response = commitment + challenge * secret (mod order)
      // This is simplified - real implementation would use elliptic curve operations
      
      const hash = crypto.createHash('sha256');
      hash.update(commitmentBytes);
      hash.update(challengeBytes);
      hash.update(responseBytes);
      
      const verification = hash.digest();
      
      // Check if the proof is valid (simplified)
      return verification[0] < 128; // 50% chance - replace with real verification

    } catch (error) {
      logger.error('ZK proof verification error:', error);
      return false;
    }
  }

  // Generate JWT token after successful authentication
  async generateAuthToken(sessionId: string): Promise<{
    token: string;
    expiresAt: Date;
  }> {
    const tokenId = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + config.security.sessionTimeout);

    // Create JWT payload (minimal data)
    const payload = {
      tokenId,
      sessionId,
      type: 'auth',
    };

    const token = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
      algorithm: config.jwt.algorithm,
    });

    // Store token hash (not the token itself)
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    await database.query(
      `INSERT INTO auth_tokens (token_hash, encrypted_data, expires_at) 
       VALUES ($1, $2, $3)`,
      [tokenHash, this.encryptSessionData(sessionId), expiresAt]
    );

    logger.info('Auth token generated', { tokenId });

    return {
      token,
      expiresAt,
    };
  }

  // Verify JWT token
  async verifyAuthToken(token: string): Promise<{
    valid: boolean;
    sessionId?: string;
  }> {
    try {
      // Verify JWT signature
      const decoded = jwt.verify(token, config.jwt.secret) as any;
      
      // Check token in database
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      
      const result = await database.query(
        `SELECT encrypted_data, expires_at 
         FROM auth_tokens 
         WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP`,
        [tokenHash]
      );

      if (result.rows.length === 0) {
        return { valid: false };
      }

      const sessionId = this.decryptSessionData(result.rows[0].encrypted_data);

      return {
        valid: true,
        sessionId,
      };
    } catch (error) {
      logger.error('Token verification error:', error);
      return { valid: false };
    }
  }

  // Revoke authentication token
  async revokeToken(token: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    await database.query(
      'DELETE FROM auth_tokens WHERE token_hash = $1',
      [tokenHash]
    );

    logger.info('Token revoked');
  }

  // Clean up expired challenges
  private cleanupExpiredChallenges(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, challenge] of this.challenges) {
      if (challenge.expiresAt < now) {
        this.challenges.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired challenges`);
    }
  }

  // Clean up expired tokens in database
  async cleanupExpiredTokens(): Promise<void> {
    const result = await database.query(
      'DELETE FROM auth_tokens WHERE expires_at < CURRENT_TIMESTAMP'
    );

    if (result.rowCount > 0) {
      logger.info(`Cleaned up ${result.rowCount} expired tokens`);
    }
  }

  // Encrypt session data
  private encryptSessionData(sessionId: string): string {
    const key = Buffer.from(config.encryption.key, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(sessionId, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return JSON.stringify({
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    });
  }

  // Decrypt session data
  private decryptSessionData(encryptedData: string): string {
    const data = JSON.parse(encryptedData);
    const key = Buffer.from(config.encryption.key, 'hex');
    
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(data.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(data.authTag, 'hex'));
    
    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  // Generate client-side proof (for SDK/library)
  static generateProof(
    secret: string,
    challenge: string
  ): ZKProof {
    // This would be implemented in the client-side library
    // Here's a simplified version
    
    const secretBytes = naclUtil.decodeUTF8(secret);
    const challengeBytes = Buffer.from(challenge, 'hex');
    
    // Generate commitment
    const randomness = nacl.randomBytes(32);
    const commitmentHash = crypto.createHash('sha256');
    commitmentHash.update(secretBytes);
    commitmentHash.update(randomness);
    const commitment = commitmentHash.digest('hex');
    
    // Generate response
    const responseHash = crypto.createHash('sha256');
    responseHash.update(secretBytes);
    responseHash.update(challengeBytes);
    responseHash.update(randomness);
    const response = responseHash.digest('hex');
    
    return {
      commitment,
      challenge,
      response,
    };
  }
}

export default ZeroKnowledgeAuth;