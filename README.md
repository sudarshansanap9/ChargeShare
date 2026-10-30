# ChargeShare — EV Charging Marketplace

A portfolio-focused, web-first peer-to-peer EV charger marketplace. This repository starts with architecture, an API contract, a database model, and a runnable FastAPI backend foundation.

> **Safety and scope:** charging sessions and payments are simulated. This software does not control charging hardware, measure real electricity, or process real money. Use fictional/demo data only.

## Stack
- Backend: Python 3.11+, FastAPI, SQLAlchemy 2.x, PostgreSQL, Alembic
- Auth: Argon2 password hashing, JWT access tokens
- Frontend plan: React + TypeScript + Vite; Leaflet + OpenStreetMap
- Tests: pytest

## Repository layout
```text
chargeshare/
├── backend/
│   ├── app/
│   │   ├── api/routes/       # REST endpoints
│   │   ├── core/             # Settings, security
│   │   ├── db/               # Engine and session
│   │   ├── models/           # SQLAlchemy entities
│   │   ├── schemas/           # Request/response validation
│   │   ├── services/          # Business rules
│   │   └── main.py            # FastAPI entry point
│   ├── tests/
│   ├── requirements.txt
│   └── .env.example
├── frontend/src/              # Frontend implementation in next phase
├── docs/
│   ├── architecture.md
│   ├── erd.md
│   └── api-spec.md
└── README.md
```

## Quick start (backend)
Use Python 3.11 or newer. From the `chargeshare` directory:

### 1. Create virtual environment
Windows PowerShell:
```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

macOS/Linux:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
cp .env.example .env
```

### 2. Run in local demo mode
The initial scaffold defaults to SQLite so it runs without installing PostgreSQL. This is for local onboarding only. PostgreSQL is the intended shared development/production database.

```bash
uvicorn app.main:app --reload
```
Open http://127.0.0.1:8000/docs for interactive API docs and http://127.0.0.1:8000/health for health status.

### 3. Use PostgreSQL instead
Create a database named `chargeshare`, then edit `backend/.env`:
```env
DATABASE_URL=postgresql+psycopg://chargeshare_user:your_password@localhost:5432/chargeshare
```
For this first scaffold, tables are created automatically on startup. Before a production deployment, use Alembic migrations and remove automatic table creation.

### 4. Tests
```bash
pytest
```

## Current implementation status
- [x] Architecture and folder structure
- [x] Initial database entities and relationships
- [x] API contract documentation
- [x] Runnable FastAPI scaffold and health endpoint
- [x] Password hashing and JWT utility functions
- [ ] Registration/login routes and authorization dependencies
- [ ] Charger CRUD and search
- [ ] Conflict-safe booking workflow
- [ ] Simulated payments, reviews, admin workflows
- [ ] React UI and Leaflet map

## Important design rules
1. A user cannot grant themselves the `admin` role.
2. Hosts may update only their own charger listings.
3. Drivers may access only their own booking/payment data; hosts may access bookings for their own chargers.
4. Booking overlap must be prevented inside the database transaction, not only in frontend checks.
5. Never commit `.env`, JWT secrets, or real user data.
6. OpenStreetMap attribution must remain visible; respect tile usage policy.
