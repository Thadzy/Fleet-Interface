-- ============================================================================
-- COMPREHENSIVE RESET & SETUP SCRIPT
-- ============================================================================
-- 1. Drops the entire public schema (RESET).
-- 2. recreates schema using 'warehouse.sql' (BASE).
-- 3. Inserts sample data using 'insert_warehouse.sql' (DATA).
-- 4. Applies frontend compatibility fixes (PATCH).
-- 5. Reloads API cache.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- PART A: RESET (From warehouse.sql lines 2-6)
-- ----------------------------------------------------------------------------
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- ----------------------------------------------------------------------------
-- PART B: SCHEMA DEFINITION (From warehouse.sql)
-- ----------------------------------------------------------------------------

-- Enums
CREATE TYPE node_type AS ENUM ('inbound', 'outbound', 'shelf', 'waypoint', 'depot');
CREATE TYPE assignment_status AS ENUM ('cancelled', 'failed', 'in_progress', 'partially_completed', 'completed');
CREATE TYPE robot_status AS ENUM ('offline', 'idle', 'inactive', 'busy');
CREATE TYPE task_status AS ENUM ('cancelled', 'failed', 'on_another_delivery', 'pickup_en_route', 'picking_up', 'delivery_en_route', 'dropping_off', 'delivered');
CREATE TYPE pd_request_status AS ENUM ('cancelled', 'failed', 'queuing', 'in_progress', 'completed');

-- Tables
CREATE TABLE public.wh_graphs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  map_url text,
  map_res real,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.wh_nodes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  x real NOT NULL,
  y real NOT NULL,
  a real NOT NULL,
  name text NOT NULL,
  type node_type NOT NULL,
  graph_id bigint NOT NULL REFERENCES public.wh_graphs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wh_nodes_graph_name_unique UNIQUE (graph_id, name),
  CONSTRAINT wh_nodes_depot_name_rule CHECK ( (type = 'depot') = (name = '__depot__') )
);

CREATE UNIQUE INDEX wh_nodes_graph_id_id_uidx ON public.wh_nodes (graph_id, id);
CREATE UNIQUE INDEX wh_nodes_one_depot_per_graph_uidx ON public.wh_nodes (graph_id) WHERE type='depot';

-- Trigger Functions (Depot Management)
CREATE OR REPLACE FUNCTION public.wh_graphs_init_and_lock_depot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='wh_graphs' THEN
    INSERT INTO public.wh_nodes (x,y,a,name,type,graph_id) VALUES (0,0,0,'__depot__','depot',NEW.id) ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' AND OLD.type='depot' THEN RAISE EXCEPTION 'depot cannot be deleted'; END IF;
  IF TG_OP='UPDATE' AND OLD.type='depot' AND NEW.type<>'depot' THEN RAISE EXCEPTION 'depot type cannot change'; END IF;
  RETURN COALESCE(NEW,OLD);
END $$;

CREATE TRIGGER wh_graphs_insert_depot_trg AFTER INSERT ON public.wh_graphs FOR EACH ROW EXECUTE FUNCTION public.wh_graphs_init_and_lock_depot();
CREATE TRIGGER wh_nodes_lock_depot_trg BEFORE UPDATE OR DELETE ON public.wh_nodes FOR EACH ROW EXECUTE FUNCTION public.wh_graphs_init_and_lock_depot();

CREATE OR REPLACE FUNCTION public.wh_nodes_block_extra_depot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF pg_trigger_depth() > 0 THEN RETURN NEW; END IF;
  IF NEW.type='depot' AND EXISTS (SELECT 1 FROM public.wh_nodes WHERE graph_id=NEW.graph_id AND type='depot') THEN
    RAISE EXCEPTION 'Depot already exists for graph_id=%', NEW.graph_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER wh_nodes_block_extra_depot_trg BEFORE INSERT ON public.wh_nodes FOR EACH ROW EXECUTE FUNCTION public.wh_nodes_block_extra_depot();

-- Edges
CREATE TABLE public.wh_edges (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  graph_id bigint NOT NULL REFERENCES public.wh_graphs(id) ON DELETE CASCADE,
  node_a_id bigint NOT NULL,
  node_b_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wh_edges_no_self_loop CHECK (node_a_id <> node_b_id),
  CONSTRAINT wh_edges_node_a_same_graph_fk FOREIGN KEY (graph_id, node_a_id) REFERENCES public.wh_nodes (graph_id, id) ON DELETE CASCADE,
  CONSTRAINT wh_edges_node_b_same_graph_fk FOREIGN KEY (graph_id, node_b_id) REFERENCES public.wh_nodes (graph_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX wh_edges_undirected_unique_idx ON public.wh_edges (graph_id, LEAST(node_a_id, node_b_id), GREATEST(node_a_id, node_b_id));

-- Levels
CREATE TABLE public.wh_levels (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  level int NOT NULL,
  height real NOT NULL,
  graph_id bigint NOT NULL REFERENCES public.wh_graphs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wh_levels_graph_level_unique UNIQUE (graph_id, level)
);
CREATE UNIQUE INDEX wh_levels_graph_id_id_uidx ON public.wh_levels (graph_id, id);

-- Cells
CREATE TABLE public.wh_cells (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  graph_id bigint NOT NULL REFERENCES public.wh_graphs(id) ON DELETE CASCADE,
  level_id bigint,
  height real,
  node_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wh_cells_level_xor_height CHECK ( (level_id IS NULL) <> (height IS NULL) ),
  CONSTRAINT wh_cells_node_same_graph_fk FOREIGN KEY (graph_id, node_id) REFERENCES public.wh_nodes (graph_id, id) ON DELETE CASCADE,
  CONSTRAINT wh_cells_level_same_graph_fk FOREIGN KEY (graph_id, level_id) REFERENCES public.wh_levels (graph_id, id) ON DELETE CASCADE,
  CONSTRAINT wh_cells_node_level_unique UNIQUE (node_id, level_id)
);
CREATE UNIQUE INDEX wh_cells_node_height_unique_idx ON public.wh_cells (node_id, height) WHERE level_id IS NULL;

-- Requests, Robots, Assignments, Tasks
CREATE TABLE public.wh_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pickup_cell_id   bigint NOT NULL REFERENCES public.wh_cells(id) ON DELETE CASCADE,
  delivery_cell_id bigint NOT NULL REFERENCES public.wh_cells(id) ON DELETE CASCADE,
  status   pd_request_status NOT NULL DEFAULT 'queuing',
  priority int       NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wh_requests_no_self_loop CHECK (pickup_cell_id <> delivery_cell_id),
  CONSTRAINT wh_requests_priority_range CHECK (priority BETWEEN 0 AND 100)
); 

CREATE UNIQUE INDEX wh_requests_unique_pickup_when_pending ON public.wh_requests (pickup_cell_id) WHERE status = 'queuing';

CREATE TABLE wh_robots (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text NOT NULL UNIQUE,
  status         robot_status NOT NULL,
  endpoint       text NOT NULL,
  capacity  integer NOT NULL CHECK (capacity > 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wh_robot_slots (
  robot_id   bigint NOT NULL REFERENCES wh_robots(id) ON DELETE CASCADE,
  slot       int    NOT NULL,
  request_id bigint NULL REFERENCES wh_requests(id) ON DELETE SET NULL,
  PRIMARY KEY (robot_id, slot),
  UNIQUE (request_id),
  CONSTRAINT wh_robot_slots_slot_nonneg CHECK (slot >= 0)
);

CREATE OR REPLACE FUNCTION wh_robots_sync_slots_with_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE blocked_slot int;
BEGIN
  INSERT INTO wh_robot_slots (robot_id, slot, request_id)
  SELECT NEW.id, s, NULL::bigint FROM generate_series(0, NEW.capacity - 1) AS s ON CONFLICT (robot_id, slot) DO NOTHING;

  IF TG_OP = 'UPDATE' AND NEW.capacity < OLD.capacity THEN
    SELECT slot INTO blocked_slot FROM wh_robot_slots
    WHERE robot_id = NEW.id AND slot >= NEW.capacity AND request_id IS NOT NULL ORDER BY slot LIMIT 1;
    IF blocked_slot IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot shrink robot % capacity to %: slot % is occupied', NEW.id, NEW.capacity, blocked_slot USING ERRCODE = '23514';
    END IF;
    DELETE FROM wh_robot_slots WHERE robot_id = NEW.id AND slot >= NEW.capacity;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wh_robots_sync_slots_ins AFTER INSERT ON wh_robots FOR EACH ROW EXECUTE FUNCTION wh_robots_sync_slots_with_capacity();
CREATE TRIGGER trg_wh_robots_sync_slots_upd AFTER UPDATE OF capacity ON wh_robots FOR EACH ROW EXECUTE FUNCTION wh_robots_sync_slots_with_capacity();

CREATE TABLE wh_assignments (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  robot_id      bigint REFERENCES wh_robots(id),
  original_seq  json   NOT NULL,
  provider      text   NOT NULL,
  status        assignment_status NOT NULL,
  priority      smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wh_tasks (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cell_id         bigint NOT NULL REFERENCES wh_cells(id),
  retrieve        boolean NOT NULL,
  status          task_status NOT NULL,
  assignment_id   bigint NOT NULL REFERENCES wh_assignments(id),
  seq_order       smallint NOT NULL,
  request_id      bigint REFERENCES wh_requests(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wh_tasks_assignment_seqorder_uniq UNIQUE (assignment_id, seq_order)
);

-- Distance Matrix Function
CREATE EXTENSION IF NOT EXISTS postgis CASCADE;
CREATE EXTENSION IF NOT EXISTS pgrouting;
CREATE OR REPLACE FUNCTION public.astar_cost_matrix_by_names(
  p_graph_name  text,
  p_node_names  text[],
  p_directed    boolean DEFAULT false,
  p_heuristic   integer DEFAULT 5
) RETURNS TABLE (
  node_a_name text,
  node_b_name text,
  agg_cost  float8
) LANGUAGE plpgsql STABLE AS $$
DECLARE v_graph_id bigint;
BEGIN
  SELECT g.id INTO v_graph_id FROM public.wh_graphs g WHERE g.name = p_graph_name LIMIT 1;
  IF v_graph_id IS NULL THEN RAISE EXCEPTION 'Graph name "%" not found', p_graph_name; END IF;

  RETURN QUERY
  SELECT na.name AS node_a_name, nb.name AS node_b_name, m.agg_cost
  FROM pgr_aStarCostMatrix(
    format($q$
      WITH filtered_nodes AS (SELECT n.* FROM public.wh_nodes n WHERE n.graph_id = %L),
      filtered_edges AS (SELECT e.* FROM public.wh_edges e WHERE e.graph_id = %L)
      SELECT
        e.id::bigint AS id, e.node_a_id::bigint AS source, e.node_b_id::bigint AS target,
        sqrt((na.x - nb.x)^2 + (na.y - nb.y)^2)::float AS cost,
        sqrt((na.x - nb.x)^2 + (na.y - nb.y)^2)::float AS reverse_cost,
        na.x::float AS x1, na.y::float AS y1, nb.x::float AS x2, nb.y::float AS y2
      FROM filtered_edges e
      JOIN filtered_nodes na ON na.id = e.node_a_id
      JOIN filtered_nodes nb ON nb.id = e.node_b_id
    $q$, v_graph_id, v_graph_id),
    ARRAY(SELECT n.id::bigint FROM public.wh_nodes n WHERE n.graph_id = v_graph_id AND n.name = ANY(p_node_names) ORDER BY array_position(p_node_names, n.name)),
    directed => p_directed, heuristic => p_heuristic
  ) AS m
  JOIN public.wh_nodes na ON na.graph_id = v_graph_id AND na.id = m.start_vid
  JOIN public.wh_nodes nb ON nb.graph_id = v_graph_id AND nb.id = m.end_vid;
END;
$$;


-- ----------------------------------------------------------------------------
-- PART C: DATA INSERTION (From insert_warehouse.sql)
-- ----------------------------------------------------------------------------

-- Create Graph
INSERT INTO public.wh_graphs (name, map_url, map_res)
VALUES ('warehouse_A', 'https://example.com/maps/warehouse_A.png', 0.05);

-- Insert Nodes
WITH g AS (SELECT id AS graph_id FROM public.wh_graphs WHERE name = 'warehouse_A')
INSERT INTO public.wh_nodes (x, y, a, name, type, graph_id)
SELECT v.x, v.y, 0::real, v.name, v.type::node_type, g.graph_id
FROM g CROSS JOIN (VALUES
    ( 1::real, 2::real,  'w_1',  'waypoint'), ( 1::real, 3::real,  'w_2',  'waypoint'), ( 1::real, 4::real,  'w_3',  'waypoint'), ( 1::real, 5::real,  'w_4',  'waypoint'), ( 1::real, 6::real,  'w_5',  'waypoint'),
    ( 3::real, 2::real,  'w_6',  'waypoint'), ( 3::real, 3::real,  'w_7',  'waypoint'), ( 3::real, 4::real,  'w_8',  'waypoint'), ( 3::real, 5::real,  'w_9',  'waypoint'), ( 3::real, 6::real,  'w_10', 'waypoint'),
    ( 5::real, 2::real,  'w_11', 'waypoint'), ( 5::real, 3::real,  'w_12', 'waypoint'), ( 5::real, 4::real,  'w_13', 'waypoint'), ( 5::real, 5::real,  'w_14', 'waypoint'), ( 5::real, 6::real,  'w_15', 'waypoint'),
    ( 2::real, 3::real,  's_1',  'shelf'),    ( 2::real, 4::real,  's_2',  'shelf'),    ( 2::real, 5::real,  's_3',  'shelf'),
    ( 4::real, 3::real,  's_4',  'shelf'),    ( 4::real, 4::real,  's_5',  'shelf'),    ( 4::real, 5::real,  's_6',  'shelf'),
    (-2::real, 2::real,  'i_1',  'inbound'),  ( 5::real, 2::real,  'o_1',  'outbound')
) AS v(x, y, name, type);

-- Insert Edges
WITH g AS (SELECT id AS graph_id FROM public.wh_graphs WHERE name = 'warehouse_A'),
n AS (SELECT graph_id, id, name FROM public.wh_nodes WHERE graph_id = (SELECT graph_id FROM g)),
pairs AS (SELECT * FROM (VALUES
    ('i_1','w_1'),
    ('w_1','w_2'), ('w_2','w_3'), ('w_3','w_4'), ('w_4','w_5'),
    ('w_2','s_1'), ('w_3','s_2'), ('w_4','s_3'),
    ('w_1','w_6'), ('w_5','w_10'),
    ('w_7','s_1'), ('w_8','s_2'), ('w_9','s_3'),
    ('w_7','s_4'), ('w_8','s_5'), ('w_9','s_6'),
    ('w_11','w_6'), ('w_15','w_10'),
    ('w_12','s_4'), ('w_13','s_5'), ('w_14','s_6'),
    ('w_11','w_12'), ('w_12','w_13'), ('w_13','w_14'), ('w_14','w_15'),
    ('o_1','w_11')
) AS v(a_name, b_name))
INSERT INTO public.wh_edges (graph_id, node_a_id, node_b_id)
SELECT g.graph_id, na.id, nb.id
FROM pairs p JOIN g ON true JOIN n na ON na.name = p.a_name JOIN n nb ON nb.name = p.b_name
ON CONFLICT DO NOTHING;

-- Insert Levels
WITH g AS (SELECT id AS graph_id FROM public.wh_graphs WHERE name = 'warehouse_A')
INSERT INTO public.wh_levels (level, height, graph_id)
SELECT v.level, v.height, g.graph_id
FROM g CROSS JOIN (VALUES (1, 1.25::real), (2, 2.50::real), (3, 3.75::real)) AS v(level, height)
ON CONFLICT DO NOTHING;

-- Insert Cells
WITH g AS (SELECT id AS graph_id FROM public.wh_graphs WHERE name = 'warehouse_A'),
shelves AS (SELECT n.id AS node_id, n.graph_id FROM public.wh_nodes n JOIN g ON g.graph_id = n.graph_id WHERE n.name LIKE 's_%'),
levels AS (SELECT l.id AS level_id, l.level, l.graph_id FROM public.wh_levels l JOIN g ON g.graph_id = l.graph_id)
INSERT INTO public.wh_cells (graph_id, node_id, level_id)
SELECT s.graph_id, s.node_id, l.level_id
FROM shelves s CROSS JOIN levels l
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- PART D: FRONTEND PATCH (Fix for GraphEditor)
-- ----------------------------------------------------------------------------
-- The frontend expects 'level' on wh_nodes for simpler querying.
ALTER TABLE public.wh_nodes ADD COLUMN IF NOT EXISTS level integer DEFAULT 0;

-- ----------------------------------------------------------------------------
-- PART E: PERMISSIONS
-- ----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

COMMIT;

-- ----------------------------------------------------------------------------
-- PART F: CACHE RELOAD
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload config';

SELECT '✅ COMPREHENSIVE RESET & SETUP COMPLETED SUCCESSFULLY' as status;
