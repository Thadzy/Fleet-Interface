import { useState, useCallback } from 'react';
import { type Node, type Edge, MarkerType } from 'reactflow';
import { supabase } from '../lib/supabaseClient';
import { type DBNode, type DBEdge, type NodeType } from '../types/database';

/**
 * CONSTANT: Map Scale Factor
 * Defines the ratio between Real World Meters and Screen Pixels.
 * 1 Meter = 100 Pixels.
 */
const SCALE_FACTOR = 100;

/**
 * HOOK: useGraphData
 * * Manages the CRUD operations for Warehouse Graphs (Nodes & Edges).
 * * Translates between Supabase Database format and React Flow UI format.
 * * @param graphName - The unique name of the graph to load (default: 'warehouse_A').
 */
export const useGraphData = (graphName: string = 'warehouse_A') => {
  const [loading, setLoading] = useState(false);
  const [currentGraphId, setCurrentGraphId] = useState<number | null>(null);

  // =========================================================
  // 1. READ OPERATION (FETCH MAP)
  // =========================================================
  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      // Step A: Get Graph Metadata (ID, Map Image URL)
      const { data: graphData, error: graphError } = await supabase
        .from('wh_graphs')
        .select('*')
        .eq('name', graphName)
        .single();

      if (graphError || !graphData) throw new Error('Graph not found');
      setCurrentGraphId(graphData.id);

      // Step B: Get Nodes
      const { data: nodeData, error: nodeError } = await supabase
        .from('wh_nodes')
        .select('*')
        .eq('graph_id', graphData.id);

      if (nodeError) throw nodeError;

      // Step C: Get Edges
      const { data: edgeData, error: edgeError } = await supabase
        .from('wh_edges')
        .select('*')
        .eq('graph_id', graphData.id);

      if (edgeError) throw edgeError;

      // Step D: Transform DB Nodes -> React Flow Nodes
      const flowNodes: Node[] = (nodeData as DBNode[]).map((n) => ({
        id: n.id.toString(),
        type: 'waypointNode', 
        position: { x: n.x * SCALE_FACTOR, y: n.y * SCALE_FACTOR },
        data: { label: n.name, dbType: n.type },
      }));

      // Step E: Inject Background Image (if available)
      if (graphData.map_url) {
        flowNodes.unshift({
          id: 'map-background',
          type: 'group',
          position: { x: 0, y: 0 },
          data: { label: null },
          style: {
            width: 3000, 
            height: 2000,
            backgroundImage: `url(${graphData.map_url})`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            zIndex: -10,
            pointerEvents: 'none',
          },
          draggable: false,
          selectable: false,
        });
      }

      // Step F: Transform DB Edges -> React Flow Edges
      const flowEdges: Edge[] = (edgeData as DBEdge[]).map((e) => ({
        id: `e${e.node_a_id}-${e.node_b_id}`,
        source: e.node_a_id.toString(),
        target: e.node_b_id.toString(),
        type: 'straight',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '5,5' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
      }));

      return { nodes: flowNodes, edges: flowEdges };

    } catch (error: unknown) {
      console.error('Error loading graph:', error);
      return { nodes: [], edges: [] };
    } finally {
      setLoading(false);
    }
  }, [graphName]);

  // =========================================================
  // 2. WRITE OPERATION (SAVE MAP)
  // =========================================================
  const saveGraph = useCallback(async (nodes: Node[], edges: Edge[]) => {
    if (!currentGraphId) {
      alert("Error: No graph loaded. Cannot save.");
      return false;
    }
    setLoading(true);

    try {
      // Step A: Filter out UI-only nodes (like the background)
      const activeNodes = nodes.filter(n => n.id !== 'map-background');
      
      const newNodes = [];
      const existingNodes = [];

      // Step B: Categorize Nodes (New vs Existing)
      for (const n of activeNodes) {
        // Numeric ID = Existing in DB. String ID (e.g. "temp_123") = New.
        if (Number.isInteger(Number(n.id))) {
          existingNodes.push({
            id: Number(n.id),
            graph_id: currentGraphId,
            x: n.position.x / SCALE_FACTOR,
            y: n.position.y / SCALE_FACTOR,
            name: n.data.label,
            type: (n.data.dbType || 'waypoint') as NodeType,
            a: 0 // Default angle
          });
        } else {
          // For NEW nodes, we omit 'id' so Postgres generates it
          newNodes.push({
            graph_id: currentGraphId,
            x: n.position.x / SCALE_FACTOR,
            y: n.position.y / SCALE_FACTOR,
            name: n.data.label || 'New Node',
            type: (n.data.dbType || 'waypoint') as NodeType,
            a: 0
          });
        }
      }

      // Step C: Perform DB Updates
      
      // 1. Update Existing
      if (existingNodes.length > 0) {
        const { error: updateError } = await supabase
          .from('wh_nodes')
          .upsert(existingNodes);
        if (updateError) throw new Error(`Update failed: ${updateError.message}`);
      }

      // 2. Insert New
      if (newNodes.length > 0) {
        const { error: insertError } = await supabase
          .from('wh_nodes')
          .insert(newNodes);
        if (insertError) throw new Error(`Insert failed: ${insertError.message}`);
      }

      // Step D: Re-sync Edges
      // Strategy: Delete ALL edges for this graph and re-insert valid ones.
      // Limitation: Edges connected to "New Nodes" won't save until the node has a real ID.
      const { error: deleteError } = await supabase
        .from('wh_edges')
        .delete()
        .eq('graph_id', currentGraphId);
      if (deleteError) throw deleteError;

      // Filter only edges that connect two valid numeric IDs
      const validEdges = edges.map(e => ({
        graph_id: currentGraphId,
        node_a_id: Number(e.source),
        node_b_id: Number(e.target)
      })).filter(e => !isNaN(e.node_a_id) && !isNaN(e.node_b_id));

      if (validEdges.length > 0) {
        const { error: edgeError } = await supabase
          .from('wh_edges')
          .insert(validEdges);
        if (edgeError) throw new Error(`Edge save failed: ${edgeError.message}`);
      }

      alert("Map saved successfully!");
      return true;

    } catch (error: unknown) {
      console.error('Error saving map:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Save failed: ${msg}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [currentGraphId]);

  return { loadGraph, saveGraph, loading };
};