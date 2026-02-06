
## Comprehensive Fix: Login Error, Domain Support, and Admin Credentials

### Issue Analysis

**Issue 1: JSON Parse Error on Login**
The error "Unexpected non-whitespace character after JSON at position 4 (line 1 column 5)" happens because the GoTrue (Auth) service is still unhealthy. When the frontend calls `/auth/v1/token`, Nginx proxies to Kong, Kong proxies to GoTrue, but GoTrue is down. Kong returns an HTML error page (e.g., `<html>...`), which the Supabase JS client tries to parse as JSON, causing the error.

Root cause: The AUTH service keeps crashing with "failed SASL auth" for `supabase_auth_admin`. After extensive analysis across 5 install attempts, the issue is a **timing problem** -- the install script ALTERs role passwords WHILE the Supabase postgres image's internal init scripts are STILL running. A later init script then overwrites our password change. Evidence: ALTER ROLE succeeds, Docker network test passes (at that moment), but Auth fails minutes later (because the password was overwritten by a later init script).

Fix: Instead of trying to ALTER ROLE proactively (which causes a race condition), wait for ALL init scripts to complete (by waiting for a second healthcheck cycle after init), then test the password. Only ALTER ROLE if the test fails.

**Issue 2: No Domain Configuration**
There is no mechanism to point a custom domain to the system after installation. Currently, only the server IP is used.

Fix: Create a `change-domain.sh` script that updates DNS/SSL configuration, Nginx, and frontend config for a custom domain.

**Issue 3: Admin Email is `admin@IP`**
The install script auto-generates `admin@{server_ip}` which produces invalid emails like `admin@155.117.41.226.com`.

Fix: Change the default admin email to `admin@admin.com`.

---

### Technical Changes

#### File 1: `deploy/scripts/install-unified.sh`

**Change A -- Admin email (line ~201):**
Replace `ADMIN_EMAIL="admin@${DOMAIN}"` with `ADMIN_EMAIL="admin@admin.com"`.

**Change B -- Remove proactive ALTER ROLE, add init completion wait (lines ~694-817):**
Replace the current "Etapa 1c" (sync passwords) with:
1. Wait 15 seconds after roles are detected for ALL init scripts to finish
2. Test the password from Docker network (as Auth would connect)
3. Only if the test FAILS, run ALTER ROLE as fallback, then reload pg config and re-test
4. This eliminates the race condition where our ALTER ROLE gets overwritten by a later init script

**Change C -- Frontend build with runtime config (lines ~565-600):**
1. Build with placeholder env vars: `VITE_SUPABASE_URL=https://placeholder.supabase.co` so the Supabase client's runtime config detection activates
2. After build, use `sed` to inject `<script src="/config.js"></script>` into the built `index.html`
3. Generate a `config.js` file with the actual DOMAIN and ANON_KEY values
4. This means domain changes only require updating `config.js` -- no frontend rebuild needed

**Change D -- Add generate_frontend_config helper function:**
A new function that creates the `config.js` file:
```javascript
window.__SUPABASE_CONFIG__ = {
  url: "https://DOMAIN",
  anonKey: "ANON_KEY_VALUE"
};
```

#### File 2: `deploy/scripts/change-domain.sh` (NEW)

A script to reconfigure the system for a custom domain:
1. Accepts the domain as a parameter
2. Updates the `.env` file (DOMAIN, API_EXTERNAL_URL, SITE_URL)
3. Obtains SSL certificate via Let's Encrypt (or keeps self-signed for IPs)
4. Regenerates `config.js` with the new domain
5. Restarts Nginx and Kong

Usage:
```bash
sudo bash scripts/change-domain.sh meudominio.com
```

#### File 3: `deploy/nginx/nginx.conf`

Add no-cache headers for `config.js` to ensure browsers always load the latest configuration after domain changes:
```
location = /config.js {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Pragma "no-cache";
}
```

---

### How Runtime Config Works

The Supabase client (`client.ts`) already has built-in support for runtime configuration:
1. It checks if `VITE_SUPABASE_URL` contains "placeholder"
2. If so, it reads `window.__SUPABASE_CONFIG__` (set by `config.js`)
3. This means the frontend can work with ANY domain without rebuilding

By building with placeholder values, the system uses `config.js` for all domain/key configuration. Domain changes only need to update one file.

---

### New Startup Flow

```text
1. Start DB
2. Wait for healthcheck (healthy)
3. Wait for supabase_auth_admin role to exist
4. Wait 15 extra seconds for ALL init scripts to complete
5. Run init.sql (our tables/functions)
6. Test password from Docker network (simulates GoTrue connection)
   - If OK: proceed (no ALTER ROLE needed)
   - If FAIL: ALTER ROLE as fallback, reload pg config, re-test
7. Start Auth
8. Wait for Auth healthy
9. Start remaining services
```

---

### Expected Results

After this fix:
- Auth service starts successfully (password race condition eliminated)
- Login with `admin@admin.com` works
- Frontend loads correctly with runtime config
- Domain can be changed via `change-domain.sh` without rebuilding
- Admin password is displayed at the end of installation

### Execution After Approval

```bash
cd /opt/sistema && git pull origin main
cd deploy
docker compose --profile baileys down -v 2>/dev/null || true
sudo rm -rf volumes/db/data
sudo rm -rf frontend/dist
sudo bash scripts/install-unified.sh
```
