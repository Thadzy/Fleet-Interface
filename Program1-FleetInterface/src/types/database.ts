/**
 * DATABASE TYPES
 * * These interfaces mirror the schema defined in Supabase (PostgreSQL).
 * * Use these types throughout the app to ensure Type Safety when handling DB data.
 */

// =========================================================
// 1. ENUMS & CONSTANTS
// =========================================================

/**
 * Defines the functional role of a node in the warehouse.
 * - 'waypoint': Standard intersection or path point.
 * - 'shelf': A storage location (can be a Pickup or Delivery target).
 * - 'charger': A charging station for robots.
 * - 'inbound': Receiving area (Pickup point).
 * - 'outbound': Shipping area (Delivery point).
 */
export type NodeType = 'inbound' | 'outbound' | 'shelf' | 'waypoint' | 'charger';

// =========================================================
// 2. TABLE INTERFACES
// =========================================================

/**
 * Table: public.wh_nodes
 * Represents a physical point on the warehouse floor.
 */
export interface DBNode {
  id: number;          // Primary Key
  graph_id: number;    // Foreign Key -> wh_graphs.id
  x: number;           // X Coordinate (in Meters)
  y: number;           // Y Coordinate (in Meters)
  name: string;        // Human-readable label (e.g., "Shelf A-01")
  type: NodeType;      // Functional role
  a: number;           // Orientation/Angle (in Degrees, usually 0-360)
}

/**
 * Table: public.wh_edges
 * Represents a valid path between two nodes.
 * Edges are typically bidirectional in this system.
 */
export interface DBEdge {
  id: number;          // Primary Key
  graph_id: number;    // Foreign Key -> wh_graphs.id
  node_a_id: number;   // Start Node ID
  node_b_id: number;   // End Node ID
}

/**
 * Table: public.wh_graphs
 * Represents a specific warehouse layout configuration.
 */
export interface DBGraph {
  id: number;          // Primary Key
  name: string;        // Unique Name (e.g., "warehouse_A")
  map_url: string;     // Public URL to the background floorplan image (Supabase Storage)
  map_res: number;     // Resolution (Meters per Pixel) - Reserved for future scaling
}