# Quickstart: Shopping Website (Development)

Prerequisites:
- Docker and Docker Compose (for local services)
- Python 3.11
- Node 18+ / npm or pnpm
- A Stripe test account (for payments) — set `STRIPE_API_KEY` in env

Steps:

1. Install backend deps and create virtualenv

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
```

2. Run database migrations and seed sample data (Postgres expected at `postgres://...`)

```powershell
# Example using alembic or Django migrations depending on implementation
# Set DATABASE_URL env var then:
# alembic upgrade head
# python backend/scripts/seed_catalog.py
```

3. Run backend (local dev)

```powershell
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

4. Run frontend

```bash
cd frontend
npm install
npm run dev
```

5. Simulate checkout in test mode
- Use the provided test card numbers for Stripe or the chosen payment provider
- Verify order flow completes and `order.status` becomes `paid`

Validation checklist:
- Browse catalog and search returns expected products
- Add items to cart and update quantities
- Start checkout and complete payment in test mode
- Confirm order record created and payment attempt logged

Troubleshooting:
- Check logs for `payment.succeeded` or `payment.failed` events
- Inspect `inventory.adjusted` events to ensure inventory was decremented on successful checkout
