import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { logger } from './utils/logger';

interface BTCPayConfig {
  apiUrl: string;
  apiKey?: string;
  useTor: boolean;
  torProxy?: string;
}

interface CreateInvoiceRequest {
  amount: number;
  currency: string;
  metadata?: Record<string, any>;
  checkout?: {
    speedPolicy?: 'HighSpeed' | 'MediumSpeed' | 'LowSpeed' | 'LowMediumSpeed';
    paymentMethods?: string[];
    defaultPaymentMethod?: string;
    expirationMinutes?: number;
    monitoringMinutes?: number;
    paymentTolerance?: number;
    redirectURL?: string;
    redirectAutomatically?: boolean;
    requiresRefundEmail?: boolean;
  };
}

interface Invoice {
  id: string;
  checkoutLink: string;
  status: string;
  amount: number;
  currency: string;
  cryptoInfo: Array<{
    cryptoCode: string;
    paymentMethod: string;
    rate: number;
    totalDue: string;
    networkFee: string;
    payments: any[];
    address: string;
  }>;
  metadata: Record<string, any>;
  checkout: Record<string, any>;
  createdTime: number;
  expirationTime: number;
  monitoringTime: number;
  receiptData: Record<string, any>;
}

export class BTCPayClient {
  private client: AxiosInstance;
  private config: BTCPayConfig;

  constructor(config: BTCPayConfig) {
    this.config = config;

    const axiosConfig: any = {
      baseURL: config.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // Add API key if provided
    if (config.apiKey) {
      axiosConfig.headers['Authorization'] = `token ${config.apiKey}`;
    }

    // Configure Tor proxy if enabled
    if (config.useTor && config.torProxy) {
      const agent = new SocksProxyAgent(config.torProxy);
      axiosConfig.httpAgent = agent;
      axiosConfig.httpsAgent = agent;
    }

    this.client = axios.create(axiosConfig);

    // Add request/response logging
    this.client.interceptors.request.use(
      (request) => {
        logger.debug('BTCPay request:', {
          method: request.method,
          url: request.url,
          // Don't log sensitive data
        });
        return request;
      },
      (error) => {
        logger.error('BTCPay request error:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug('BTCPay response:', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        logger.error('BTCPay response error:', {
          status: error.response?.status,
          data: error.response?.data,
        });
        return Promise.reject(error);
      }
    );
  }

  async createInvoice(
    storeId: string,
    request: CreateInvoiceRequest
  ): Promise<Invoice> {
    try {
      const response = await this.client.post(
        `/api/v1/stores/${storeId}/invoices`,
        {
          amount: request.amount.toString(),
          currency: request.currency,
          metadata: request.metadata || {},
          checkout: {
            speedPolicy: request.checkout?.speedPolicy || 'MediumSpeed',
            paymentMethods: request.checkout?.paymentMethods,
            defaultPaymentMethod: request.checkout?.defaultPaymentMethod,
            expirationMinutes: request.checkout?.expirationMinutes || 15,
            monitoringMinutes: request.checkout?.monitoringMinutes || 60,
            paymentTolerance: request.checkout?.paymentTolerance || 0,
            redirectURL: request.checkout?.redirectURL,
            redirectAutomatically: request.checkout?.redirectAutomatically,
            requiresRefundEmail: request.checkout?.requiresRefundEmail || false,
          },
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Failed to create invoice:', error);
      throw error;
    }
  }

  async getInvoice(storeId: string, invoiceId: string): Promise<Invoice> {
    try {
      const response = await this.client.get(
        `/api/v1/stores/${storeId}/invoices/${invoiceId}`
      );
      return response.data;
    } catch (error) {
      logger.error('Failed to get invoice:', error);
      throw error;
    }
  }

  async getInvoicePaymentMethods(
    storeId: string,
    invoiceId: string
  ): Promise<any[]> {
    try {
      const response = await this.client.get(
        `/api/v1/stores/${storeId}/invoices/${invoiceId}/payment-methods`
      );
      return response.data;
    } catch (error) {
      logger.error('Failed to get payment methods:', error);
      throw error;
    }
  }

  async markInvoiceAsInvalid(
    storeId: string,
    invoiceId: string
  ): Promise<void> {
    try {
      await this.client.post(
        `/api/v1/stores/${storeId}/invoices/${invoiceId}/mark-invalid`
      );
    } catch (error) {
      logger.error('Failed to mark invoice as invalid:', error);
      throw error;
    }
  }

  // Create anonymous store (for zero-knowledge marketplace)
  async createAnonymousStore(
    storeName: string,
    supportedCrypto: string[]
  ): Promise<{ storeId: string; apiKey: string }> {
    try {
      // Generate random store ID
      const storeId = crypto.randomBytes(16).toString('hex');
      
      // This would integrate with BTCPay's API to create a store
      // In production, this would need proper implementation
      const response = await this.client.post('/api/v1/stores', {
        name: storeName,
        defaultCurrency: 'USD',
        // Additional configuration
      });

      // Generate store-specific API key
      const apiKeyResponse = await this.client.post(
        `/api/v1/stores/${response.data.id}/api-keys`,
        {
          label: 'Shop API Key',
          permissions: [
            'btcpay.store.canviewinvoices',
            'btcpay.store.cancreateinvoice',
            'btcpay.store.canmodifyinvoices',
          ],
        }
      );

      return {
        storeId: response.data.id,
        apiKey: apiKeyResponse.data.apiKey,
      };
    } catch (error) {
      logger.error('Failed to create anonymous store:', error);
      throw error;
    }
  }

  // Configure payment methods for a store
  async configurePaymentMethods(
    storeId: string,
    cryptoCurrencies: string[]
  ): Promise<void> {
    try {
      for (const crypto of cryptoCurrencies) {
        await this.client.put(
          `/api/v1/stores/${storeId}/payment-methods/${crypto}`,
          {
            enabled: true,
            // Additional configuration per cryptocurrency
          }
        );
      }
    } catch (error) {
      logger.error('Failed to configure payment methods:', error);
      throw error;
    }
  }

  // Create payment request (for recurring payments)
  async createPaymentRequest(
    storeId: string,
    request: {
      amount?: number;
      title: string;
      description?: string;
      email?: string;
      currency: string;
      expiryDate?: number;
      embeddedCSS?: string;
      customCSSLink?: string;
      allowCustomPaymentAmounts?: boolean;
    }
  ): Promise<any> {
    try {
      const response = await this.client.post(
        `/api/v1/stores/${storeId}/payment-requests`,
        request
      );
      return response.data;
    } catch (error) {
      logger.error('Failed to create payment request:', error);
      throw error;
    }
  }

  // Get store wallet balance (for monitoring)
  async getWalletBalance(
    storeId: string,
    cryptoCode: string
  ): Promise<{
    balance: string;
    unconfirmedBalance: string;
  }> {
    try {
      const response = await this.client.get(
        `/api/v1/stores/${storeId}/payment-methods/${cryptoCode}/wallet`
      );
      return {
        balance: response.data.balance,
        unconfirmedBalance: response.data.unconfirmedBalance,
      };
    } catch (error) {
      logger.error('Failed to get wallet balance:', error);
      throw error;
    }
  }

  // Create pull payment (for refunds)
  async createPullPayment(
    storeId: string,
    request: {
      name: string;
      amount: string;
      currency: string;
      paymentMethods?: string[];
      description?: string;
      expiresAt?: number;
      autoApproveClaims?: boolean;
    }
  ): Promise<any> {
    try {
      const response = await this.client.post(
        `/api/v1/stores/${storeId}/pull-payments`,
        request
      );
      return response.data;
    } catch (error) {
      logger.error('Failed to create pull payment:', error);
      throw error;
    }
  }

  // Webhook management
  async createWebhook(
    storeId: string,
    url: string,
    events?: string[]
  ): Promise<{ id: string; url: string }> {
    try {
      const response = await this.client.post(
        `/api/v1/stores/${storeId}/webhooks`,
        {
          url,
          events: events || ['InvoiceCreated', 'InvoicePaymentSettled'],
          active: true,
        }
      );
      return response.data;
    } catch (error) {
      logger.error('Failed to create webhook:', error);
      throw error;
    }
  }

  // Verify webhook signature
  static verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

export default BTCPayClient;