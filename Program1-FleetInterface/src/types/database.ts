// src/types/database.ts

export type NodeType = 'inbound' | 'outbound' | 'shelf' | 'waypoint' | 'charger';

// Matches public.wh_nodes table
export interface DBNode {
  id: number;
  graph_id: number;
  x: number;
  y: number;
  name: string;
  type: NodeType;
  a: number; // Angle/Orientation
}

// Matches public.wh_edges table
export interface DBEdge {
  id: number;
  graph_id: number;
  node_a_id: number;
  node_b_id: number;
}

// Matches public.wh_graphs table
export interface DBGraph {
  id: number;
  name: string;
  map_url: string;
  map_res: number;
}