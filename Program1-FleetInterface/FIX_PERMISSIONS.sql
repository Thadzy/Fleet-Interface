-- ============================================================================
-- FIX: DATABASE PERMISSIONS
-- ============================================================================
-- The error "permission denied for table wh_graphs" happens because the tables
-- were recreated but permissions were not explicitly granted to the Supabase API roles.

BEGIN;

-- 1. Grant Usage on Schema
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Grant All Privileges on Tables
-- (In a real production app, be more selective, but for dev we grant ALL)
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- 3. Grant All Privileges on Sequences (ID generators)
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 4. Grant All Privileges on Functions
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- 5. Set Default Privileges for FUTURE tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

COMMIT;

SELECT '✅ Permissions granted to anon/authenticated roles' as status;
