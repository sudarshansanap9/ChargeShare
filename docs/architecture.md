# ChargeShare architecture

## Context
ChargeShare is a portfolio demonstration of a peer-to-peer EV charger marketplace. It does not operate physical chargers or process real payments.

## Logical components
1. React + TypeScript SPA: driver discovery, host management, booking pages, admin views.
2. FastAPI REST API: validates inputs, authenticates users, authorizes resources, and implements marketplace workflows.
3. PostgreSQL: durable relational store; SQLAlchemy models and Alembic migrations.
4. Leaflet: map UI using public OpenStreetMap tiles with required attribution.

## Trust boundaries
- Browser input is untrusted; validate on the server.
- JWT claims identify the principal but do not replace database-backed ownership/role checks.
- Secrets stay in environment variables and never enter frontend bundles or Git.
- Payment and charging state is simulated and must be visibly labelled.

## Booking invariants
- `ends_at` must be later than `starts_at`.
- An active charger cannot have overlapping approved bookings.
- Conflict detection and approval must be transaction-safe. A preflight availability check alone is insufficient under concurrency.
- Drivers may see their bookings; hosts may see bookings for their own chargers; admins can moderate.

## Deployment evolution
Local development uses SQLite by default for easy setup. Use PostgreSQL for integration testing and deployment. Replace `Base.metadata.create_all()` with Alembic migrations before deployment. Configure HTTPS, a strong random JWT secret, restrictive CORS, rate limits, backups, and secret management before any public use.
