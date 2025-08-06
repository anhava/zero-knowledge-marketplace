import crypto from 'crypto';
import { EventEmitter } from 'events';
import { logger } from './utils/logger';

interface CanaryToken {
  id: string;
  hash: string;
  type: 'content' | 'behavior' | 'access';
  createdAt: Date;
  triggeredAt?: Date;
  metadata?: Record<string, any>;
}

interface CanaryTrigger {
  tokenId: string;
  triggeredAt: Date;
  triggerType: string;
  source?: string;
  details?: Record<string, any>;
}

export class CanarySystem extends EventEmitter {
  private tokens: Map<string, CanaryToken>;
  private triggers: CanaryTrigger[];

  constructor() {
    super();
    this.tokens = new Map();
    this.triggers = [];
  }

  // Generate a new canary token
  generateToken(type: CanaryToken['type'], metadata?: Record<string, any>): CanaryToken {
    const id = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256').update(id + Date.now()).digest('hex');

    const token: CanaryToken = {
      id,
      hash,
      type,
      createdAt: new Date(),
      metadata,
    };

    this.tokens.set(hash, token);
    
    logger.info('Canary token generated', {
      type,
      hash: hash.substring(0, 8),
    });

    return token;
  }

  // Deploy content canaries (hidden markers in shop content)
  deployContentCanary(shopId: string): string {
    const token = this.generateToken('content', { shopId: this.hashShopId(shopId) });
    
    // Generate invisible content marker
    const marker = this.generateInvisibleMarker(token.hash);
    
    return marker;
  }

  // Deploy behavior canaries (track suspicious actions)
  deployBehaviorCanary(pattern: string): string {
    const token = this.generateToken('behavior', { pattern });
    
    // Return a tracking ID that can be embedded in URLs or forms
    return token.hash.substring(0, 16);
  }

  // Deploy access canaries (honeypot endpoints)
  deployAccessCanary(endpoint: string): CanaryToken {
    return this.generateToken('access', { endpoint });
  }

  // Check if a canary has been triggered
  checkCanary(input: string): CanaryTrigger | null {
    // Check various forms of the input
    const possibleHashes = [
      input,
      crypto.createHash('sha256').update(input).digest('hex'),
      this.extractCanaryFromContent(input),
    ].filter(Boolean);

    for (const hash of possibleHashes) {
      const token = this.tokens.get(hash as string);
      if (token) {
        const trigger: CanaryTrigger = {
          tokenId: token.id,
          triggeredAt: new Date(),
          triggerType: 'direct_match',
          details: { input: input.substring(0, 100) },
        };

        this.recordTrigger(token, trigger);
        return trigger;
      }
    }

    // Check for partial matches (behavior patterns)
    const behaviorMatch = this.checkBehaviorPattern(input);
    if (behaviorMatch) {
      return behaviorMatch;
    }

    return null;
  }

  // Record a canary trigger
  private recordTrigger(token: CanaryToken, trigger: CanaryTrigger): void {
    token.triggeredAt = trigger.triggeredAt;
    this.triggers.push(trigger);

    // Emit event for immediate response
    this.emit('canary:triggered', {
      token,
      trigger,
    });

    logger.warn('Canary triggered', {
      type: token.type,
      tokenHash: token.hash.substring(0, 8),
      triggerType: trigger.triggerType,
    });
  }

  // Generate invisible content marker
  private generateInvisibleMarker(hash: string): string {
    // Use various techniques to hide the marker
    const techniques = [
      // Zero-width characters
      () => {
        const chars = ['​', '‌', '‍']; // Zero-width space, non-joiner, joiner
        return hash.split('').map((c, i) => c + chars[i % chars.length]).join('');
      },
      // HTML comments
      () => `<!-- canary:${hash} -->`,
      // CSS hidden element
      () => `<span style="display:none;position:absolute;left:-9999px">${hash}</span>`,
      // Base64 encoded in data attribute
      () => `<div data-c="${Buffer.from(hash).toString('base64')}"></div>`,
    ];

    // Randomly select a technique
    const technique = techniques[Math.floor(Math.random() * techniques.length)];
    return technique();
  }

  // Extract canary from content
  private extractCanaryFromContent(content: string): string | null {
    // Check for various canary formats
    const patterns = [
      /<!-- canary:([a-f0-9]{64}) -->/,
      /data-c="([A-Za-z0-9+/=]+)"/,
      /<span[^>]*style="display:none[^>]*>([a-f0-9]{64})<\/span>/,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const extracted = match[1];
        // Decode if base64
        if (pattern.source.includes('data-c')) {
          try {
            return Buffer.from(extracted, 'base64').toString();
          } catch {
            continue;
          }
        }
        return extracted;
      }
    }

    // Check for zero-width character encoding
    const cleaned = content.replace(/[​‌‍]/g, '');
    if (cleaned.length !== content.length && cleaned.length === 64) {
      return cleaned;
    }

    return null;
  }

  // Check for behavior patterns
  private checkBehaviorPattern(input: string): CanaryTrigger | null {
    const behaviorTokens = Array.from(this.tokens.values()).filter(t => t.type === 'behavior');

    for (const token of behaviorTokens) {
      const pattern = token.metadata?.pattern;
      if (pattern && new RegExp(pattern).test(input)) {
        const trigger: CanaryTrigger = {
          tokenId: token.id,
          triggeredAt: new Date(),
          triggerType: 'behavior_pattern',
          details: { pattern, matched: input.substring(0, 100) },
        };

        this.recordTrigger(token, trigger);
        return trigger;
      }
    }

    return null;
  }

  // Hash shop ID for privacy
  private hashShopId(shopId: string): string {
    return crypto.createHash('sha256').update(shopId).digest('hex');
  }

  // Get triggered canaries report
  getTriggeredCanaries(since?: Date): {
    total: number;
    byType: Record<string, number>;
    recent: CanaryTrigger[];
  } {
    const filtered = since
      ? this.triggers.filter(t => t.triggeredAt > since)
      : this.triggers;

    const byType = filtered.reduce((acc, trigger) => {
      const token = Array.from(this.tokens.values()).find(t => t.id === trigger.tokenId);
      if (token) {
        acc[token.type] = (acc[token.type] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    return {
      total: filtered.length,
      byType,
      recent: filtered.slice(-10),
    };
  }

  // Clean up old canaries
  async cleanup(olderThan: Date): Promise<number> {
    let removed = 0;

    for (const [hash, token] of this.tokens) {
      if (token.createdAt < olderThan && !token.triggeredAt) {
        this.tokens.delete(hash);
        removed++;
      }
    }

    // Clean up old triggers
    this.triggers = this.triggers.filter(t => t.triggeredAt > olderThan);

    logger.info(`Cleaned up ${removed} old canary tokens`);
    return removed;
  }

  // Generate honeypot data
  generateHoneypotData(): Record<string, any> {
    const canary = this.generateToken('access', { type: 'honeypot' });
    
    return {
      // Fake cryptocurrency addresses
      btcAddress: '1' + canary.hash.substring(0, 33),
      ethAddress: '0x' + canary.hash.substring(0, 40),
      
      // Fake API endpoints
      apiEndpoint: `/api/v1/restricted/${canary.hash.substring(0, 16)}`,
      
      // Fake credentials
      username: 'admin_' + canary.hash.substring(0, 8),
      password: Buffer.from(canary.hash.substring(0, 16)).toString('base64'),
      
      // Hidden form fields
      _csrf: canary.hash.substring(0, 32),
      _nonce: Date.now().toString() + canary.hash.substring(0, 8),
    };
  }
}

export default CanarySystem;