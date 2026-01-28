-- ============================================================================
-- RESET TASKS (CLEAR QUEUE)
-- ============================================================================
-- You are getting "duplicate key ... unique_pickup_when_pending" errors because
-- there are tasks in the database that you cannot see (due to the loading error).
-- This script wipes the task list clean so you can start over.

TRUNCATE TABLE public.wh_tasks CASCADE;
TRUNCATE TABLE public.wh_assignments CASCADE;
TRUNCATE TABLE public.wh_requests CASCADE;

SELECT '✅ Task Queue Cleared' as status;
