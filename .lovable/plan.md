

## Fix: Stop init.sql from Crashing PostgreSQL

### Root Cause

The `init.sql` is mounted at `/docker-entrypoint-initdb.d/99-custom-init.sql`. PostgreSQL's docker-entrypoint runs all `.sql` files in that directory with `psql -v ON_ERROR_STOP=1`. This means **any unhandled error** in our script kills the entire PostgreSQL initialization process, including the Supabase internal scripts that create essential roles (`supabase_auth_admin`, `authenticator`, etc.).

Evidence from the logs:
- `(0 rows)` for roles query -- the internal Supabase scripts that create these roles were interrupted
- `connection refused` on port 5432 -- PostgreSQL crashed during init and is restarting
- The init.sql verification check also failed -- confirming PostgreSQL was down

Even though we wrapped some operations in exception handlers, there are still ~20 `CREATE TRIGGER` statements and ~50 `CREATE POLICY` statements outside exception blocks that can produce errors and trigger `ON_ERROR_STOP`.

### Solution: Run init.sql AFTER PostgreSQL is Fully Up

Instead of running init.sql as part of PostgreSQL's boot sequence (where errors are fatal), we run it manually AFTER the database is fully healthy and all internal roles are created.

### Changes (2 files)

#### 1. `deploy/docker-compose.yml`
- Change the volume mount from `/docker-entrypoint-initdb.d/99-custom-init.sql` to `/docker-entrypoint-initdb.d/migrations/init.sql`
- This path is NOT auto-executed by docker-entrypoint (only files directly in the directory root are executed, not subdirectories)
- The Supabase internal init scripts run normally without interference

#### 2. `deploy/scripts/install-unified.sh`
Restructure the `start_services()` function:
- After DB passes healthcheck, wait for Supabase internal init to complete by checking for the `supabase_auth_admin` role (instead of checking for `public.tenants` which we haven't created yet)
- Run init.sql manually via `docker exec supabase-db psql -U postgres -f /docker-entrypoint-initdb.d/migrations/init.sql` (without ON_ERROR_STOP, so errors are warnings not crashes)
- Only THEN start the Auth container
- Remove the old init.sql completion check and the manual role creation fallback (they become unnecessary)

### Technical Details

New startup flow:

```text
1. Start DB container
2. Wait for pg_isready (healthcheck)
3. Wait for supabase_auth_admin role to exist (confirms internal init completed)
4. Run our init.sql via docker exec (non-fatal errors)
5. Verify public.tenants table exists (confirms our init succeeded)
6. Start Auth container (all roles + schemas ready)
7. Wait for Auth healthy
8. Start remaining services
```

Key difference: Our init.sql runs via `docker exec psql` where errors are just warnings, NOT via `docker-entrypoint` where errors kill PostgreSQL.

### Expected Result

- Supabase internal init scripts run without interference, creating all required roles
- Our init.sql runs safely after everything is set up, creating tables and policies
- Auth starts and immediately connects successfully (roles already exist)
- Kong starts and becomes healthy
- Admin user creation works via API

