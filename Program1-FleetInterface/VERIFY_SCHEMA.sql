-- ============================================================================
-- VERIFICATION SCRIPT: Check Schema Migration Success
-- ============================================================================
-- Run this AFTER running MIGRATION_TO_SPEC_SCHEMA.sql
-- ============================================================================

-- ============================================================================
-- 1. VERIFY ALL TABLES EXIST
-- ============================================================================
SELECT 
  CASE 
    WHEN COUNT(*) = 10 THEN '✅ All tables exist'
    ELSE '❌ Missing tables: ' || (10 - COUNT(*))::text
  END as status,
  COUNT(*) as table_count
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'wh_graphs', 'wh_nodes', 'wh_edges', 'wh_levels', 'wh_cells',
  'wh_requests', 'wh_robots', 'wh_robot_slots', 'wh_assignments', 'wh_tasks'
);

-- List all wh_* tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'wh_%'
ORDER BY table_name;

-- ============================================================================
-- 2. VERIFY ALL ENUM TYPES EXIST
-- ============================================================================
SELECT 
  CASE 
    WHEN COUNT(*) = 5 THEN '✅ All enum types exist'
    ELSE '❌ Missing enums: ' || (5 - COUNT(*))::text
  END as status,
  COUNT(*) as enum_count
FROM pg_type 
WHERE typname IN ('node_type', 'pd_request_status', 'assignment_status', 'task_status', 'robot_status');

-- List all enum types with their values
SELECT 
  t.typname as enum_name,
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) as enum_values
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname IN ('node_type', 'pd_request_status', 'assignment_status', 'task_status', 'robot_status')
GROUP BY t.typname
ORDER BY t.typname;

-- ============================================================================
-- 3. VERIFY DEPOT TRIGGERS WORK
-- ============================================================================

-- Check if depot nodes exist for each graph
SELECT 
  g.id as graph_id,
  g.name as graph_name,
  CASE 
    WHEN n.id IS NOT NULL THEN '✅ Depot exists'
    ELSE '❌ Missing depot'
  END as depot_status,
  n.name as depot_name,
  n.type as depot_type
FROM public.wh_graphs g
LEFT JOIN public.wh_nodes n ON n.graph_id = g.id AND n.type = 'depot'
ORDER BY g.id;

-- Test: Try to create a second depot (should fail)
-- Uncomment to test:
/*
BEGIN;
INSERT INTO public.wh_nodes (x, y, a, name, type, graph_id)
SELECT 1, 1, 0, 'test_depot', 'depot', id
FROM public.wh_graphs
WHERE name = 'warehouse_A'
LIMIT 1;
ROLLBACK;
*/

-- ============================================================================
-- 4. VERIFY ROBOT SLOT TRIGGERS WORK
-- ============================================================================

-- Create a test robot (if none exist)
INSERT INTO public.wh_robots (name, status, endpoint, capacity)
VALUES ('test_robot', 'idle', 'mqtt://test', 3)
ON CONFLICT (name) DO NOTHING
RETURNING id, name, capacity;

-- Check if slots were auto-created
SELECT 
  r.name as robot_name,
  r.capacity,
  COUNT(rs.slot) as slots_created,
  CASE 
    WHEN COUNT(rs.slot) = r.capacity THEN '✅ Slots match capacity'
    ELSE '❌ Slot count mismatch'
  END as status
FROM public.wh_robots r
LEFT JOIN public.wh_robot_slots rs ON rs.robot_id = r.id
GROUP BY r.id, r.name, r.capacity
ORDER BY r.id;

-- ============================================================================
-- 5. VERIFY DISTANCE MATRIX FUNCTION EXISTS
-- ============================================================================
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_proc 
      WHERE proname = 'astar_cost_matrix_by_names'
    ) THEN '✅ Function exists'
    ELSE '❌ Function missing'
  END as function_status;

-- Test the function (requires warehouse_A with nodes)
-- Uncomment when you have data:
/*
SELECT * 
FROM public.astar_cost_matrix_by_names(
  'warehouse_A',
  ARRAY['s_1','s_5','s_6','i_1','o_1'],
  false,
  5
);
*/

-- ============================================================================
-- 6. VERIFY DATA MIGRATION (pd_pairs -> wh_requests)
-- ============================================================================
SELECT 
  'pd_pairs' as source_table,
  COUNT(*) as record_count
FROM public.pd_pairs
UNION ALL
SELECT 
  'wh_requests' as source_table,
  COUNT(*) as record_count
FROM public.wh_requests;

-- ============================================================================
-- 7. VERIFY CONSTRAINTS AND INDEXES
-- ============================================================================

-- Check critical indexes exist
SELECT 
  indexname,
  CASE 
    WHEN indexname IS NOT NULL THEN '✅'
    ELSE '❌'
  END as status
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname IN (
  'wh_nodes_graph_id_id_uidx',
  'wh_nodes_one_depot_per_graph_uidx',
  'wh_levels_graph_id_id_uidx',
  'wh_edges_undirected_unique_idx',
  'wh_requests_unique_pickup_when_pending'
)
ORDER BY indexname;

-- ============================================================================
-- 8. CHECK SAMPLE DATA (warehouse_A)
-- ============================================================================
SELECT 
  'Graphs' as category,
  COUNT(*) as count
FROM public.wh_graphs
WHERE name = 'warehouse_A'
UNION ALL
SELECT 
  'Nodes',
  COUNT(*)
FROM public.wh_nodes n
JOIN public.wh_graphs g ON g.id = n.graph_id
WHERE g.name = 'warehouse_A'
UNION ALL
SELECT 
  'Edges',
  COUNT(*)
FROM public.wh_edges e
JOIN public.wh_graphs g ON g.id = e.graph_id
WHERE g.name = 'warehouse_A'
UNION ALL
SELECT 
  'Levels',
  COUNT(*)
FROM public.wh_levels l
JOIN public.wh_graphs g ON g.id = l.graph_id
WHERE g.name = 'warehouse_A'
UNION ALL
SELECT 
  'Cells',
  COUNT(*)
FROM public.wh_cells c
JOIN public.wh_graphs g ON g.id = c.graph_id
WHERE g.name = 'warehouse_A';

-- Expected counts for warehouse_A:
-- Nodes: 23 (15 waypoints + 6 shelves + 1 inbound + 1 outbound + 1 depot)
-- Edges: ~25 (connections)
-- Levels: 3
-- Cells: 18 (6 shelves × 3 levels)
