// src/hooks/useGraphData.ts
import { useState, useCallback } from 'react';
import { type Node, type Edge, MarkerType } from 'reactflow';
import { supabase } from '../lib/supabaseClient';
import { type DBNode, type DBEdge, type NodeType } from '../types/database';

const SCALE_FACTOR = 100; // 1 Meter = 100 Pixels

export const useGraphData = (graphName: string = 'warehouse_A') => {
  const [loading, setLoading] = useState(false);
  const [currentGraphId, setCurrentGraphId] = useState<number | null>(null);

  // --- FETCH (READ) ---
  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Get Graph Details
      const { data: graphData, error: graphError } = await supabase
        .from('wh_graphs')
        .select('*')
        .eq('name', graphName)
        .single();

      if (graphError || !graphData) throw new Error('Graph not found');
      setCurrentGraphId(graphData.id);

      // 2. Get Nodes
      const { data: nodeData, error: nodeError } = await supabase
        .from('wh_nodes')
        .select('*')
        .eq('graph_id', graphData.id);

      if (nodeError) throw nodeError;

      // 3. Get Edges
      const { data: edgeData, error: edgeError } = await supabase
        .from('wh_edges')
        .select('*')
        .eq('graph_id', graphData.id);

      if (edgeError) throw edgeError;

      // 4. Convert to React Flow Format
      const flowNodes: Node[] = (nodeData as DBNode[]).map((n) => ({
        id: n.id.toString(),
        type: 'waypointNode', 
        position: { x: n.x * SCALE_FACTOR, y: n.y * SCALE_FACTOR },
        data: { label: n.name, dbType: n.type },
      }));

      // Add Map Background
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

    } catch (error) {
      console.error('Error loading graph:', error);
      return { nodes: [], edges: [] };
    } finally {
      setLoading(false);
    }
  }, [graphName]);

  // --- IMPROVED SAVE FUNCTION ---
  const saveGraph = useCallback(async (nodes: Node[], edges: Edge[]) => {
    if (!currentGraphId) {
      alert("Error: No graph loaded.");
      return false;
    }
    setLoading(true);

    try {
      // 1. Separate New Nodes from Existing Nodes
      const activeNodes = nodes.filter(n => n.id !== 'map-background');
      
      const newNodes = [];
      const existingNodes = [];

      for (const n of activeNodes) {
        // If ID is purely numeric, it's an existing DB node. Otherwise (e.g. "temp_123"), it's new.
        if (Number.isInteger(Number(n.id))) {
          existingNodes.push({
            id: Number(n.id),
            graph_id: currentGraphId,
            x: n.position.x / SCALE_FACTOR,
            y: n.position.y / SCALE_FACTOR,
            name: n.data.label,
            type: (n.data.dbType || 'waypoint') as NodeType,
            a: 0
          });
        } else {
          // For NEW nodes, we explicitly DO NOT send an 'id' field
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

      // 2. Update Existing Nodes
      if (existingNodes.length > 0) {
        const { error: updateError } = await supabase
          .from('wh_nodes')
          .upsert(existingNodes);
        if (updateError) throw new Error(`Update failed: ${updateError.message}`);
      }

      // 3. Insert New Nodes
      if (newNodes.length > 0) {
        const { error: insertError } = await supabase
          .from('wh_nodes')
          .insert(newNodes);
        if (insertError) throw new Error(`Insert failed: ${insertError.message}`);
      }

      // 4. Save Edges (Delete all & Re-insert strategy)
      // Note: This only works for edges between EXISTING nodes. 
      // If you just added a new node, you must save it first (refresh) before connecting edges.
      const { error: deleteError } = await supabase
        .from('wh_edges')
        .delete()
        .eq('graph_id', currentGraphId);
      if (deleteError) throw deleteError;

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

    } catch (error: any) {
      console.error('Error saving map:', error);
      alert(`Save failed: ${error.message}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [currentGraphId]);

  return { loadGraph, saveGraph, loading };
};