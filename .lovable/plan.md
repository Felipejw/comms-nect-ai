

## Comprehensive Fix: Self-Hosted Installation - 3 Remaining Errors

### Analysis of Each Error

---

### Error 1: SASL Password Authentication Failed

**What you see:**
```
ALTER ROLE
ALTER ROLE
ALTER ROLE
ERROR:  must be superuser to alter superuser roles or change superuser attribute
[WARN] Falha ao sincronizar senhas (continuando...)
[OK] Senhas das roles sincronizadas    <-- FALSE: passwords were NOT saved
```

Then Auth crashes with:
```
failed SASL auth (FATAL: password authentication failed for user "supabase_auth_admin")
```

**Root Cause:** The install script runs all 4 ALTER ROLE statements in a SINGLE `psql -c` command:
```bash
docker exec supabase-db psql -U postgres -c "
    ALTER ROLE supabase_auth_admin WITH PASSWORD '...';
    ALTER ROLE supabase_storage_admin WITH PASSWORD '...';
    ALTER ROLE authenticator WITH PASSWORD '...';
    ALTER ROLE supabase_admin WITH PASSWORD '...';
"
```

When PostgreSQL receives multiple statements in a single `-c` argument, it processes them in a single implicit transaction. The 4th statement (`supabase_admin`) fails because it's a superuser role that cannot be altered by the `postgres` user in this Docker image. **This error ABORTS the entire transaction, rolling back ALL 4 password changes** -- including the ones that appeared to succeed.

Additionally, the TCP password test uses `psql -h 127.0.0.1` from INSIDE the container. The Supabase pg_hba.conf uses `trust` authentication for localhost connections, meaning **the password is never actually verified**. The test always passes regardless.

**Fix:** Run each ALTER ROLE as a separate command so failures don't cascade. Skip `supabase_admin` since it's a superuser. Test the password from the Docker network (not localhost) to simulate what Auth actually does.

---

### Error 2: Kong YAML Parse Error

**What you see:**
```
failed parsing declarative configuration: 81:9: did not find expected alphabetic or numeric character
```

**Root Cause:** Kong's entrypoint in docker-compose.yml uses:
```bash
eval "echo \"$(cat ~/temp.yml)\"" > ~/kong.yml
```

This reads the YAML template and processes it through bash's `eval`. The YAML contains double-quoted values like `"2.1"` and `"*"`. During eval, these internal double quotes interfere with the outer echo quotes. Specifically, `- "*"` (line 81 in the generated YAML) causes bash to:
1. Strip the surrounding `"` quotes
2. Glob-expand the unquoted `*` into a list of files in the working directory
3. Produce invalid YAML like `- docker-entrypoint.sh kong.conf ...` instead of `- "*"`

**Fix:** Pre-substitute the JWT variables directly in the install script when generating kong.yml, instead of using variable placeholders that require eval at runtime. Change the Kong entrypoint to a simple file copy.

---

### Error 3: Kong/Nginx Cascade Failure

**What you see:**
```
Container supabase-auth Error dependency auth failed to start
supabase-kong: created      (NOT running)
app-nginx: created          (NOT running)
```

**Root Cause:** Kong depends on `auth: condition: service_started`. When Auth is in a crash loop (due to Error 1), Docker Compose considers it "failed to start" rather than "started," which blocks Kong. Since Nginx depends on Kong, Nginx is also blocked.

Kong does NOT actually need Auth to be running to start. Kong is just a traffic router -- if Auth is down, it returns 502 for auth endpoints, which resolves when Auth recovers.

**Fix:** Remove auth from Kong's depends_on. Keep only rest and storage as dependencies.

---

### Error 4: Frontend Build (FIXED)

The Docker-based frontend build worked correctly in this run. No changes needed.

---

### Technical Changes

#### File 1: `deploy/scripts/install-unified.sh`

**Change A - Password sync (lines 700-706):** Replace single psql command with separate calls:
```bash
# Before (BROKEN - single transaction, failure rolls back all):
docker exec supabase-db psql -U postgres -c "
    ALTER ROLE supabase_auth_admin WITH PASSWORD '...';
    ALTER ROLE supabase_storage_admin WITH PASSWORD '...';
    ALTER ROLE authenticator WITH PASSWORD '...';
    ALTER ROLE supabase_admin WITH PASSWORD '...';
"

# After (FIXED - each is an independent transaction):
docker exec supabase-db psql -U postgres -c \
  "ALTER ROLE supabase_auth_admin WITH PASSWORD '${POSTGRES_PASSWORD}';"
docker exec supabase-db psql -U postgres -c \
  "ALTER ROLE supabase_storage_admin WITH PASSWORD '${POSTGRES_PASSWORD}';"
docker exec supabase-db psql -U postgres -c \
  "ALTER ROLE authenticator WITH PASSWORD '${POSTGRES_PASSWORD}';"
# supabase_admin is a superuser - skip it (not needed for auth/storage)
```

**Change B - Kong template (lines 416-521):** Change the heredoc from single-quoted `<< 'EOF'` to unquoted `<< EOF` so bash expands variables. Replace `${SUPABASE_ANON_KEY}` with `$ANON_KEY` and `${SUPABASE_SERVICE_KEY}` with `$SERVICE_ROLE_KEY`.

**Change C - TCP test (lines 738-780):** Replace the localhost test (which uses trust auth) with a test from the Docker network using a temporary container:
```bash
docker run --rm --network deploy_supabase-network \
  -e PGPASSWORD="${POSTGRES_PASSWORD}" \
  postgres:15-alpine \
  psql -U supabase_auth_admin -h db -d postgres -c "SELECT 1;"
```

#### File 2: `deploy/docker-compose.yml`

**Change A - Kong entrypoint (line 15):** Replace eval-based variable substitution with simple file copy:
```yaml
# Before (BROKEN - eval corrupts YAML):
entrypoint: bash -c 'eval "echo \"$$(cat ~/temp.yml)\"" > ~/kong.yml && ...'

# After (FIXED - file already has correct values):
entrypoint: bash -c 'cp ~/temp.yml ~/kong.yml && /docker-entrypoint.sh kong docker-start'
```

**Change B - Kong depends_on (lines 30-32):** Remove auth dependency:
```yaml
# Before:
depends_on:
  auth:
    condition: service_started
  rest:
    condition: service_started
  storage:
    condition: service_started

# After:
depends_on:
  rest:
    condition: service_started
  storage:
    condition: service_started
```

**Change C - Remove unused Kong env vars:** Remove `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_KEY` from Kong's environment since variables are now pre-substituted.

---

### Expected Result After Fix

1. Password sync: Each ALTER ROLE runs independently -- failure on supabase_admin does NOT affect the other 3
2. TCP test: Verifies password from Docker network (same path Auth uses)
3. Kong: YAML file is generated correctly without eval corruption
4. Kong: Starts immediately without waiting for Auth
5. Nginx: Starts because Kong is available
6. Auth: Connects to DB with correct password
7. Admin user: Created successfully via Kong API

