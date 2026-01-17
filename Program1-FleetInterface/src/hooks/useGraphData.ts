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

  // --- SAVE (WRITE) ---
  const saveGraph = useCallback(async (nodes: Node[], edges: Edge[]) => {
    if (!currentGraphId) {
      alert("Error: No graph loaded to save to.");
      return;
    }
    setLoading(true);

    try {
      // 1. Prepare Nodes for DB
      // Filter out the background map node
      const activeNodes = nodes.filter(n => n.id !== 'map-background');
      
      const dbNodes = activeNodes.map(n => {
        // If ID is a pure number, it's an update. If it's random string/temp, we treat as new (or let DB handle it if we omit ID)
        // For simplicity in this Prototype: We assume strict ID matching isn't required for new nodes yet, 
        // but we need to parse existing IDs.
        const isNew = isNaN(Number(n.id));
        
        return {
          id: isNew ? undefined : Number(n.id), // Undefined ID = Insert new row
          graph_id: currentGraphId,
          x: n.position.x / SCALE_FACTOR, // Convert Pixels -> Meters
          y: n.position.y / SCALE_FACTOR,
          name: n.data.label || `node_${Math.floor(Math.random() * 1000)}`,
          type: (n.data.dbType || 'waypoint') as NodeType,
          a: 0 // Default orientation
        };
      });

      // 2. Upsert Nodes (Update existing, Insert new)
      const { data: savedNodes, error: nodeError } = await supabase
        .from('wh_nodes')
        .upsert(dbNodes, { onConflict: 'id' }) // requires 'id' to be present for updates
        .select();

      if (nodeError) throw new Error(`Node save failed: ${nodeError.message}`);
      
      // Map temporary IDs to real DB IDs (for edges)
      // This is complex. For now, we assume users hit "Refresh" after adding new nodes 
      // or we just save existing ones correctly.
      
      // 3. Re-create Edges
      // Strategy: Delete all edges for this graph and re-insert current ones.
      // This handles deletions and moves easily.
      
      const { error: deleteError } = await supabase
        .from('wh_edges')
        .delete()
        .eq('graph_id', currentGraphId);
        
      if (deleteError) throw deleteError;

      // Prepare Edges
      // We need to map the "Source ID" and "Target ID" to the REAL database IDs.
      // If you added a new node "temp-1", you can't save an edge to "temp-1". 
      // *Pro-tip*: For this stage, assume only saving edges between existing (saved) nodes works reliably 
      // without a full state reload.
      
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