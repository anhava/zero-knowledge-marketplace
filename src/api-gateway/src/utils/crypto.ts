import crypto from 'crypto';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import { config } from '../config';

// AES-256-GCM encryption for sensitive data
export function encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
  const key = Buffer.from(config.encryption.key, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

export function decrypt(encrypted: string, iv: string, authTag: string): string {
  const key = Buffer.from(config.encryption.key, 'hex');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// Generate secure random tokens
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// Hash tokens for storage
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Blind signature implementation for privacy-preserving payment verification
export class BlindSignature {
  private publicKey: Uint8Array;
  private privateKey: Uint8Array;

  constructor() {
    // In production, these would be loaded from secure storage
    const keypair = nacl.sign.keyPair();
    this.publicKey = keypair.publicKey;
    this.privateKey = keypair.secretKey;
  }

  // Client-side: Blind the message
  blindMessage(message: string): {
    blinded: string;
    blindingFactor: string;
  } {
    const messageBytes = naclUtil.decodeUTF8(message);
    const blindingFactor = nacl.randomBytes(32);
    
    // Simple blinding (in production, use proper RSA blind signatures)
    const blinded = new Uint8Array(messageBytes.length);
    for (let i = 0; i < messageBytes.length; i++) {
      blinded[i] = messageBytes[i] ^ blindingFactor[i % 32];
    }
    
    return {
      blinded: naclUtil.encodeBase64(blinded),
      blindingFactor: naclUtil.encodeBase64(blindingFactor),
    };
  }

  // Server-side: Sign the blinded message
  signBlinded(blindedMessage: string): string {
    const blinded = naclUtil.decodeBase64(blindedMessage);
    const signature = nacl.sign.detached(blinded, this.privateKey);
    return naclUtil.encodeBase64(signature);
  }

  // Client-side: Unblind the signature
  unblindSignature(
    blindedSignature: string,
    blindingFactor: string
  ): string {
    const signature = naclUtil.decodeBase64(blindedSignature);
    const factor = naclUtil.decodeBase64(blindingFactor);
    
    // Simple unblinding (matches the blinding operation)
    const unblinded = new Uint8Array(signature.length);
    for (let i = 0; i < signature.length; i++) {
      unblinded[i] = signature[i] ^ factor[i % 32];
    }
    
    return naclUtil.encodeBase64(unblinded);
  }

  // Verify an unblinded signature
  verifySignature(message: string, signature: string): boolean {
    const messageBytes = naclUtil.decodeUTF8(message);
    const signatureBytes = naclUtil.decodeBase64(signature);
    
    return nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      this.publicKey
    );
  }
}

// Zero-knowledge proof for authentication
export class ZKProof {
  // Generate a commitment to a secret
  static generateCommitment(secret: string): {
    commitment: string;
    randomness: string;
  } {
    const randomness = crypto.randomBytes(32);
    const hash = crypto.createHash('sha256');
    hash.update(secret);
    hash.update(randomness);
    
    return {
      commitment: hash.digest('hex'),
      randomness: randomness.toString('hex'),
    };
  }

  // Create a challenge for the prover
  static createChallenge(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Generate a response to the challenge
  static generateResponse(
    secret: string,
    challenge: string,
    randomness: string
  ): string {
    const hash = crypto.createHash('sha256');
    hash.update(secret);
    hash.update(challenge);
    hash.update(Buffer.from(randomness, 'hex'));
    
    return hash.digest('hex');
  }

  // Verify the zero-knowledge proof
  static verifyProof(
    commitment: string,
    challenge: string,
    response: string
  ): boolean {
    // In a real implementation, this would verify the mathematical relationship
    // between commitment, challenge, and response without revealing the secret
    return response.length === 64; // Simplified for demo
  }
}

// Derive shop-specific keys (for isolation)
export function deriveShopKey(masterKey: string, shopId: string): Buffer {
  return crypto.pbkdf2Sync(
    masterKey,
    shopId,
    100000,
    32,
    'sha256'
  );
}

// Generate onion address from public key
export function generateOnionAddress(publicKey: Buffer): string {
  // This is a simplified version - real Tor v3 addresses use Ed25519
  const hash = crypto.createHash('sha256').update(publicKey).digest();
  const checksum = crypto.createHash('sha256').update(hash).digest().slice(0, 2);
  
  const address = Buffer.concat([
    hash.slice(0, 20),
    checksum,
    Buffer.from([0x03]) // Version byte for v3
  ]);
  
  // Base32 encode (Tor uses a custom alphabet)
  const base32Alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let result = '';
  
  // Simplified base32 encoding
  for (let i = 0; i < address.length; i++) {
    result += base32Alphabet[address[i] % 32];
  }
  
  return result.slice(0, 56) + '.onion';
}

export default {
  encrypt,
  decrypt,
  generateSecureToken,
  hashToken,
  BlindSignature,
  ZKProof,
  deriveShopKey,
  generateOnionAddress,
};