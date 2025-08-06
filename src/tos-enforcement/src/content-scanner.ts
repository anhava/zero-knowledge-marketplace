import crypto from 'crypto';
import { EventEmitter } from 'events';
import axios from 'axios';
import { logger } from './utils/logger';

interface ScanResult {
  violationFound: boolean;
  violationType?: string;
  confidence: number;
  hash: string;
}

interface ContentPolicy {
  prohibitedHashes: Set<string>;
  prohibitedKeywords: string[];
  suspiciousPatterns: RegExp[];
}

export class ContentScanner extends EventEmitter {
  private policy: ContentPolicy;
  private hashDatabase: Map<string, string>;

  constructor() {
    super();
    this.policy = {
      prohibitedHashes: new Set(),
      prohibitedKeywords: [],
      suspiciousPatterns: [],
    };
    this.hashDatabase = new Map();
    this.loadPolicies();
  }

  private async loadPolicies(): Promise<void> {
    try {
      // Load prohibited content hashes (e.g., from NCMEC, IWF databases)
      // In production, this would connect to legitimate databases
      const hashes = await this.loadProhibitedHashes();
      hashes.forEach(hash => this.policy.prohibitedHashes.add(hash));

      // Load keyword filters
      this.policy.prohibitedKeywords = [
        // Add prohibited keywords here
        // Must be carefully curated to avoid false positives
      ];

      // Load suspicious patterns
      this.policy.suspiciousPatterns = [
        /\b(?:ponzi|pyramid)\s+scheme\b/i,
        /\b(?:money|cash)\s+laundering\b/i,
        // Add more patterns
      ];

      logger.info('Content policies loaded', {
        hashes: this.policy.prohibitedHashes.size,
        keywords: this.policy.prohibitedKeywords.length,
        patterns: this.policy.suspiciousPatterns.length,
      });
    } catch (error) {
      logger.error('Failed to load content policies:', error);
    }
  }

  async scanContent(content: Buffer | string): Promise<ScanResult> {
    const contentBuffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const contentHash = this.hashContent(contentBuffer);

    // Check against prohibited hashes
    if (this.policy.prohibitedHashes.has(contentHash)) {
      return {
        violationFound: true,
        violationType: 'prohibited_content',
        confidence: 1.0,
        hash: contentHash,
      };
    }

    // Check perceptual hashes for images
    if (this.isImage(contentBuffer)) {
      const perceptualHash = await this.generatePerceptualHash(contentBuffer);
      if (this.checkPerceptualHashMatch(perceptualHash)) {
        return {
          violationFound: true,
          violationType: 'prohibited_image',
          confidence: 0.95,
          hash: contentHash,
        };
      }
    }

    // Check text content
    if (this.isText(contentBuffer)) {
      const text = contentBuffer.toString('utf-8');
      const textViolation = this.scanText(text);
      if (textViolation.found) {
        return {
          violationFound: true,
          violationType: textViolation.type,
          confidence: textViolation.confidence,
          hash: contentHash,
        };
      }
    }

    return {
      violationFound: false,
      confidence: 0,
      hash: contentHash,
    };
  }

  private hashContent(content: Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private isImage(content: Buffer): boolean {
    // Check magic bytes for common image formats
    const signatures = {
      jpg: Buffer.from([0xFF, 0xD8, 0xFF]),
      png: Buffer.from([0x89, 0x50, 0x4E, 0x47]),
      gif: Buffer.from([0x47, 0x49, 0x46]),
      webp: Buffer.from([0x52, 0x49, 0x46, 0x46]),
    };

    for (const [format, signature] of Object.entries(signatures)) {
      if (content.slice(0, signature.length).equals(signature)) {
        return true;
      }
    }

    return false;
  }

  private isText(content: Buffer): boolean {
    // Simple heuristic: check if content is mostly printable ASCII
    let printable = 0;
    const sample = content.slice(0, Math.min(1000, content.length));

    for (const byte of sample) {
      if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
        printable++;
      }
    }

    return printable / sample.length > 0.8;
  }

  private async generatePerceptualHash(imageBuffer: Buffer): Promise<string> {
    // In production, use proper perceptual hashing (pHash, dHash, etc.)
    // This is a simplified version
    const hash = crypto.createHash('md5').update(imageBuffer).digest('hex');
    return hash;
  }

  private checkPerceptualHashMatch(hash: string): boolean {
    // Check against database of known prohibited image hashes
    // Would use hamming distance for fuzzy matching
    return this.hashDatabase.has(hash);
  }

  private scanText(text: string): {
    found: boolean;
    type?: string;
    confidence: number;
  } {
    const lowerText = text.toLowerCase();

    // Check prohibited keywords
    for (const keyword of this.policy.prohibitedKeywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return {
          found: true,
          type: 'prohibited_keyword',
          confidence: 0.9,
        };
      }
    }

    // Check suspicious patterns
    for (const pattern of this.policy.suspiciousPatterns) {
      if (pattern.test(text)) {
        return {
          found: true,
          type: 'suspicious_pattern',
          confidence: 0.8,
        };
      }
    }

    return { found: false, confidence: 0 };
  }

  async scanUrl(url: string): Promise<ScanResult> {
    try {
      // Check URL against known malicious domains
      const urlHash = this.hashContent(Buffer.from(url));
      
      if (this.isKnownMaliciousUrl(url)) {
        return {
          violationFound: true,
          violationType: 'malicious_url',
          confidence: 1.0,
          hash: urlHash,
        };
      }

      // Check URL patterns
      if (this.isSuspiciousUrlPattern(url)) {
        return {
          violationFound: true,
          violationType: 'suspicious_url',
          confidence: 0.7,
          hash: urlHash,
        };
      }

      return {
        violationFound: false,
        confidence: 0,
        hash: urlHash,
      };
    } catch (error) {
      logger.error('URL scan failed:', error);
      return {
        violationFound: false,
        confidence: 0,
        hash: '',
      };
    }
  }

  private isKnownMaliciousUrl(url: string): boolean {
    // In production, check against threat intelligence feeds
    const maliciousDomains = [
      // Would be loaded from external sources
    ];

    const urlObj = new URL(url);
    return maliciousDomains.includes(urlObj.hostname);
  }

  private isSuspiciousUrlPattern(url: string): boolean {
    const suspiciousPatterns = [
      /phishing/i,
      /fraud/i,
      /scam/i,
      // URL shorteners (can be abused)
      /bit\.ly|tinyurl|goo\.gl/i,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(url));
  }

  async reportViolation(
    violationHash: string,
    violationType: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // Store violation record without linking to specific shop
      const violationRecord = {
        violation_hash: violationHash,
        violation_type: violationType,
        detected_at: new Date(),
        metadata: metadata || {},
      };

      // Emit event for further processing
      this.emit('violation:detected', violationRecord);

      logger.warn('Content violation detected', {
        hash: violationHash.substring(0, 8),
        type: violationType,
      });
    } catch (error) {
      logger.error('Failed to report violation:', error);
    }
  }

  // Update policies periodically
  async updatePolicies(): Promise<void> {
    try {
      await this.loadPolicies();
      logger.info('Content policies updated');
    } catch (error) {
      logger.error('Failed to update policies:', error);
    }
  }

  private async loadProhibitedHashes(): Promise<string[]> {
    // In production, this would fetch from legitimate databases
    // such as NCMEC, IWF, or other authorized sources
    return [];
  }
}

export default ContentScanner;