

## Fix: Database Initialization Race Condition in Self-Hosted Deploy

### Problem Identified

The installation fails because of two related issues:

1. **Race condition**: The healthcheck (`pg_isready`) passes before the init.sql finishes executing. Auth starts too early and gets "connection refused" because PostgreSQL restarts after init script errors.

2. **Fatal errors in init.sql**: The init.sql references objects that may not exist during first-boot initialization:
   - `auth.users` table (created by Supabase's internal scripts, may not be ready)
   - `storage.buckets` / `storage.objects` tables (created by the storage container, NOT during DB init)
   - `supabase_realtime` publication (may not exist in this image version)

### Solution (2 files to change)

#### 1. Fix `deploy/supabase/init.sql`

Wrap all operations that reference external schemas in safe exception handlers:

- **auth.users trigger** (line 959-962): Wrap in a DO block that catches the error if `auth.users` doesn't exist yet. The trigger will be created later by GoTrue's own migrations.
- **storage.buckets inserts** (lines 1235-1314): Wrap ALL storage operations in a single DO block with EXCEPTION handler, since the storage schema is created by the storage container, not during DB init.
- **ALTER PUBLICATION** (lines 1320-1335): Already has exception handling but needs an additional catch for "undefined_object" (publication doesn't exist).

#### 2. Fix `deploy/scripts/install-unified.sh`

Add resilience to the staged startup:

- **Add a post-healthcheck delay**: After DB passes `pg_isready`, wait an additional 15 seconds for init scripts to complete before starting Auth.
- **Add init completion check**: Run a simple SQL query (`SELECT 1 FROM public.tenants LIMIT 0`) to verify the custom init.sql has finished executing. Only proceed to Auth after this confirms.
- **Increase auth wait time**: Extend the auth wait from 60s to 90s to give more room for the fallback role-creation logic to work.

### Technical Details

```text
Startup Flow (Fixed):

1. Start DB container
2. Wait for pg_isready (healthcheck) 
3. NEW: Wait 10s additional for init scripts
4. NEW: Verify init.sql completed (query public.tenants)
5. Start Auth container
6. Wait for Auth healthy (with crash recovery fallback)
7. Start remaining services
```

Changes to init.sql storage section (example):

```sql
-- Before (crashes if storage schema doesn't exist):
INSERT INTO storage.buckets (id, name, public) VALUES (...);

-- After (safely skips if not ready):
DO $$ BEGIN
  INSERT INTO storage.buckets (id, name, public) 
  VALUES ('chat-attachments', 'chat-attachments', true) 
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN undefined_table THEN 
  RAISE NOTICE 'storage.buckets not available yet - skipped';
END $$;
```

Changes to init.sql auth trigger section:

```sql
-- Before (crashes if auth.users doesn't exist):
CREATE TRIGGER on_auth_user_created ...

-- After (safely skips):
DO $$ BEGIN
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'auth.users not available yet - trigger will be created by GoTrue';
END $$;
```

### Expected Result

After these changes, the installation should:
- Complete the DB initialization without fatal errors
- Wait for init scripts to finish before starting Auth
- Auth should connect successfully to the DB with all roles and schemas in place
- Kong should become healthy, enabling admin user creation via API
