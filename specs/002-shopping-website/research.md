# Research: Shopping Website Technical Decisions

This document records research decisions that resolve the `NEEDS CLARIFICATION` items from the plan.

## Decision 1: Backend Language & Framework

- Decision: Use Python 3.11 with FastAPI for backend services.
- Rationale: The repository already contains a Python/FastAPI backend (`backend/main.py`, `backend/app`), which reduces onboarding and reuse of existing components. FastAPI provides async endpoints, clear typing, and strong OpenAPI support which helps API-driven frontend development.
- Alternatives considered:
  - Node.js + TypeScript (Express/Nest/Vite + tRPC): good developer ergonomics and frontend alignment, but duplicates backend effort in this repository.

## Decision 2: Frontend Stack

- Decision: Use existing React + TypeScript frontend present in the repository (`frontend/`) with Vite.
- Rationale: The workspace already contains a React + TypeScript frontend scaffold; reuse speeds delivery and aligns with team knowledge.

## Decision 3: Payment Provider

- Decision: Integrate Stripe (Payments + Checkout) in test mode for development and production Stripe with PCI-compliant flows (Stripe Elements or hosted Checkout session).
- Rationale: Stripe provides well-documented SDKs, robust test tooling, clear PCI scope reduction patterns, and broad global support.
- Alternatives: Adyen, Braintree; considered but not selected for MVP.

## Decision 4: Search/Indexing

- Decision: Start with Postgres full-text search (GIN indexes) for MVP product discovery; evaluate Typesense/Elasticsearch if performance or advanced ranking features are needed.
- Rationale: Simpler operationally, lower cost for initial scale, adequate for catalog sizes typical of MVPs.

## Decision 5: Inventory Consistency

- Decision: Implement optimistic reservation with a short-lived cart reservation and transactional decrement at checkout; fallback to a pessimistic lock for high-value SKUs if needed.
- Rationale: Optimistic reservations scale better and align with typical ecommerce patterns; atomic checkout decrements prevent oversell if combined with transactional checks.
- Alternatives: Pessimistic locks (row-level), distributed lock services — higher complexity and operational cost.

## Decision 6: Deployment Model

- Decision: Use Docker images and support both Docker Compose for local dev and a managed container service (ECS/EKS/GKE) for production. Provide Kubernetes manifests as optional artifacts in `infrastructure/k8s/`.
- Rationale: Flexibility for teams with varying cloud preferences; Docker Compose speeds local development and testing.

## Decision 7: Authentication

- Decision: Use secure HttpOnly session cookies for customer sessions on the web frontend and short-lived JWTs for API-to-service authentication where needed. Allow optional social login (OAuth) as an extension.
- Rationale: Cookies simplify browser flows and CSRF protection; JWTs useful for service-to-service authentication.

## Decision 8: Observability

- Decision: Use structured logging (JSON) + Sentry for error aggregation + Prometheus/Grafana for metrics and alerting. Instrument key business events (cart add, checkout start, payment success/failure, inventory change).
- Rationale: Standard, well-supported observability stack; Sentry provides fast alerting for exceptions.

## Decision 9: Testing & Tooling

- Decision: Backend: pytest + pytest-asyncio, frontend: Vitest + React Testing Library. Use contract tests for API stability and end-to-end smoke tests for purchase flows (Cypress or Playwright optional).
- Rationale: Matches common Python + React testing ecosystems and provides both unit and integration verification.

## Performance & SLOs (proposed)

- Availability: 99.9% for critical path (browse → cart → checkout)
- API latency: 95th percentile < 800ms, median < 200-300ms for catalog reads
- Error budget and monitoring to be defined in `data-model.md` / quickstart during Phase 1 design.

## Next Steps

- Codify the data model (Product, Cart, Order, InventoryRecord, PaymentAttempt) in `data-model.md`.
- Create `contracts/` describing API endpoints for catalog, cart, checkout, and orders.
- Draft `quickstart.md` with dev run steps, test card use, and a validation checklist.

**End of research decisions**
