-- ============================================================================
-- FIX: RELOAD SCHEMA CACHE
-- ============================================================================
-- The error "Could not find the table 'public.wh_requests' in the schema cache"
-- occurs when Supabase/PostgREST doesn't know about a newly created table yet.

-- 1. Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload config';

-- 2. Verify that the table actually exists and is accessible
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wh_requests') THEN '✅ Table wh_requests FOUND'
        ELSE '❌ Table wh_requests NOT FOUND - Did you run MIGRATION_TO_SPEC_SCHEMA.sql?'
    END as status;

-- 3. Check permissions (RLS) - Ensure it's public
-- (Optional: You might need to Enable RLS and add policies if this is a secure app, 
-- but for now verify it exists).
