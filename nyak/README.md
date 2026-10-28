# Quiet Barangay

Responsive anonymous incident reporting website and Node.js 24 backend for Cauayan City, Isabela. The existing HTML/CSS/JavaScript website is served by the Node server and stores records in SQLite using Node's built-in `node:sqlite` driver. Database schema changes are versioned in `migrations/` and applied transactionally at server startup.

## Local setup

No package install is needed. Copy `.env.example` values into your server environment. Example PowerShell setup:

```powershell
$env:QB_ADMIN_USER = 'admin'
$env:QB_ADMIN_NAME = 'System Administrator'
$env:QB_ADMIN_PASSWORD = 'use-a-unique-password-at-least-14-characters'
$env:QB_SESSION_SECRET = 'use-a-stable-random-secret-of-at-least-32-characters'
node server.js
```

Open <http://localhost:3000>. The first run creates the database, applies migrations, loads the 65 official Cauayan City barangay names, and creates the Administrator account with a scrypt password hash. The bootstrap account is created only when no official account exists. Changing the bootstrap environment value will not replace an existing password; use the privileged official account API for account maintenance.

Create additional officials while signed in as Administrator, or use the provisioning script after the server has initialized the database:
Create a custom admin account from **Officials Login → Access management** while signed in as an Administrator: enter its name, username, and password, select **Administrator**, then create the account. The initial Administrator uses the custom `QB_ADMIN_USER` and `QB_ADMIN_PASSWORD` values set before first startup. Additional officials can also be provisioned with the script after the server has initialized the database:

```powershell
$env:QB_SEED_NAME = 'Barangay Reviewer'
$env:QB_SEED_USERNAME = 'reviewer1'
$env:QB_SEED_PASSWORD = 'a-unique-password-at-least-14-characters'
$env:QB_SEED_ROLE = 'Reviewer' # Administrator, Reviewer, or Read-Only Official
$env:QB_SEED_BARANGAY = 'San Fermin' # optional scope
node scripts/seed-official.js
```

## Database and storage

The default database is `data/quiet-barangay.sqlite`; private evidence is stored in `data/uploads`. Set `QB_DB`, `QB_UPLOADS`, and `PORT` to change those locations. Keep both paths private and on persistent storage. The `migrations` directory is the schema history. SQLite uses WAL mode and foreign key checks. Monthly statistics are recalculated from source reports when a report is submitted or reviewed; annual summaries are queried from stored records.

Monthly plate statistics group by **incident month in Philippine time**. Annual reporting exposes both monthly incident trends and monthly intake trends: incident statistics use the incident date, while intake totals use submission date. Reports are allegations until an official verifies them. A potential duplicate is retained for review; a confirmed duplicate is linked to its original and excluded from unique incident and verified counts.

Make a database and evidence backup to a private destination:

```powershell
$env:QB_BACKUP_DIR = 'D:\PrivateBackups\QuietBarangay'
node scripts/backup.js
```

To rehearse recovery, stop the server, copy a backup's SQLite file and `uploads` directory to a new empty location, set `QB_DB` and `QB_UPLOADS` to those copied paths, then start the server and verify authorized report and evidence access. Keep the original database untouched until the restore has been checked. Schedule backups and define retention with the city's records and privacy policies.

## Authentication and deployment

Passwords use scrypt hashes. Officials use database-backed sessions, HTTP-only SameSite cookies, CSRF tokens, active-account checks, role permissions, optional barangay scoping, and audit records. Production requires a stable `QB_SESSION_SECRET`; production cookies are marked Secure. Login attempts, tracking lookups, and report submissions are rate-limited.

Deploy the Node server with persistent private storage and TLS. GitHub Pages only serves static files and cannot host this backend or database. If the visual frontend is moved to GitHub Pages, deploy this API and SQLite/PostgreSQL-compatible backend separately behind HTTPS; configure a narrowly scoped API origin and CORS policy before enabling cross-origin requests. Never place database credentials or official secrets in browser JavaScript.

The QR code is generated from the current website origin using the QR image service. Download it after opening the deployed HTTPS website. The hero photograph is hosted by Unsplash. Both require client internet access.

## API overview

- Public: `POST /api/reports`, `GET /api/reports/track/:referenceNumber`, `GET /api/public/announcements`, `GET /api/public/statistics`.
- Authentication: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- Officials: `GET /api/officials/reports`, `GET /api/officials/reports/:id`, `PATCH /api/officials/reports/:id/status`, `PATCH /api/officials/reports/:id/verification`, plate and analytics endpoints, and authorized CSV exports.
- The website's earlier `/api/admin/*` and `/api/updates` routes remain available for its existing frontend.

Official write requests require the session's `x-csrf-token` header. Public tracking returns only the reference, status, and generic status timeline; it never returns plate, description, evidence, or internal notes.

## Development checks

Run the automated backend suite with:

```powershell
node --test
```

Tests create an isolated temporary database and cover report validation, normalization, duplicate classification, status and monthly recalculation, Philippine-time month boundaries, annual totals, public privacy, role restrictions, concurrent writes, and CSV access.

## Current limitations

- SQLite is the chosen relational store because this project has no existing deployment stack or dependencies. It is suitable for a small single-server pilot; a multi-instance deployment should use PostgreSQL and shared private object storage.
- The QR image and hero image rely on external services.
- Backups are provided as an operator-run script; scheduling, off-site retention, and recovery drills must be configured by the deployment operator.
- The annual page offers print-to-PDF through the browser and CSV export. It uses the website's responsive chart styling rather than a separately bundled chart package.
- This repository cannot configure hosting, domain DNS, HTTPS certificates, or operational retention approvals.
