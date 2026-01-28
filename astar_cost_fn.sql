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
        sqrt((na.x - nb.x)^2 + (na.y - nb.y)^2)::float AS cost,
        sqrt((na.x - nb.x)^2 + (na.y - nb.y)^2)::float AS reverse_cost,
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