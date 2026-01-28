-- wh_schema_clean_fixed.sql
BEGIN;
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- --------------------
-- Enum type
-- --------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'node_type') THEN
    CREATE TYPE node_type AS ENUM ('inbound', 'outbound', 'shelf', 'waypoint', 'depot');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assignment_status') THEN
    CREATE TYPE assignment_status AS ENUM ('cancelled', 'failed', 'in_progress', 'partially_completed', 'completed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'robot_status') THEN
    CREATE TYPE robot_status AS ENUM ('offline', 'idle', 'inactive', 'busy');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM ('cancelled', 'failed', 'on_another_delivery', 'pickup_en_route', 'picking_up', 'delivery_en_route', 'dropping_off', 'delivered');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pd_request_status') THEN
    CREATE TYPE pd_request_status AS ENUM ('cancelled', 'failed', 'queuing', 'in_progress', 'completed');
  END IF;
END $$;

-- --------------------
-- Graphs
-- --------------------
CREATE TABLE IF NOT EXISTS public.wh_graphs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  map_url text,
  map_res real,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------
-- Nodes
-- --------------------
CREATE TABLE IF NOT EXISTS public.wh_nodes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  x real NOT NULL,
  y real NOT NULL,
  a real NOT NULL,
  name text NOT NULL,
  type node_type NOT NULL,
  graph_id bigint NOT NULL REFERENCES public.wh_graphs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wh_nodes_graph_name_unique UNIQUE (graph_id, name),

  -- Enforce depot naming rule:
  --  - depot must be named '__depot__'
  --  - '__depot__' name is reserved exclusively for depot
  CONSTRAINT wh_nodes_depot_name_rule
    CHECK ( (type = 'depot') = (name = '__depot__') )
);

-- IMPORTANT: must exist BEFORE any table references (graph_id, id)
CREATE UNIQUE INDEX IF NOT EXISTS wh_nodes_graph_id_id_uidx
ON public.wh_nodes (graph_id, id);

-- one depot per graph
CREATE UNIQUE INDEX IF NOT EXISTS wh_nodes_one_depot_per_graph_uidx
ON public.wh_nodes (graph_id)
WHERE type='depot';

-- auto-create depot on graph insert + forbid deleting (or un-depoting) it
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

-- Triggers are not "IF NOT EXISTS" capable -> drop then create for idempotency
DROP TRIGGER IF EXISTS wh_graphs_insert_depot_trg ON public.wh_graphs;
CREATE TRIGGER wh_graphs_insert_depot_trg
AFTER INSERT ON public.wh_graphs
FOR EACH ROW EXECUTE FUNCTION public.wh_graphs_init_and_lock_depot();

DROP TRIGGER IF EXISTS wh_nodes_lock_depot_trg ON public.wh_nodes;
CREATE TRIGGER wh_nodes_lock_depot_trg
BEFORE UPDATE OR DELETE ON public.wh_nodes
FOR EACH ROW EXECUTE FUNCTION public.wh_graphs_init_and_lock_depot();

-- nicer error than unique-violation when someone tries to add a 2nd depot
-- (guarded so it won't interfere with trigger-driven auto-insert depot)
CREATE OR REPLACE FUNCTION public.wh_nodes_block_extra_depot()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- If this INSERT was triggered by another trigger (e.g., auto depot creation),
  -- skip friendly check and let constraints/indexes handle it.
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

-- --------------------
-- Edges (UNDIRECTED; stored once)
-- Enforces: endpoints belong to the same graph_id
-- --------------------
CREATE TABLE IF NOT EXISTS public.wh_edges (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  graph_id bigint NOT NULL REFERENCES public.wh_graphs(id) ON DELETE CASCADE,

  node_a_id bigint NOT NULL,
  node_b_id bigint NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wh_edges_no_self_loop CHECK (node_a_id <> node_b_id),

  CONSTRAINT wh_edges_node_a_same_graph_fk
    FOREIGN KEY (graph_id, node_a_id)
    REFERENCES public.wh_nodes (graph_id, id)
    ON DELETE CASCADE,

  CONSTRAINT wh_edges_node_b_same_graph_fk
    FOREIGN KEY (graph_id, node_b_id)
    REFERENCES public.wh_nodes (graph_id, id)
    ON DELETE CASCADE
);

-- Undirected uniqueness per graph via UNIQUE EXPRESSION INDEX
CREATE UNIQUE INDEX IF NOT EXISTS wh_edges_undirected_unique_idx
ON public.wh_edges (
  graph_id,
  LEAST(node_a_id, node_b_id),
  GREATEST(node_a_id, node_b_id)
);

-- --------------------
-- Levels
-- --------------------
CREATE TABLE IF NOT EXISTS public.wh_levels (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  level int NOT NULL,
  height real NOT NULL,
  graph_id bigint NOT NULL REFERENCES public.wh_graphs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wh_levels_graph_level_unique UNIQUE (graph_id, level)
);

-- IMPORTANT: enables composite reference for (graph_id, level_id)
CREATE UNIQUE INDEX IF NOT EXISTS wh_levels_graph_id_id_uidx
ON public.wh_levels (graph_id, id);

-- --------------------
-- Cells
-- --------------------
CREATE TABLE IF NOT EXISTS public.wh_cells (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- store graph_id to allow graph-consistency constraints without triggers
  graph_id bigint NOT NULL REFERENCES public.wh_graphs(id) ON DELETE CASCADE,

  level_id bigint,
  height real,

  node_id bigint NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- XOR: exactly one of (level_id, height) must be provided
  CONSTRAINT wh_cells_level_xor_height
    CHECK ( (level_id IS NULL) <> (height IS NULL) ),

  -- node must belong to this same graph
  CONSTRAINT wh_cells_node_same_graph_fk
    FOREIGN KEY (graph_id, node_id)
    REFERENCES public.wh_nodes (graph_id, id)
    ON DELETE CASCADE,

  -- if level_id is used, it must belong to this same graph
  CONSTRAINT wh_cells_level_same_graph_fk
    FOREIGN KEY (graph_id, level_id)
    REFERENCES public.wh_levels (graph_id, id)
    ON DELETE CASCADE,

  -- unique per node+level when using levels
  CONSTRAINT wh_cells_node_level_unique UNIQUE (node_id, level_id)
);

-- unique per node+height when using height-based cells
CREATE UNIQUE INDEX IF NOT EXISTS wh_cells_node_height_unique_idx
ON public.wh_cells (node_id, height)
WHERE level_id IS NULL;

-- --------------------
-- Indexes
-- --------------------
CREATE INDEX IF NOT EXISTS wh_nodes_graph_id_idx ON public.wh_nodes(graph_id);

CREATE INDEX IF NOT EXISTS wh_edges_graph_id_idx ON public.wh_edges(graph_id);
CREATE INDEX IF NOT EXISTS wh_edges_node_a_id_idx ON public.wh_edges(node_a_id);
CREATE INDEX IF NOT EXISTS wh_edges_node_b_id_idx ON public.wh_edges(node_b_id);

CREATE INDEX IF NOT EXISTS wh_levels_graph_id_idx ON public.wh_levels(graph_id);

CREATE INDEX IF NOT EXISTS wh_cells_graph_id_idx ON public.wh_cells(graph_id);
CREATE INDEX IF NOT EXISTS wh_cells_node_id_idx ON public.wh_cells(node_id);
CREATE INDEX IF NOT EXISTS wh_cells_level_id_idx ON public.wh_cells(level_id);

--- --------------
--- wh_requests table
--- --------------
CREATE TABLE IF NOT EXISTS public.wh_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  pickup_cell_id   bigint NOT NULL REFERENCES public.wh_cells(id) ON DELETE CASCADE,
  delivery_cell_id bigint NOT NULL REFERENCES public.wh_cells(id) ON DELETE CASCADE,

  status   pd_request_status NOT NULL DEFAULT 'queuing',
  priority int       NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wh_requests_no_self_loop
    CHECK (pickup_cell_id <> delivery_cell_id),

  CONSTRAINT wh_requests_priority_range
    CHECK (priority BETWEEN 0 AND 100)
); 

-- TODO: request status change table

CREATE UNIQUE INDEX IF NOT EXISTS wh_requests_unique_pickup_when_pending
ON public.wh_requests (pickup_cell_id)
WHERE status = 'queuing';

CREATE TABLE IF NOT EXISTS wh_robots (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text NOT NULL UNIQUE,
  status         robot_status NOT NULL,
  endpoint       text NOT NULL,
  capacity  integer NOT NULL CHECK (capacity > 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Don't touch this table manually
CREATE TABLE wh_robot_slots (
  robot_id   bigint NOT NULL REFERENCES wh_robots(id) ON DELETE CASCADE,
  slot       int    NOT NULL,
  request_id bigint NULL REFERENCES wh_requests(id) ON DELETE SET NULL,
  PRIMARY KEY (robot_id, slot),
  UNIQUE (request_id),
  CONSTRAINT wh_robot_slots_slot_nonneg CHECK (slot >= 0)
);

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

    -- Block shrinking if any slot to be removed is occupied
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

    -- Safe to delete trailing (now-out-of-range) slots
    DELETE FROM wh_robot_slots
    WHERE robot_id = NEW.id
      AND slot >= NEW.capacity;
  END IF;

  RETURN NEW;
END;
$$;

-- After INSERT: create initial slots
CREATE TRIGGER trg_wh_robots_sync_slots_ins
AFTER INSERT ON wh_robots
FOR EACH ROW
EXECUTE FUNCTION wh_robots_sync_slots_with_capacity();

-- After UPDATE of capacity: grow/shrink slots
CREATE TRIGGER trg_wh_robots_sync_slots_upd
AFTER UPDATE OF capacity ON wh_robots
FOR EACH ROW
EXECUTE FUNCTION wh_robots_sync_slots_with_capacity();

CREATE TABLE IF NOT EXISTS wh_assignments (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  robot_id      bigint REFERENCES wh_robots(id),
  original_seq  json   NOT NULL,
  provider      text   NOT NULL,
  status        assignment_status NOT NULL,
  priority      smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wh_tasks (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cell_id         bigint NOT NULL REFERENCES wh_cells(id),
  retrieve        boolean NOT NULL,
  status          task_status NOT NULL,
  assignment_id   bigint NOT NULL REFERENCES wh_assignments(id),
  seq_order       smallint NOT NULL,
  request_id      bigint REFERENCES wh_requests(id),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- for the same assignment_id the seq_order must be unique
  CONSTRAINT wh_tasks_assignment_seqorder_uniq UNIQUE (assignment_id, seq_order)
);
-- TODO: task status change table


-- -- --------------------
-- -- Views
-- -- --------------------
-- CREATE OR REPLACE VIEW public.wh_neighbors AS
-- SELECT e.id AS edge_id, e.graph_id, e.node_a_id AS node_id, e.node_b_id AS neighbor_id
-- FROM public.wh_edges e
-- UNION ALL
-- SELECT e.id AS edge_id, e.graph_id, e.node_b_id AS node_id, e.node_a_id AS neighbor_id
-- FROM public.wh_edges e;

-- CREATE OR REPLACE VIEW public.wh_node_degree AS
-- SELECT
--   n.*,
--   COALESCE(d.deg, 0) AS degree
-- FROM public.wh_nodes n
-- LEFT JOIN (
--   SELECT graph_id, node_id, COUNT(*) AS deg
--   FROM public.wh_neighbors
--   GROUP BY graph_id, node_id
-- ) d
-- ON d.graph_id = n.graph_id AND d.node_id = n.id;


--- ------------
--- Function
--- ------------
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

-- SELECT *
-- FROM public.astar_cost_matrix_by_names(
--   'warehouse_A',
--   ARRAY['s_1','s_5','s_6','i_1','o_1']
-- );

COMMIT;