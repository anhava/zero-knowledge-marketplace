# Contributing to Zero-Knowledge Marketplace

Thank you for your interest in contributing to the Zero-Knowledge Marketplace. This project deals with **financial transactions**, **anonymity**, and **cryptography**. Therefore, we have strict guidelines to ensure the security and privacy of the platform remains intact.

By contributing, you agree that your code will be licensed under the MIT License of this project.

## 🛡️ Security First

**Do not open public GitHub issues for security vulnerabilities.**

If you discover a security issue (e.g., PII leakage, de-anonymization vectors, blind signature forgery), please report it privately:
*   **Email:** tuomas@anhis.fi
*   **Encryption:** Please use our PGP key (available in the repo or keyserver) for sensitive communication.

## 🏗️ Architecture Awareness

Before writing code, please read [ARCHITECTURE.md](ARCHITECTURE.md). You must understand the isolation model:
1.  **Zero-Knowledge:** The platform database must *never* store user data, product details, or transaction amounts. Only `payment_id` is allowed.
2.  **Service Isolation:** The `Deployment Service`, `Payment Service`, and `API Gateway` run in isolated containers.
3.  **Tor Integration:** All frontend and backend communication limits exposure to the clearnet.

## 🛠️ Development Environment

To contribute, you need a local environment that mirrors our production stack:

1.  **Prerequisites:**
    *   Docker & Docker Compose
    *   Node.js (LTS version)
    *   Tor Browser (for testing frontend .onion compatibility)

2.  **Setup:**
    Follow the "Running Locally" steps in the README:
    ```bash
    # Install dependencies across all microservices
    npm run install:all # (Assuming a root script, otherwise install per folder)
    
    # Start the stack
    docker-compose up -d
    ```

## 💻 Contribution Guidelines

### 1. Code Standards
*   **Backend:** Use async/await and strict typing where possible. Run `npm run lint` before committing.
*   **Frontend:** Ensure no external scripts (google analytics, fonts, CDNs) are loaded. **Everything must be self-hosted** to prevent IP leaks.
*   **Database:** Migrations must be reversible. Never add columns that store plain-text PII.

### 2. Cryptography & Payments
*   If modifying the **Payment Service**, you must verify that **Blind Signatures** remain valid.
*   Do not roll your own crypto. Use standard libraries (e.g., `tweetnacl`, `libsecp256k1`).
*   Ensure all new payment gateways support **Tor proxies** (SOCKS5).

### 3. Testing
We require tests for all new features, especially regarding privacy preservation.
*   **Unit Tests:** `npm test`
*   **Integration Tests:** `npm run test:integration` explains how different docker containers interact.

### 4. Submitting a Pull Request (PR)
1.  Fork the repo and create your branch from `main`.
2.  If you've added code that should be tested, add tests.
3.  Ensure your code passes the test suite.
4.  Update the documentation if you change API endpoints or `ENV` variables.
5.  **Description:** Clearly describe *why* this change is needed and how it affects privacy/isolation.

## 🚫 Prohibited Contributions

To comply with our Legal & Ethical standards, we will **close and lock** PRs that:
*   Add logic to log IP addresses or user browser fingerprints.
*   Facilitate illegal activity specifically prohibited in the Terms of Service.
*   Remove or weaken the "Terms of Service Enforcement" modules (Content hash matching).
*   Add dependencies that phone home to third-party servers.

## 🤝 Community

*   Be respectful and professional.
*   Focus on technical excellence and privacy.
*   Feedback is welcome!

***
*Dev Note: This project is maintained by Tuomas Piirainen / Anhis Smart Innovations.*
```
