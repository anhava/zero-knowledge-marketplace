# CLAUDE.md - Zero-Knowledge Marketplace

## 1. Project Identity

**Name**: Zero-Knowledge Marketplace (ZKM)
**Purpose**: Privacy-focused marketplace platform enabling anonymous e-commerce shops on Tor with cryptocurrency payments
**Architecture**: Multi-service Docker-based platform with zero-knowledge principles
**Author**: Tuomas Piirainen

---

## 2. Technology Stack

### 2.1 Backend Services
- **Runtime**: Node.js with TypeScript 5.3
- **Framework**: Express.js 4.18
- **Database**: PostgreSQL 15 (minimal data storage)
- **Cache**: Redis 7
- **Network**: Tor integration (SOCKS proxy)

### 2.2 Cryptography
- **ZK Proofs**: Simplified Schnorr-like proofs (placeholder for zk-SNARKs)
- **Signatures**: Blind signatures for payment privacy
- **Encryption**: AES-256-GCM for session data
- **JWT**: HS256 for authentication tokens
- **Libraries**: `tweetnacl`, `node-forge`, `blind-signatures`

### 2.3 Infrastructure
- **Containerization**: Docker Compose
- **Reverse Proxy**: Traefik with Let's Encrypt
- **Tor**: dperson/torproxy for hidden services
- **Payments**: BTCPay Server integration
- **Monitoring**: Prometheus (privacy-preserving metrics)

---

## 3. Project Structure

```
zero-knowledge-marketplace/
├── docker/
│   └── docker-compose.yml      # Main orchestration
├── src/
│   ├── api-gateway/            # Main API service
│   │   └── src/
│   │       ├── index.ts        # Express server
│   │       ├── auth/           # ZK authentication
│   │       ├── config/         # Configuration
│   │       ├── database/       # PostgreSQL client
│   │       └── utils/          # Crypto utilities
│   ├── deployment-service/     # Shop provisioning
│   │   └── src/
│   │       ├── index.ts
│   │       └── tor-controller.ts
│   ├── payment-service/        # Payment processing
│   │   └── src/
│   │       ├── btcpay-client.ts
│   │       └── payment-processor.ts
│   └── tos-enforcement/        # Content moderation
│       └── src/
│           ├── canary-system.ts
│           └── content-scanner.ts
├── .env.example                # Environment template
├── ARCHITECTURE.md             # Detailed architecture docs
└── README.md                   # Project overview
```

---

## 4. Core Services

### 4.1 API Gateway (`src/api-gateway/`)

**Entry**: `src/api-gateway/src/index.ts`

**Routes**:
- `POST /api/auth/challenge` - Generate ZK authentication challenge
- `POST /api/auth/verify` - Verify ZK proof and issue JWT
- `POST /api/shops` - Create anonymous shop
- `GET /api/shops/:id/status` - Check shop deployment status
- `POST /api/payments` - Create payment request
- `POST /api/payments/verify` - Verify payment with blind signature

**Security Middleware**:
- Helmet (CSP, HSTS)
- CORS (configurable origins)
- Rate limiting (100 req/15min, 5 auth attempts/15min)
- Request ID tracking

### 4.2 Zero-Knowledge Authentication

**File**: `src/api-gateway/src/auth/zero-knowledge-auth.ts`

**Flow**:
1. Client requests challenge (`/api/auth/challenge`)
2. Server generates random 32-byte challenge (5min expiry)
3. Client generates ZK proof (commitment, challenge, response)
4. Server verifies proof cryptographically
5. On success: JWT issued, session data encrypted with AES-256-GCM

**Note**: Current ZK verification is simplified. Production should use:
- zk-SNARKs (e.g., snarkjs, circom)
- Bulletproofs
- Proper elliptic curve Schnorr proofs

### 4.3 Payment Service (`src/payment-service/`)

**File**: `src/payment-service/src/payment-processor.ts`

**Privacy Features**:
- Blind signatures for payment tokens
- Random BTCPay store selection (prevents correlation)
- No shop-to-payment linking in database
- Minimal data retention (only paymentId, status, expiry)

**Payment Flow**:
1. Client requests payment with encrypted shop ID
2. Server generates `paymentId` + blinded token
3. BTCPay invoice created anonymously
4. Only `paymentId` stored in platform DB
5. Verification via blind signature (no invoice correlation)

### 4.4 Deployment Service (`src/deployment-service/`)

**Responsibilities**:
- Docker container orchestration for shops
- Tor hidden service (.onion) generation
- BTCPay Server provisioning
- Isolated network setup per shop

---

## 5. Database Schema (Minimal by Design)

```sql
-- Only payment IDs stored (no amounts, no user data)
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY,
    status VARCHAR(20),
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Blind signatures (no link to payments)
CREATE TABLE blind_signatures (
    signature_hash VARCHAR(64) PRIMARY KEY,
    used_at TIMESTAMP,
    expires_at TIMESTAMP
);

-- Auth tokens (hashed, not plaintext)
CREATE TABLE auth_tokens (
    token_hash VARCHAR(64) PRIMARY KEY,
    encrypted_data TEXT,  -- AES-256-GCM encrypted session
    expires_at TIMESTAMP
);
```

**Key Principle**: No correlation between payments, shops, or users.

---

## 6. Security Model

### 6.1 Zero-Knowledge Principles
- Platform cannot link payments to shops
- No user PII stored anywhere
- All shop data encrypted client-side
- Tor routing for all traffic

### 6.2 Cryptographic Measures
- AES-256-GCM for session encryption
- Blind signatures for payment privacy
- Token hashing (never store plaintext tokens)
- Challenge-response authentication (5min expiry)

### 6.3 Rate Limiting
- General API: 100 requests per 15 minutes
- Auth endpoints: 5 attempts per 15 minutes (skip on success)

---

## 7. Development Commands

```bash
# Start all services
docker-compose -f docker/docker-compose.yml up -d

# API Gateway development
cd src/api-gateway
npm install
npm run dev          # nodemon + ts-node

# Run tests
npm test             # Jest

# Lint
npm run lint         # ESLint

# Build for production
npm run build        # tsc
npm start            # node dist/index.js
```

---

## 8. Environment Variables

See `.env.example` for complete list. Key variables:

```bash
# Database
DB_USER=zkm_platform
DB_PASSWORD=<strong-password>

# Security Keys
JWT_SECRET=<256-bit-hex>
ENCRYPTION_KEY=<256-bit-hex>
BLIND_SIGNATURE_PRIVATE_KEY=<key>

# Tor
TOR_CONTROL_PASSWORD=<password>
TOR_ENABLED=true

# BTCPay
BTCPAY_STORE_POOL=store1,store2,store3
BTCPAY_WEBHOOK_SECRET=<secret>

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## 9. Current Status & Known Issues

### 9.1 Implemented
- Express API Gateway with security middleware
- Zero-knowledge authentication (simplified)
- Payment processing with blind signatures
- Docker Compose orchestration
- Tor proxy integration
- BTCPay Server client

### 9.2 Known Limitations

1. **ZK Proof Verification** (line 148 in `zero-knowledge-auth.ts`)
   ```typescript
   return verification[0] < 128; // 50% chance - replace with real verification
   ```
   - Current implementation is a placeholder
   - Needs proper Schnorr/zk-SNARK implementation

2. **Payment-Shop Correlation**
   - `handlePaymentSettled()` doesn't update specific payments
   - Needs privacy-preserving matching mechanism

3. **Missing Frontend**
   - React/Next.js control panel not yet implemented
   - Client-side encryption library needed

4. **ToS Enforcement**
   - `canary-system.ts` and `content-scanner.ts` are stubs
   - Hash-based content detection not implemented

---

## 10. Code Conventions

### 10.1 TypeScript
- Strict mode enabled
- Interfaces for all data structures
- Async/await for all async operations
- Proper error handling with try/catch

### 10.2 Logging
- Use `logger` from `./utils/logger` (Winston)
- Log levels: error, warn, info, debug
- Never log sensitive data (tokens, keys, proofs)

### 10.3 Security
- Always hash tokens before storage
- Encrypt session data with AES-256-GCM
- Use crypto.randomBytes for all random values
- Validate all inputs with Joi

---

## 11. Implementation Roadmap

### Phase 1 (Current)
- [x] API Gateway structure
- [x] ZK authentication flow
- [x] Payment service with blind signatures
- [x] Docker Compose setup

### Phase 2
- [ ] Proper zk-SNARK implementation
- [ ] Frontend control panel
- [ ] Tor hidden service automation
- [ ] BTCPay integration testing

### Phase 3
- [ ] Multi-cryptocurrency support
- [ ] IPFS integration
- [ ] ToS enforcement system
- [ ] Production hardening

### Phase 4
- [ ] Decentralized governance (DAO)
- [ ] Federation with other platforms
- [ ] Mobile app support

---

## 12. Testing

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Manual API testing
curl -X POST http://localhost:3000/api/auth/challenge
curl -X POST http://localhost:3000/api/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"challengeId": "...", "proof": {...}}'
```

---

## 13. Deployment

### Production Checklist
- [ ] Generate all keys with `openssl rand -hex 32`
- [ ] Configure real BTCPay Server instances
- [ ] Set up Tor hidden service for API
- [ ] Enable PostgreSQL SSL
- [ ] Configure Prometheus alerts
- [ ] Review rate limiting settings
- [ ] Test blind signature verification

### Docker Deployment
```bash
# Production build
docker-compose -f docker/docker-compose.yml up -d --build

# View logs
docker-compose logs -f api-gateway

# Scale services
docker-compose up -d --scale payment-service=3
```

---

**Version**: 1.0
**Last Updated**: December 2025
**Status**: Early development (Phase 1)
