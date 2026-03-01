# Zero-Knowledge Marketplace

**Idea:** Tuomas Piirainen / [Anhis Smart Innovations](https://anhis.fi/)/ tuomas@anhis.fi

**Updated:** 01.02.2025

**Last update:** Published as open-source code

A privacy-focused marketplace platform that enables users to create anonymous e-commerce shops on the Tor network with cryptocurrency payment integration, following zero-knowledge principles.

## 🔐 Key Features

- **Complete Anonymity**: All shops operate as Tor hidden services (.onion addresses)
- **Zero-Knowledge Architecture**: Platform has no access to user data or shop information
- **Cryptocurrency Only**: Bitcoin, Lightning Network, and other cryptocurrencies supported
- **Privacy by Design**: Client-side encryption, blind signatures, and minimal data retention
- **Automated Deployment**: One-click shop creation with isolated infrastructure
- **Terms of Service Enforcement**: Automated content monitoring without compromising privacy

## 🏗️ Architecture Overview

The platform consists of several isolated components:

1. **Control Panel**: Web interface for shop management (Tor-compatible)
2. **API Gateway**: Handles authentication and request routing
3. **Deployment Service**: Automates shop creation and management
4. **Payment Service**: Processes payments using blind signatures
5. **Tor Controller**: Manages .onion service creation

Each shop runs in complete isolation with its own:
- BTCPay Server instance
- PostgreSQL database
- Redis cache
- Tor hidden service
- Docker network

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Linux server (Ubuntu 20.04+ recommended)
- At least 8GB RAM and 100GB storage
- Domain name (for control panel)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/anhava/zero-knowledge-marketplace.git
cd zero-knowledge-marketplace
```

2. Copy and configure environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Generate required keys:
```bash
./scripts/generate-keys.sh
```

4. Start the platform:
```bash
docker-compose up -d
```

5. Initialize the database:
```bash
docker-compose exec api-gateway npm run db:migrate
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Domain Configuration
DOMAIN=your-domain.com
ACME_EMAIL=admin@your-domain.com

# Database
DB_USER=zkm_user
DB_PASSWORD=<generate-strong-password>

# Redis
REDIS_PASSWORD=<generate-strong-password>

# Security Keys
JWT_SECRET=<generate-256-bit-key>
ENCRYPTION_KEY=<generate-256-bit-key>
BLIND_SIGNATURE_KEY=<generate-key-pair>

# Tor Configuration
TOR_CONTROL_PASSWORD=<generate-strong-password>
TOR_ENABLED=true

# BTCPay Configuration
BTCPAY_STORE_POOL=store1,store2,store3
BTCPAY_WEBHOOK_SECRET=<generate-secret>

# Admin Access
ADMIN_TOKEN_HASH=<sha256-hash-of-admin-token>
```

### Supported Cryptocurrencies

Configure supported cryptocurrencies in `docker/configs/cryptocurrencies.json`:

```json
{
  "btc": {
    "name": "Bitcoin",
    "enabled": true,
    "lightning": true,
    "rpcUrl": "http://bitcoin-node:8332",
    "network": "mainnet"
  },
  "ltc": {
    "name": "Litecoin",
    "enabled": true,
    "lightning": false
  },
  "xmr": {
    "name": "Monero",
    "enabled": true,
    "lightning": false
  }
}
```

## 📘 API Documentation

### Authentication

All API requests require a JWT token obtained through the authentication endpoint:

```bash
POST /api/auth/login
{
  "blindedCredential": "<blinded-credential>",
  "proof": "<zero-knowledge-proof>"
}
```

### Shop Management

#### Create Shop
```bash
POST /api/shops
Authorization: Bearer <token>
{
  "encryptedConfig": "<encrypted-shop-configuration>",
  "cryptocurrencies": ["btc", "ltc"],
  "lightningEnabled": true
}
```

#### Get Shop Status
```bash
GET /api/shops/:shopId/status
Authorization: Bearer <token>
```

### Payment Processing

#### Create Payment
```bash
POST /api/payments
{
  "amount": 100.00,
  "currency": "USD",
  "encryptedShopId": "<encrypted-shop-id>"
}
```

#### Verify Payment
```bash
POST /api/payments/verify
{
  "paymentId": "<payment-id>",
  "blindedSignature": "<blinded-signature>"
}
```

## 🛡️ Security Considerations

### Privacy Features

1. **No User Accounts**: Authentication via zero-knowledge proofs
2. **Client-Side Encryption**: All sensitive data encrypted before transmission
3. **Blind Signatures**: Payment verification without transaction linkage
4. **Tor Integration**: All shops accessible only via .onion addresses
5. **Minimal Logging**: No IP addresses or identifying information logged

### Terms of Service Enforcement

The platform implements automated ToS enforcement through:

- Content hash matching against prohibited material
- Behavioral analysis for suspicious patterns
- Community reporting with privacy preservation
- Smart contract-based penalties

### Data Retention

- Payment records: 30 days (only paymentId stored)
- Authentication tokens: 24 hours
- Logs: 7 days (anonymized)
- Shop data: User-controlled (encrypted)

## 🚧 Development

### Running Locally

1. Install dependencies:
```bash
cd src/api-gateway && npm install
cd ../deployment-service && npm install
cd ../payment-service && npm install
cd ../frontend && npm install
```

2. Start development servers:
```bash
# Terminal 1: API Gateway
cd src/api-gateway && npm run dev

# Terminal 2: Deployment Service
cd src/deployment-service && npm run dev

# Terminal 3: Payment Service
cd src/payment-service && npm run dev

# Terminal 4: Frontend
cd src/frontend && npm run dev
```

### Testing

Run the test suite:
```bash
npm test
```

Run integration tests:
```bash
npm run test:integration
```

## 📊 Monitoring

The platform includes privacy-preserving monitoring:

- Prometheus metrics (anonymized)
- Health check endpoints
- Error tracking (no PII)
- Performance monitoring

Access monitoring dashboard:
```
http://localhost:9090  # Prometheus
http://localhost:3000  # Grafana
```

## 🔄 Backup & Recovery

### Automated Backups

Configure automated backups in `docker/configs/backup.yml`:

```yaml
backup:
  schedule: "0 2 * * *"  # Daily at 2 AM
  retention: 7  # Keep 7 days
  encryption: true
  destinations:
    - type: s3
      bucket: zkm-backups
      region: us-east-1
```

### Manual Backup

```bash
./scripts/backup.sh
```

### Recovery

```bash
./scripts/restore.sh <backup-id>
```

## 🤝 Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## ⚖️ Legal Compliance

This platform is designed for legitimate e-commerce use only. The Terms of Service strictly prohibit:

- Illegal goods or services
- Fraudulent activities
- Money laundering
- Any activity violating local laws

Platform operators should:
1. Implement robust ToS enforcement
2. Comply with local regulations
3. Maintain transparency reports
4. Cooperate with lawful requests (within privacy constraints)

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) for details.

## ⚠️ Disclaimer

This software is provided for educational and legitimate business purposes only. Users are responsible for complying with all applicable laws and regulations in their jurisdiction. The developers assume no liability for misuse of this platform.

## 🆘 Support

- Documentation: [docs.zkm.io](https://docs.zkm.io)
- Community: [forum.zkm.io](https://forum.zkm.io)
- Security Issues: security@zkm.io (PGP key available)

## 🗺️ Roadmap

- [ ] Multi-signature wallet support
- [ ] Decentralized governance (DAO)
- [ ] IPFS integration for content distribution
- [ ] Atomic swaps for direct crypto exchange
- [ ] Federation with other privacy marketplaces
- [ ] Mobile app (Tor-enabled)
- [ ] Hardware wallet integration
- [ ] Advanced analytics (privacy-preserving)
