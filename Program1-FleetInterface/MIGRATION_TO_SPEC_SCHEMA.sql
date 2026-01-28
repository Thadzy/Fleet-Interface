-- ============================================================================
-- MIGRATION SCRIPT: Upgrade from old schema to specification schema
-- ============================================================================
-- This script safely migrates your existing schema to match the specification
-- WITHOUT deleting existing data (unlike wh_schema_clean_fixed.sql)
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Add Missing Enum Types
-- ============================================================================

DO $$
BEGIN
  -- Add 'depot' to node_type (if not exists)
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'depot' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'node_type')
  ) THEN
    ALTER TYPE node_type ADD VALUE 'depot';
  END IF;

  -- Remove 'charger' if it exists (optional - comment out if you want to keep it)
  -- Note: PostgreSQL doesn't support removing enum values easily
  -- You may need to recreate the enum if 'charger' exists
  
  -- Create missing enum types
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pd_request_status') THEN
    CREATE TYPE pd_request_status AS ENUM ('cancelled', 'failed', 'queuing', 'in_progress', 'completed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assignment_status') THEN
    CREATE TYPE assignment_status AS ENUM ('cancelled', 'failed', 'in_progress', 'partially_completed', 'completed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM ('cancelled', 'failed', 'on_another_delivery', 'pickup_en_route', 'picking_up', 'delivery_en_route', 'dropping_off', 'delivered');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'robot_status') THEN
    CREATE TYPE robot_status AS ENUM ('offline', 'idle', 'inactive', 'busy');
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Create Missing Tables
-- ============================================================================

-- Create wh_requests table (replaces pd_pairs in spec)
CREATE TABLE IF NOT EXISTS public.wh_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pickup_cell_id   bigint NOT NULL REFERENCES public.wh_cells(id) ON DELETE CASCADE,
  delivery_cell_id bigint NOT NULL REFERENCES public.wh_cells(id) ON DELETE CASCADE,
  status   pd_request_status NOT NULL DEFAULT 'queuing',
  priority int       NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wh_requests_no_self_loop CHECK (pickup_cell_id <> delivery_cell_id),
  CONSTRAINT wh_requests_priority_range CHECK (priority BETWEEN 0 AND 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS wh_requests_unique_pickup_when_pending
ON public.wh_requests (pickup_cell_id)
WHERE status = 'queuing';

-- Create wh_robots table
CREATE TABLE IF NOT EXISTS public.wh_robots (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text NOT NULL UNIQUE,
  status         robot_status NOT NULL,
  endpoint       text NOT NULL,
  capacity       integer NOT NULL CHECK (capacity > 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Create wh_robot_slots table
CREATE TABLE IF NOT EXISTS public.wh_robot_slots (
  robot_id   bigint NOT NULL REFERENCES wh_robots(id) ON DELETE CASCADE,
  slot       int    NOT NULL,
  request_id bigint NULL REFERENCES wh_requests(id) ON DELETE SET NULL,
  PRIMARY KEY (robot_id, slot),
  UNIQUE (request_id),
  CONSTRAINT wh_robot_slots_slot_nonneg CHECK (slot >= 0)
);

-- Create wh_assignments table
CREATE TABLE IF NOT EXISTS public.wh_assignments (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  robot_id      bigint REFERENCES wh_robots(id),
  original_seq  json   NOT NULL,
  provider      text   NOT NULL,
  status        assignment_status NOT NULL,
  priority      smallint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Create wh_tasks table
CREATE TABLE IF NOT EXISTS public.wh_tasks (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cell_id        bigint NOT NULL REFERENCES wh_cells(id),
  retrieve       boolean NOT NULL,
  status         task_status NOT NULL,
  assignment_id  bigint NOT NULL REFERENCES wh_assignments(id),
  seq_order      smallint NOT NULL,
  request_id     bigint REFERENCES wh_requests(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wh_tasks_assignment_seqorder_uniq UNIQUE (assignment_id, seq_order)
);

-- ============================================================================
-- STEP 3: Migrate Data from pd_pairs to wh_requests (if pd_pairs has data)
-- ============================================================================

-- Migrate existing pd_pairs to wh_requests
INSERT INTO public.wh_requests (pickup_cell_id, delivery_cell_id, status, priority, created_at)
SELECT 
  pickup_cell_id,
  delivery_cell_id,
  CASE 
    WHEN status = 'queuing' THEN 'queuing'::pd_request_status
    WHEN status = 'awaiting' THEN 'in_progress'::pd_request_status
    WHEN status = 'transporting' THEN 'in_progress'::pd_request_status
    WHEN status = 'completed' THEN 'completed'::pd_request_status
    WHEN status = 'cancelled' THEN 'cancelled'::pd_request_status
    WHEN status = 'failed' THEN 'failed'::pd_request_status
    ELSE 'queuing'::pd_request_status
  END as status,
  priority,
  queued_at
FROM public.pd_pairs
WHERE NOT EXISTS (
  SELECT 1 FROM public.wh_requests wr
  WHERE wr.pickup_cell_id = pd_pairs.pickup_cell_id
    AND wr.delivery_cell_id = pd_pairs.delivery_cell_id
    AND wr.created_at = pd_pairs.queued_at
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- STEP 4: Add Missing Constraints and Indexes
-- ============================================================================

-- Add composite foreign key indexes for wh_nodes (needed for edges)
CREATE UNIQUE INDEX IF NOT EXISTS wh_nodes_graph_id_id_uidx
ON public.wh_nodes (graph_id, id);

-- Add composite foreign key indexes for wh_levels
CREATE UNIQUE INDEX IF NOT EXISTS wh_levels_graph_id_id_uidx
ON public.wh_levels (graph_id, id);

-- Update wh_edges to use composite foreign keys (if not already)
-- Note: This requires the edges table to reference (graph_id, id) instead of just (id)
-- We'll add a constraint check instead of modifying existing structure

-- Add depot constraint to wh_nodes (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wh_nodes_depot_name_rule'
  ) THEN
    ALTER TABLE public.wh_nodes
    ADD CONSTRAINT wh_nodes_depot_name_rule
    CHECK ( (type = 'depot') = (name = '__depot__') );
  END IF;
END $$;

-- Add unique index for one depot per graph
CREATE UNIQUE INDEX IF NOT EXISTS wh_nodes_one_depot_per_graph_uidx
ON public.wh_nodes (graph_id)
WHERE type='depot';

-- Update wh_cells to add graph_id if missing (for composite FK)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wh_cells' AND column_name = 'graph_id'
  ) THEN
    ALTER TABLE public.wh_cells ADD COLUMN graph_id bigint;
    
    -- Populate graph_id from node_id
    UPDATE public.wh_cells c
    SET graph_id = n.graph_id
    FROM public.wh_nodes n
    WHERE c.node_id = n.id;
    
    -- Make it NOT NULL
    ALTER TABLE public.wh_cells ALTER COLUMN graph_id SET NOT NULL;
    
    -- Add foreign key
    ALTER TABLE public.wh_cells
    ADD CONSTRAINT wh_cells_graph_fk
    FOREIGN KEY (graph_id) REFERENCES public.wh_graphs(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add composite foreign key for wh_cells -> wh_nodes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wh_cells_node_same_graph_fk'
  ) THEN
    ALTER TABLE public.wh_cells
    ADD CONSTRAINT wh_cells_node_same_graph_fk
    FOREIGN KEY (graph_id, node_id)
    REFERENCES public.wh_nodes (graph_id, id)
    ON DELETE CASCADE;
  END IF;
END $$;

-- Add composite foreign key for wh_cells -> wh_levels
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wh_cells_level_same_graph_fk'
  ) THEN
    ALTER TABLE public.wh_cells
    ADD CONSTRAINT wh_cells_level_same_graph_fk
    FOREIGN KEY (graph_id, level_id)
    REFERENCES public.wh_levels (graph_id, id)
    ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- STEP 5: Create Triggers for Depot Auto-Creation
-- ============================================================================

-- Function to auto-create and lock depot
CREATE OR REPLACE FUNCTION public.wh_graphs_init_and_lock_depot()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='wh_graphs' THEN
    INSERT INTO public.wh_nodes (x,y,a,name,type,graph_id)
    VALUES (0,0,0,'__depot__','depot',NEW.id)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  IF TG_OP='DELETE' AND OLD.type='depot' THEN
    RAISE EXCEPTION 'depot cannot be deleted';
  END IF;

  IF TG_OP='UPDATE' AND OLD.type='depot' AND NEW.type<>'depot' THEN
    RAISE EXCEPTION 'depot type cannot change';
  END IF;

  RETURN COALESCE(NEW,OLD);
END $$;

-- Trigger for auto-creating depot on graph insert
DROP TRIGGER IF EXISTS wh_graphs_insert_depot_trg ON public.wh_graphs;
CREATE TRIGGER wh_graphs_insert_depot_trg
AFTER INSERT ON public.wh_graphs
FOR EACH ROW EXECUTE FUNCTION public.wh_graphs_init_and_lock_depot();

-- Trigger for preventing depot deletion/modification
DROP TRIGGER IF EXISTS wh_nodes_lock_depot_trg ON public.wh_nodes;
CREATE TRIGGER wh_nodes_lock_depot_trg
BEFORE UPDATE OR DELETE ON public.wh_nodes
FOR EACH ROW EXECUTE FUNCTION public.wh_graphs_init_and_lock_depot();

-- Function to block extra depots
CREATE OR REPLACE FUNCTION public.wh_nodes_block_extra_depot()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.type='depot'
     AND EXISTS (
       SELECT 1 FROM public.wh_nodes
       WHERE graph_id=NEW.graph_id AND type='depot'
     ) THEN
    RAISE EXCEPTION 'Depot already exists for graph_id=%', NEW.graph_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS wh_nodes_block_extra_depot_trg ON public.wh_nodes;
CREATE TRIGGER wh_nodes_block_extra_depot_trg
BEFORE INSERT ON public.wh_nodes
FOR EACH ROW
EXECUTE FUNCTION public.wh_nodes_block_extra_depot();

-- ============================================================================
-- STEP 6: Create Triggers for Robot Slot Sync
-- ============================================================================

CREATE OR REPLACE FUNCTION wh_robots_sync_slots_with_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  blocked_slot int;
BEGIN
  -- Always ensure slots 0..NEW.capacity-1 exist (idempotent)
  INSERT INTO wh_robot_slots (robot_id, slot, request_id)
  SELECT NEW.id, s, NULL::bigint
  FROM generate_series(0, NEW.capacity - 1) AS s
  ON CONFLICT (robot_id, slot) DO NOTHING;

  -- On UPDATE, handle shrink cleanup (and validate)
  IF TG_OP = 'UPDATE' AND NEW.capacity < OLD.capacity THEN
    SELECT slot
      INTO blocked_slot
    FROM wh_robot_slots
    WHERE robot_id = NEW.id
      AND slot >= NEW.capacity
      AND request_id IS NOT NULL
    ORDER BY slot
    LIMIT 1;

    IF blocked_slot IS NOT NULL THEN
      RAISE EXCEPTION
        'Cannot shrink robot % capacity to %: slot % is occupied (request_id not NULL)',
        NEW.id, NEW.capacity, blocked_slot
        USING ERRCODE = '23514';
    END IF;

    DELETE FROM wh_robot_slots
    WHERE robot_id = NEW.id
      AND slot >= NEW.capacity;
  END IF;

  RETURN NEW;
END;
$$;

-- After INSERT: create initial slots
DROP TRIGGER IF EXISTS trg_wh_robots_sync_slots_ins ON wh_robots;
CREATE TRIGGER trg_wh_robots_sync_slots_ins
AFTER INSERT ON wh_robots
FOR EACH ROW
EXECUTE FUNCTION wh_robots_sync_slots_with_capacity();

-- After UPDATE of capacity: grow/shrink slots
DROP TRIGGER IF EXISTS trg_wh_robots_sync_slots_upd ON wh_robots;
CREATE TRIGGER trg_wh_robots_sync_slots_upd
AFTER UPDATE OF capacity ON wh_robots
FOR EACH ROW
EXECUTE FUNCTION wh_robots_sync_slots_with_capacity();

-- ============================================================================
-- STEP 7: Create Distance Matrix Function (pgRouting)
-- ============================================================================

-- First, ensure pgRouting extension exists
CREATE EXTENSION IF NOT EXISTS pgrouting;

-- Create the distance matrix function
CREATE OR REPLACE FUNCTION public.astar_cost_matrix_by_names(
  p_graph_name  text,
  p_node_names  text[],
  p_directed    boolean DEFAULT false,
  p_heuristic   integer DEFAULT 5
)
RETURNS TABLE (
  node_a_name text,
  node_b_name text,
  agg_cost  float8
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_graph_id bigint;
BEGIN
  -- Find graph_id from graph name
  SELECT g.id
  INTO v_graph_id
  FROM public.wh_graphs g
  WHERE g.name = p_graph_name
  LIMIT 1;

  IF v_graph_id IS NULL THEN
    RAISE EXCEPTION 'Graph name "%" not found', p_graph_name;
  END IF;

  -- Run pgRouting
  RETURN QUERY
  SELECT na.name AS node_a_name, nb.name AS node_b_name, m.agg_cost
  FROM pgr_aStarCostMatrix(
    format($q$
      WITH filtered_nodes AS (
        SELECT n.*
        FROM public.wh_nodes n
        WHERE n.graph_id = %L
      ),
      filtered_edges AS (
        SELECT e.*
        FROM public.wh_edges e
        WHERE e.graph_id = %L
      )
      SELECT
        e.id::bigint        AS id,
        e.node_a_id::bigint AS source,
        e.node_b_id::bigint AS target,
        sqrt((na.x - nb.x)*(na.x - nb.x) + (na.y - nb.y)*(na.y - nb.y))::float AS cost,
        sqrt((na.x - nb.x)*(na.x - nb.x) + (na.y - nb.y)*(na.y - nb.y))::float AS reverse_cost,
        na.x::float AS x1, na.y::float AS y1,
        nb.x::float AS x2, nb.y::float AS y2
      FROM filtered_edges e
      JOIN filtered_nodes na ON na.id = e.node_a_id
      JOIN filtered_nodes nb ON nb.id = e.node_b_id
    $q$, v_graph_id, v_graph_id),

    ARRAY(
      SELECT n.id::bigint
      FROM public.wh_nodes n
      WHERE n.graph_id = v_graph_id
        AND n.name = ANY(p_node_names)
      ORDER BY array_position(p_node_names, n.name)
    ),

    directed  => p_directed,
    heuristic => p_heuristic
  ) AS m
  JOIN public.wh_nodes na
    ON na.graph_id = v_graph_id AND na.id = m.start_vid
  JOIN public.wh_nodes nb
    ON nb.graph_id = v_graph_id AND nb.id = m.end_vid;
END;
$$;

-- ============================================================================
-- STEP 8: Create Depot Nodes for Existing Graphs (if missing)
-- ============================================================================

-- Create depot nodes for existing graphs that don't have one
INSERT INTO public.wh_nodes (x, y, a, name, type, graph_id)
SELECT 0, 0, 0, '__depot__', 'depot', g.id
FROM public.wh_graphs g
WHERE NOT EXISTS (
  SELECT 1 FROM public.wh_nodes n
  WHERE n.graph_id = g.id AND n.type = 'depot'
)
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Run these after migration)
-- ============================================================================

-- Check all tables exist
-- SELECT table_name 
-- FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name LIKE 'wh_%'
-- ORDER BY table_name;

-- Check all enum types exist
-- SELECT typname FROM pg_type WHERE typname IN ('node_type', 'pd_request_status', 'assignment_status', 'task_status', 'robot_status');

-- Check depot nodes exist for each graph
-- SELECT g.name, n.name, n.type 
-- FROM public.wh_graphs g
-- LEFT JOIN public.wh_nodes n ON n.graph_id = g.id AND n.type = 'depot';

-- Test distance matrix function (after inserting sample data)
-- SELECT * FROM public.astar_cost_matrix_by_names('warehouse_A', ARRAY['s_1','s_5','s_6','i_1','o_1']);
