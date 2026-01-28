-- ============================================================================
-- FULL SCHEMA SETUP COMPANION
-- ============================================================================
-- Run this script to ensure ALL tables and columns exist and Supabase is updated.
-- This combines Migration + Fixes + Cache Reload into one operation.
-- ============================================================================

BEGIN;

-- 1. Ensure Fundamental Tables Exist (wh_graphs, wh_nodes, wh_edges)
--    (These usually exist, but we ensure they do for safety)

CREATE TABLE IF NOT EXISTS public.wh_graphs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL UNIQUE,
    map_url text,
    created_at timestamptz DEFAULT now()
);

CREATE TYPE node_type AS ENUM ('inbound', 'outbound', 'shelf', 'waypoint', 'depot');

CREATE TABLE IF NOT EXISTS public.wh_nodes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    graph_id bigint REFERENCES public.wh_graphs(id) ON DELETE CASCADE,
    x float NOT NULL,
    y float NOT NULL,
    a float DEFAULT 0,
    name text NOT NULL,
    type node_type NOT NULL,
    level integer DEFAULT 0, -- Ensure 'level' column exists
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wh_edges (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    graph_id bigint REFERENCES public.wh_graphs(id) ON DELETE CASCADE,
    node_a_id bigint REFERENCES public.wh_nodes(id) ON DELETE CASCADE,
    node_b_id bigint REFERENCES public.wh_nodes(id) ON DELETE CASCADE,
    weight float DEFAULT 1,
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wh_cells (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  node_id bigint NOT NULL REFERENCES public.wh_nodes(id) ON DELETE CASCADE,
  level_id int, 
  height float, 
  graph_id bigint REFERENCES public.wh_graphs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wh_levels (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  graph_id bigint REFERENCES public.wh_graphs(id) ON DELETE CASCADE,
  level int NOT NULL,
  height float NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(graph_id, level)
);

-- 2. Create Enums for New Features
DO $$
BEGIN
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

-- 3. Create Feature Tables (wh_requests, wh_robots, etc.)

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

CREATE TABLE IF NOT EXISTS public.wh_robots (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text NOT NULL UNIQUE,
  status         robot_status NOT NULL,
  endpoint       text NOT NULL,
  capacity       integer NOT NULL CHECK (capacity > 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wh_robot_slots (
  robot_id   bigint NOT NULL REFERENCES wh_robots(id) ON DELETE CASCADE,
  slot       int    NOT NULL,
  request_id bigint NULL REFERENCES wh_requests(id) ON DELETE SET NULL,
  PRIMARY KEY (robot_id, slot),
  UNIQUE (request_id),
  CONSTRAINT wh_robot_slots_slot_nonneg CHECK (slot >= 0)
);

CREATE TABLE IF NOT EXISTS public.wh_assignments (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  robot_id      bigint REFERENCES wh_robots(id),
  original_seq  json   NOT NULL,
  provider      text   NOT NULL,
  status        assignment_status NOT NULL,
  priority      smallint NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

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

-- 4. Apply Final Fixes (ensure 'level' column exists if table was already there)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wh_nodes' AND column_name = 'level'
  ) THEN
    ALTER TABLE public.wh_nodes ADD COLUMN level integer DEFAULT 0;
  END IF;
END $$;

COMMIT;

-- 5. Reload Schema Cache
NOTIFY pgrst, 'reload config';

-- 6. Verification
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wh_requests') THEN '✅ Table wh_requests FOUND'
        ELSE '❌ Table wh_requests STILL MISSING'
    END as status_requests,
    CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wh_nodes' AND column_name = 'level') THEN '✅ Column wh_nodes.level FOUND'
        ELSE '❌ Column wh_nodes.level MISSING'
    END as status_nodes_level;
