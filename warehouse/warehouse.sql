-- wh_schema_clean_fixed.sql
BEGIN;

-- --------------------
-- Enum type
-- --------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'node_type') THEN
    CREATE TYPE node_type AS ENUM ('inbound', 'outbound', 'shelf', 'waypoint', 'charger');
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

  CONSTRAINT wh_nodes_graph_name_unique UNIQUE (graph_id, name)
);

-- IMPORTANT: must exist BEFORE any table references (graph_id, id)
CREATE UNIQUE INDEX IF NOT EXISTS wh_nodes_graph_id_id_uidx
ON public.wh_nodes (graph_id, id);

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
-- Enforces: if level_id is used, it must be from the same graph as the node
-- Also enforces uniqueness for height-based cells per node
-- --------------------
CREATE TABLE IF NOT EXISTS public.wh_cells (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- store graph_id to allow graph-consistency constraints without triggers
  graph_id bigint NOT NULL REFERENCES public.wh_graphs(id) ON DELETE CASCADE,

  level_id bigint,
  height real,

  available boolean NOT NULL DEFAULT true,

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
--- pd_status enum
--- --------------
CREATE TYPE pd_status AS ENUM (
  'cancelled',     -- -2
  'failed',        -- -1
  'queuing',       -- 0
  'awaiting',      -- 1
  'transporting',  -- 2
  'completed'      -- 3
);

--- --------------
--- pd_pairs table
--- --------------
CREATE TABLE IF NOT EXISTS public.pd_pairs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  pickup_cell_id   bigint NOT NULL REFERENCES public.wh_cells(id) ON DELETE CASCADE,
  delivery_cell_id bigint NOT NULL REFERENCES public.wh_cells(id) ON DELETE CASCADE,

  status   pd_status NOT NULL DEFAULT 'queuing',
  priority int       NOT NULL DEFAULT 0,

  -- lifecycle timestamps
  queued_at       timestamptz NOT NULL DEFAULT now(),
  awaiting_at     timestamptz,
  transporting_at timestamptz,
  completed_at    timestamptz,
  cancelled_at    timestamptz,
  failed_at       timestamptz,

  CONSTRAINT pd_pairs_no_self_loop
    CHECK (pickup_cell_id <> delivery_cell_id),

  CONSTRAINT pd_pairs_priority_range
    CHECK (priority BETWEEN 0 AND 100),

  -- timestamps only allowed for matching status
  CONSTRAINT pd_pairs_ts_match_status
    CHECK (
      (awaiting_at     IS NULL OR status = 'awaiting') AND
      (transporting_at IS NULL OR status = 'transporting') AND
      (completed_at    IS NULL OR status = 'completed') AND
      (cancelled_at    IS NULL OR status = 'cancelled') AND
      (failed_at       IS NULL OR status = 'failed')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS pd_pairs_unique_pickup_when_pending
ON public.pd_pairs (pickup_cell_id)
WHERE status IN ('queuing', 'awaiting');

CREATE UNIQUE INDEX IF NOT EXISTS pd_pairs_unique_route_when_pending
ON public.pd_pairs (pickup_cell_id, delivery_cell_id)
WHERE status IN ('transporting');

--- --------------
--- TODO: vr_solutions table
--- --------------
-- CREATE TABLE IF NOT EXISTS public.vr_solutions (
--   id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,


--   graph_id bigint NOT NULL REFERENCES public.wh_graphs(id) ON DELETE CASCADE,
--   created_at timestamptz NOT NULL DEFAULT now(),
--   description text
-- );

COMMIT;

-- --------------------
-- Views
-- --------------------

CREATE OR REPLACE VIEW public.wh_neighbors AS
SELECT e.id AS edge_id, e.graph_id, e.node_a_id AS node_id, e.node_b_id AS neighbor_id
FROM public.wh_edges e
UNION ALL
SELECT e.id AS edge_id, e.graph_id, e.node_b_id AS node_id, e.node_a_id AS neighbor_id
FROM public.wh_edges e;

CREATE OR REPLACE VIEW public.wh_node_degree AS
SELECT
  n.*,
  COALESCE(d.deg, 0) AS degree
FROM public.wh_nodes n
LEFT JOIN (
  SELECT graph_id, node_id, COUNT(*) AS deg
  FROM public.wh_neighbors
  GROUP BY graph_id, node_id
) d
ON d.graph_id = n.graph_id AND d.node_id = n.id;