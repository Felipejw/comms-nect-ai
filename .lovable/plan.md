

## Fix: PostgreSQL Crashing After init.sql Execution

### Status: Attempt 3

### Root Cause (Updated)

Previous fixes resolved the init.sql auto-execution problem (roles now exist, init.sql runs successfully). However, **PostgreSQL becomes unavailable via TCP immediately after init.sql completes**.

Evidence:
- `[OK] init.sql executado com sucesso - tabelas criadas` ✓
- `ROLES NO BANCO: 9 rows` ✓ (all roles present)
- Auth immediately gets `connection refused` on TCP port 5432 ✗
- Server has only **3GB RAM** (minimum recommended: 4GB)

Most likely cause: **PostgreSQL OOM-killed or crashes** under memory pressure from creating ~50 policies + ~20 triggers + 3 publications with `wal_level=logical` and `max_connections=200` on a 3GB server.

### Changes Made (Attempt 3)

#### 1. `deploy/docker-compose.yml` - PostgreSQL Memory Tuning
- Reduced `max_connections` from 200 → 100 (saves ~200MB RAM)
- Added `shared_buffers=128MB` (default was 128MB but explicit is safer)
- Added `effective_cache_size=256MB`
- Added `work_mem=4MB` (prevents per-query memory spikes)
- Added `maintenance_work_mem=64MB`
- Added explicit `listen_addresses=*` (ensures TCP listening on all interfaces)

#### 2. `deploy/scripts/install-unified.sh` - Post-init.sql Verification
Added **ETAPA 1d** after init.sql:
- Checks `dmesg` for OOM-kill events targeting PostgreSQL
- Checks container restart count
- Tests TCP connectivity as `supabase_auth_admin` (simulates exactly what Auth does)
- Waits up to 60s for DB to recover if TCP fails
- Shows detailed logs and diagnostics if DB is down

### Expected Behavior

With these changes:
- PostgreSQL uses significantly less memory (suitable for 3GB servers)
- If PostgreSQL crashes after init.sql, the script detects it and waits for recovery
- Detailed diagnostics help identify the exact failure cause
- Auth only starts after TCP connectivity is confirmed

### Run Command
```bash
cd /opt/sistema
git pull origin main
cd deploy
docker compose --profile baileys down -v 2>/dev/null || true
sudo rm -rf volumes/db/data
sudo bash scripts/install-unified.sh
```
