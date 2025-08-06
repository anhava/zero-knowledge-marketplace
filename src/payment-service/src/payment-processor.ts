import { EventEmitter } from 'events';
import crypto from 'crypto';
import { BTCPayClient } from './btcpay-client';
import { BlindSignatureService } from './blind-signature';
import { PaymentVerifier } from './payment-verifier';
import { logger } from './utils/logger';
import { database } from './database';

interface PaymentRequest {
  amount: number;
  currency: string;
  shopId: string; // Encrypted
  metadata?: Record<string, any>;
}

interface PaymentResult {
  paymentId: string;
  invoiceId: string; // BTCPay invoice ID
  checkoutUrl: string;
  expiresAt: Date;
  blindedToken: string;
}

export class PaymentProcessor extends EventEmitter {
  private btcpayClient: BTCPayClient;
  private blindSigService: BlindSignatureService;
  private paymentVerifier: PaymentVerifier;

  constructor(
    btcpayClient: BTCPayClient,
    blindSigService: BlindSignatureService,
    paymentVerifier: PaymentVerifier
  ) {
    super();
    this.btcpayClient = btcpayClient;
    this.blindSigService = blindSigService;
    this.paymentVerifier = paymentVerifier;
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResult> {
    try {
      // Generate unique payment ID
      const paymentId = crypto.randomBytes(16).toString('hex');
      
      // Create blinded token for privacy
      const token = crypto.randomBytes(32).toString('hex');
      const blindedToken = await this.blindSigService.blindToken(token);

      // Create invoice without linking to shop
      const invoice = await this.createAnonymousInvoice(request);

      // Store minimal payment record
      await database.query(
        `INSERT INTO payments (payment_id, status, expires_at) 
         VALUES ($1, $2, $3)`,
        [paymentId, 'pending', invoice.expirationTime]
      );

      // Store blinded signature (no link to payment)
      await database.query(
        `INSERT INTO blind_signatures (signature_hash, expires_at) 
         VALUES ($1, $2)`,
        [
          crypto.createHash('sha256').update(blindedToken).digest('hex'),
          new Date(invoice.expirationTime)
        ]
      );

      logger.info('Payment created', { paymentId });

      return {
        paymentId,
        invoiceId: invoice.id,
        checkoutUrl: invoice.checkoutLink,
        expiresAt: new Date(invoice.expirationTime),
        blindedToken,
      };
    } catch (error) {
      logger.error('Failed to create payment:', error);
      throw error;
    }
  }

  private async createAnonymousInvoice(request: PaymentRequest): Promise<any> {
    // Create invoice without any identifying information
    const invoiceRequest = {
      amount: request.amount,
      currency: request.currency,
      metadata: {
        // Only non-identifying metadata
        type: 'marketplace_payment',
        timestamp: Date.now(),
      },
      checkout: {
        speedPolicy: 'MediumSpeed',
        expirationMinutes: 15,
        monitoringMinutes: 60,
        requiresRefundEmail: false,
      },
    };

    // Use a pool of BTCPay stores to prevent correlation
    const storeId = this.selectRandomStore();
    
    return await this.btcpayClient.createInvoice(storeId, invoiceRequest);
  }

  async verifyPayment(
    paymentId: string,
    blindedSignature: string
  ): Promise<{ valid: boolean; status: string }> {
    try {
      // Verify the blinded signature
      const signatureValid = await this.blindSigService.verifyBlindedSignature(
        blindedSignature
      );

      if (!signatureValid) {
        return { valid: false, status: 'invalid_signature' };
      }

      // Check payment status (without linking to specific invoice)
      const result = await database.query(
        'SELECT status FROM payments WHERE payment_id = $1',
        [paymentId]
      );

      if (result.rows.length === 0) {
        return { valid: false, status: 'not_found' };
      }

      const payment = result.rows[0];
      
      // Mark signature as used
      await database.query(
        'UPDATE blind_signatures SET used_at = CURRENT_TIMESTAMP WHERE signature_hash = $1',
        [crypto.createHash('sha256').update(blindedSignature).digest('hex')]
      );

      return {
        valid: payment.status === 'completed',
        status: payment.status,
      };
    } catch (error) {
      logger.error('Payment verification failed:', error);
      return { valid: false, status: 'error' };
    }
  }

  async processWebhook(payload: any, signature: string): Promise<void> {
    try {
      // Verify webhook signature
      const isValid = BTCPayClient.verifyWebhookSignature(
        JSON.stringify(payload),
        signature,
        process.env.BTCPAY_WEBHOOK_SECRET!
      );

      if (!isValid) {
        logger.warn('Invalid webhook signature');
        return;
      }

      // Process payment update without linking to shop
      if (payload.type === 'InvoicePaymentSettled') {
        await this.handlePaymentSettled(payload.invoiceId);
      } else if (payload.type === 'InvoiceExpired') {
        await this.handlePaymentExpired(payload.invoiceId);
      }
    } catch (error) {
      logger.error('Webhook processing failed:', error);
    }
  }

  private async handlePaymentSettled(invoiceId: string): Promise<void> {
    // Update payment status without linking invoice to payment
    // This maintains privacy by not correlating specific invoices to payments
    
    // In production, use more sophisticated matching that maintains privacy
    logger.info('Payment settled', { invoiceId: invoiceId.substring(0, 8) });
    
    this.emit('payment:settled', { timestamp: Date.now() });
  }

  private async handlePaymentExpired(invoiceId: string): Promise<void> {
    logger.info('Payment expired', { invoiceId: invoiceId.substring(0, 8) });
    
    this.emit('payment:expired', { timestamp: Date.now() });
  }

  private selectRandomStore(): string {
    // In production, maintain a pool of BTCPay stores
    // and randomly select one to prevent correlation
    const stores = process.env.BTCPAY_STORE_POOL?.split(',') || [];
    return stores[Math.floor(Math.random() * stores.length)];
  }

  async cleanupExpiredPayments(): Promise<void> {
    try {
      const result = await database.query(
        `DELETE FROM payments 
         WHERE status = 'pending' 
         AND expires_at < CURRENT_TIMESTAMP`
      );

      logger.info(`Cleaned up ${result.rowCount} expired payments`);
    } catch (error) {
      logger.error('Failed to cleanup expired payments:', error);
    }
  }

  // Generate payment proof for zero-knowledge verification
  async generatePaymentProof(paymentId: string): Promise<{
    proof: string;
    publicInputs: string[];
  }> {
    // This would implement a zero-knowledge proof that the payment
    // was made without revealing the payer or recipient
    
    const paymentData = await database.query(
      'SELECT created_at, status FROM payments WHERE payment_id = $1',
      [paymentId]
    );

    if (paymentData.rows.length === 0) {
      throw new Error('Payment not found');
    }

    // Generate proof (simplified - in production use ZK-SNARKs)
    const proof = crypto.createHash('sha256')
      .update(paymentId)
      .update(paymentData.rows[0].created_at.toString())
      .update(paymentData.rows[0].status)
      .digest('hex');

    return {
      proof,
      publicInputs: [
        crypto.createHash('sha256').update(paymentId).digest('hex'),
        paymentData.rows[0].status,
      ],
    };
  }

  // Batch payment verification for efficiency
  async batchVerifyPayments(
    paymentIds: string[]
  ): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    try {
      const query = `
        SELECT payment_id, status 
        FROM payments 
        WHERE payment_id = ANY($1)
      `;
      
      const result = await database.query(query, [paymentIds]);
      
      for (const row of result.rows) {
        results.set(row.payment_id, row.status === 'completed');
      }

      // Set false for any missing payments
      for (const paymentId of paymentIds) {
        if (!results.has(paymentId)) {
          results.set(paymentId, false);
        }
      }

      return results;
    } catch (error) {
      logger.error('Batch verification failed:', error);
      // Return all as false on error
      return new Map(paymentIds.map(id => [id, false]));
    }
  }
}

export default PaymentProcessor;