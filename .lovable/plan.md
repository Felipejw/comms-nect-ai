

## Fix: Self-Hosted Installation - 3 Critical Issues

### Status: Attempt 4 - Definitive Fix

### Issues Identified & Fixed

#### Issue 1: Auth SASL Password Mismatch (CRITICAL)
**Symptom:** `failed SASL auth (FATAL: password authentication failed for user "supabase_auth_admin")`
**Root Cause:** The install script tested TCP connectivity using `psql -U supabase_auth_admin -h 127.0.0.1` which used `trust` auth from pg_hba.conf (localhost exemption). This masked the real problem: the role passwords didn't match `POSTGRES_PASSWORD`. When GoTrue connects from another container via Docker network, it uses SCRAM-SHA-256 auth which requires the correct password.
**Fix:** Added explicit `ALTER ROLE ... WITH PASSWORD` for all service roles (supabase_auth_admin, supabase_storage_admin, authenticator, supabase_admin) after roles are confirmed. Also changed the TCP test to use `PGPASSWORD` env var to test real password auth.

#### Issue 2: Frontend Not Building
**Symptom:** `npm não encontrado. Instale Node.js ou copie o frontend compilado manualmente`
**Root Cause:** Server doesn't have Node.js/npm installed.
**Fix:** Instead of requiring Node.js on the host, the script now uses Docker to build the frontend: `docker run --rm node:20-alpine sh -c "npm install && npm run build"` with the correct Vite env vars passed.

#### Issue 3: Kong/Nginx Cascade Failure
**Symptom:** Kong never starts, Nginx can't proxy, site shows ERR_CONNECTION_REFUSED
**Root Cause:** In docker-compose.yml, Kong has `depends_on: auth: condition: service_healthy`. If Auth is unhealthy, Kong never starts, which blocks everything.
**Fix:** Changed Kong's dependency on Auth from `service_healthy` to `service_started`. Kong can start immediately and will route to Auth once it's ready.

### Changed Files
1. `deploy/docker-compose.yml` - Kong depends_on auth changed to service_started
2. `deploy/scripts/install-unified.sh` - Password sync, Docker-based frontend build, password-verified TCP test

### Run Command
```bash
cd /opt/sistema
git pull origin main
cd deploy
docker compose --profile baileys down -v 2>/dev/null || true
sudo rm -rf volumes/db/data
sudo bash scripts/install-unified.sh
```
