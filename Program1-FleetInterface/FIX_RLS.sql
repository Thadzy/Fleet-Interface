-- ============================================================================
-- FIX: ROW LEVEL SECURITY (RLS) - ENSURE VISIBILITY
-- ============================================================================
-- If RLS is enabled but no policies exist, 'anon' users will see EMPTY tables.
-- For this dev environment, we will DISABLE RLS on all tables to be safe.

ALTER TABLE public.wh_graphs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.wh_nodes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.wh_edges DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.wh_levels DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.wh_cells DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.wh_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.wh_assignments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.wh_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.wh_robots DISABLE ROW LEVEL SECURITY;

-- Reload Cache
NOTIFY pgrst, 'reload config';

SELECT '✅ RLS Disabled on all tables (Full Visibility)' as status;
