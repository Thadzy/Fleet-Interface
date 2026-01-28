-- Give me an SQL command to create a graph
INSERT INTO public.wh_graphs (name, map_url, map_res)
VALUES ('warehouse_A', 'https://example.com/maps/warehouse_A.png', 0.05)
RETURNING *;

-- Give me an SQL command to insert 15 nodes
-- - all 'a' are set to zero
-- - all link graph_id to warehouse_A

-- - insert waypoint type (with name `w_{idx}`)
-- x and y are inserted at (1,2),(1,3),(1,4),(1,5),(1,6),(3,2),(3,3),(3,4),(3,5),(3,6),(5,2),(5,3),(5,4),(5,5),(5,6)

-- - insert shelf type (with name `s_{idx}`)
-- x and y are inserted at (2,3),(2,4),(2,5),(4,3),(4,4),(4,5)

-- - insert inbound type (with name `i_{idx}`)
-- x and y are inserted at (-2, 2)

-- - insert outbound type (with name `o_{idx}`)
-- x and y are inserted at (5, 2)

WITH g AS (
  SELECT id AS graph_id
  FROM public.wh_graphs
  WHERE name = 'warehouse_A'
)
INSERT INTO public.wh_nodes (x, y, a, name, type, graph_id)
SELECT v.x, v.y, 0::real, v.name, v.type::node_type, g.graph_id
FROM g
CROSS JOIN (
  VALUES
    -- waypoints (15)
    ( 1::real, 2::real,  'w_1',  'waypoint'),
    ( 1::real, 3::real,  'w_2',  'waypoint'),
    ( 1::real, 4::real,  'w_3',  'waypoint'),
    ( 1::real, 5::real,  'w_4',  'waypoint'),
    ( 1::real, 6::real,  'w_5',  'waypoint'),
    ( 3::real, 2::real,  'w_6',  'waypoint'),
    ( 3::real, 3::real,  'w_7',  'waypoint'),
    ( 3::real, 4::real,  'w_8',  'waypoint'),
    ( 3::real, 5::real,  'w_9',  'waypoint'),
    ( 3::real, 6::real,  'w_10', 'waypoint'),
    ( 5::real, 2::real,  'w_11', 'waypoint'),
    ( 5::real, 3::real,  'w_12', 'waypoint'),
    ( 5::real, 4::real,  'w_13', 'waypoint'),
    ( 5::real, 5::real,  'w_14', 'waypoint'),
    ( 5::real, 6::real,  'w_15', 'waypoint'),

    -- shelves (6)
    ( 2::real, 3::real,  's_1',  'shelf'),
    ( 2::real, 4::real,  's_2',  'shelf'),
    ( 2::real, 5::real,  's_3',  'shelf'),
    ( 4::real, 3::real,  's_4',  'shelf'),
    ( 4::real, 4::real,  's_5',  'shelf'),
    ( 4::real, 5::real,  's_6',  'shelf'),

    -- inbound (1)
    (-2::real, 2::real,  'i_1',  'inbound'),

    -- outbound (1)  (you wrote "inbound" for o_{idx}; assuming outbound)
    ( 5::real, 2::real,  'o_1',  'outbound')
) AS v(x, y, name, type)
RETURNING *;

-- Give me an SQL command to insert edges between followings
-- (i1,w1), 
-- (w1,w2), (w2,w3), (w3,w4), (w4,w5)
-- (w2,s1), (w3,s2), (w4,s3)
-- (w1,w6), (w5,w10)
-- (w7,s1), (w8,s2), (w9,s3)
-- (w7,s4), (w8,s5), (w9,s6)
-- (w11,w6), (w15,w10)
-- (w12,s4), (w13,s5), (w14,s6)
-- (w11,w12), (w12,w13), (w13,w14), (w14,w15)
-- (o1,w11)

WITH g AS (
  SELECT id AS graph_id
  FROM public.wh_graphs
  WHERE name = 'warehouse_A'
),
n AS (
  SELECT graph_id, id, name
  FROM public.wh_nodes
  WHERE graph_id = (SELECT graph_id FROM g)
),
pairs AS (
  SELECT *
  FROM (VALUES
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
  ) AS v(a_name, b_name)
)
INSERT INTO public.wh_edges (graph_id, node_a_id, node_b_id)
SELECT
  g.graph_id,
  na.id AS node_a_id,
  nb.id AS node_b_id
FROM pairs p
JOIN g ON true
JOIN n na ON na.name = p.a_name
JOIN n nb ON nb.name = p.b_name
ON CONFLICT ON CONSTRAINT wh_edges_undirected_unique_idx DO NOTHING
RETURNING *;

-- Give me an sql command to create level
-- height is 1.25,2.5,3.75 which correspond to level 1,2,3 for the warehouse_A 

WITH g AS (
  SELECT id AS graph_id
  FROM public.wh_graphs
  WHERE name = 'warehouse_A'
)
INSERT INTO public.wh_levels (level, height, graph_id)
SELECT v.level, v.height, g.graph_id
FROM g
CROSS JOIN (
  VALUES
    (1, 1.25::real),
    (2, 2.50::real),
    (3, 3.75::real)
) AS v(level, height)
ON CONFLICT ON CONSTRAINT wh_levels_graph_level_unique DO NOTHING
RETURNING *;

-- give me an sql command to create cells
-- insert level 1,2,3 (link to those created), dont insert height
-- for node s1,s2,s3,s4,s5,s6 
-- all are available

WITH g AS (
  SELECT id AS graph_id
  FROM public.wh_graphs
  WHERE name = 'warehouse_A'
),
shelves AS (
  SELECT n.id AS node_id, n.graph_id
  FROM public.wh_nodes n
  JOIN g ON g.graph_id = n.graph_id
  WHERE n.name IN ('s_1','s_2','s_3','s_4','s_5','s_6')
),
levels AS (
  SELECT l.id AS level_id, l.level, l.graph_id
  FROM public.wh_levels l
  JOIN g ON g.graph_id = l.graph_id
  WHERE l.level IN (1,2,3)
)
INSERT INTO public.wh_cells (graph_id, node_id, level_id, available)
SELECT s.graph_id, s.node_id, l.level_id, true
FROM shelves s
CROSS JOIN levels l
ON CONFLICT ON CONSTRAINT wh_cells_node_level_unique DO NOTHING
RETURNING *;