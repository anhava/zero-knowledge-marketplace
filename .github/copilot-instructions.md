# Copilot instructions (Zero-Knowledge Marketplace)

## Big picture (service boundaries)
- Multi-service, Docker-compose orchestrated platform; start point is [docker/docker-compose.yml](docker/docker-compose.yml).
- API Gateway (Express + TS): request routing, ZK auth, minimal platform DB writes. Entry: [src/api-gateway/src/index.ts](src/api-gateway/src/index.ts).
- Deployment Service: provisions per-shop isolated Docker stacks and Tor hidden services; uses a shop compose template in [src/deployment-service/docker-compose.shop-template.yml](src/deployment-service/docker-compose.shop-template.yml).
- Payment Service: creates BTCPay invoices via Tor and verifies payments using blind-signature-style tokens (privacy preserving). Core logic in [src/payment-service/src/payment-processor.ts](src/payment-service/src/payment-processor.ts) and BTCPay HTTP client in [src/payment-service/src/btcpay-client.ts](src/payment-service/src/btcpay-client.ts).
- ToS Enforcement: privacy-preserving scanning + canary triggers (hash-only outputs). See [src/tos-enforcement/src/content-scanner.ts](src/tos-enforcement/src/content-scanner.ts) and [src/tos-enforcement/src/canary-system.ts](src/tos-enforcement/src/canary-system.ts).

## Non-negotiable privacy invariants (project-specific)
- Do not introduce identifiers that correlate users ↔ shops ↔ invoices ↔ payments. Platform DB is intentionally “minimal by design”. See schema string in [src/api-gateway/src/database/index.ts](src/api-gateway/src/database/index.ts).
- Store secrets/tokens only as hashes (SHA-256) and store session material only encrypted (AES-256-GCM). See token hashing + encrypted session storage in [src/api-gateway/src/auth/zero-knowledge-auth.ts](src/api-gateway/src/auth/zero-knowledge-auth.ts) and crypto helpers in [src/api-gateway/src/utils/crypto.ts](src/api-gateway/src/utils/crypto.ts).
- Avoid logging anything identifying (IPs, shop IDs, invoice IDs). When logging identifiers, prefer truncated or hashed forms.

## Local dev workflows (what actually exists)
- Environment is driven by [.env.example](.env.example); API Gateway config loads ../../.env in [src/api-gateway/src/config/index.ts](src/api-gateway/src/config/index.ts) and throws if required env vars are missing.
- API Gateway dev loop (only service with a package.json today):
  - cd src/api-gateway
  - npm install
  - npm run dev | npm run build | npm test | npm run lint

## Code conventions and integration points
- Database access pattern: use the shared pool wrapper and parameterized SQL via database.query / database.transaction in [src/api-gateway/src/database/index.ts](src/api-gateway/src/database/index.ts).
- Tor integration pattern: outbound HTTP via SOCKS proxy agent (see BTCPay client Tor wiring in [src/payment-service/src/btcpay-client.ts](src/payment-service/src/btcpay-client.ts)); hidden service management via Tor control port in [src/deployment-service/src/tor-controller.ts](src/deployment-service/src/tor-controller.ts).
- Payment correlation avoidance: random BTCPay store selection comes from BTCPAY_STORE_POOL and is used in [src/payment-service/src/payment-processor.ts](src/payment-service/src/payment-processor.ts).

## Current repo gaps (don’t assume they exist)
- Several imports referenced by services are not present yet (e.g., API Gateway routes/middleware/cache and Payment/Deployment helper modules). If you add them, mirror the existing patterns (strict TS, minimal logging, no extra persistence).
- ZK proof verification is explicitly a placeholder (see verifyZKProof in [src/api-gateway/src/auth/zero-knowledge-auth.ts](src/api-gateway/src/auth/zero-knowledge-auth.ts)); do not present it as production-secure.
