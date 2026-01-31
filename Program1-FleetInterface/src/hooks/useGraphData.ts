import { useState, useCallback } from 'react';
import { type Node, type Edge, MarkerType } from 'reactflow';
import { supabase } from '../lib/supabaseClient';
import { type DBNode, type DBEdge, type NodeType } from '../types/database';

const SCALE_FACTOR = 100;

// CHANGE: Accept 'graphId' (number) instead of string name
export const useGraphData = (graphId: number) => {
  const [loading, setLoading] = useState(false);

  // =========================================================
  // 1. READ OPERATION (FETCH MAP)
  // =========================================================
  const loadGraph = useCallback(async () => {
    if (!graphId) return { nodes: [], edges: [], mapUrl: null };

    setLoading(true);
    try {
      // CHANGE: Query by ID directly
      const { data: graphData, error: graphError } = await supabase
        .from('wh_graphs')
        .select('*')
        .eq('id', graphId)
        .single();

      if (graphError || !graphData) throw new Error('Graph not found');

      // Get Nodes
      const { data: nodeData, error: nodeError } = await supabase
        .from('wh_nodes')
        .select('*')
        .eq('graph_id', graphId);

      if (nodeError) throw nodeError;

      // Get Edges
      const { data: edgeData, error: edgeError } = await supabase
        .from('wh_edges')
        .select('*')
        .eq('graph_id', graphId);

      if (edgeError) throw edgeError;

      // Transform Nodes
      const flowNodes: Node[] = (nodeData as DBNode[]).map((n) => ({
        id: n.id.toString(),
        type: 'waypointNode',
        position: { x: n.x * SCALE_FACTOR, y: n.y * SCALE_FACTOR },
        data: { label: n.name, type: n.type, level: n.level || 0 },
      }));

      // Background Image
      const mapUrl = graphData.map_url;
      if (mapUrl) {
        flowNodes.unshift({
          id: 'map-background',
          type: 'group',
          position: { x: 0, y: 0 },
          data: { label: null },
          style: {
            width: 3000,
            height: 2000,
            backgroundImage: `url(${mapUrl})`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            zIndex: -10,
            pointerEvents: 'none',
          },
          draggable: false,
          selectable: false,
        });
      }

      // Transform Edges
      const flowEdges: Edge[] = (edgeData as DBEdge[]).map((e) => ({
        id: `e${e.node_a_id}-${e.node_b_id}`,
        source: e.node_a_id.toString(),
        target: e.node_b_id.toString(),
        type: 'straight',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '5,5' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
      }));

      return { nodes: flowNodes, edges: flowEdges, mapUrl };

    } catch (error: unknown) {
      console.error('Error loading graph:', error);
      return { nodes: [], edges: [], mapUrl: null };
    } finally {
      setLoading(false);
    }
  }, [graphId]);

  // =========================================================
  // 2. WRITE OPERATION (SAVE MAP)
  // =========================================================
  const saveGraph = useCallback(async (nodes: Node[], edges: Edge[]) => {
    if (!graphId) {
      alert("Error: No graph ID loaded. Cannot save.");
      return false;
    }
    setLoading(true);

    try {
      const idMap = new Map<string, number>();

      const activeNodes = nodes.filter(n => n.id !== 'map-background');
      const existingNodesPayload = [];
      const newNodesPayload = [];
      const activeDbIds: number[] = [];

      for (const n of activeNodes) {
        const nodeType = (n.data.type || 'waypoint') as NodeType;
        const nodeLevel = Number(n.data.level) || 0;
        const numericId = Number(n.id);
        const isNewNode = isNaN(numericId);

        if (!isNewNode) {
          idMap.set(n.id, numericId);
          activeDbIds.push(numericId);

          existingNodesPayload.push({
            id: numericId,
            graph_id: graphId, // Use prop ID
            x: n.position.x / SCALE_FACTOR,
            y: n.position.y / SCALE_FACTOR,
            name: n.data.label,
            type: nodeType,
            a: 0,
            level: nodeLevel
          });
        } else {
          newNodesPayload.push({
            _tempId: n.id,
            graph_id: graphId, // Use prop ID
            x: n.position.x / SCALE_FACTOR,
            y: n.position.y / SCALE_FACTOR,
            name: n.data.label || 'New Node',
            type: nodeType,
            a: 0,
            level: nodeLevel
          });
        }
      }

      // Cleanup Edges
      const { error: deleteEdgesError } = await supabase
        .from('wh_edges')
        .delete()
        .eq('graph_id', graphId);
      if (deleteEdgesError) throw deleteEdgesError;

      // Cleanup Nodes
      if (activeDbIds.length > 0) {
        const { error: deleteNodesError } = await supabase
          .from('wh_nodes')
          .delete()
          .eq('graph_id', graphId)
          .not('id', 'in', `(${activeDbIds.join(',')})`);
        if (deleteNodesError) throw new Error(`Delete failed: ${deleteNodesError.message}`);
      } else if (newNodesPayload.length === 0 && existingNodesPayload.length === 0) {
        // Safe to delete all if list is empty
        const { error: deleteAllError } = await supabase
          .from('wh_nodes')
          .delete()
          .eq('graph_id', graphId);
        if (deleteAllError) throw deleteAllError;
      }

      // Update Existing
      if (existingNodesPayload.length > 0) {
        const { error: updateError } = await supabase
          .from('wh_nodes')
          .upsert(existingNodesPayload);
        if (updateError) throw new Error(`Update failed: ${updateError.message}`);
      }

      // Insert New
      if (newNodesPayload.length > 0) {
        const dbPayload = newNodesPayload.map(({ _tempId, ...rest }) => rest);
        const { data: insertedNodes, error: insertError } = await supabase
          .from('wh_nodes')
          .insert(dbPayload)
          .select('id');

        if (insertError) throw new Error(`Insert failed: ${insertError.message}`);
        if (!insertedNodes) throw new Error("No data returned from insert");

        newNodesPayload.forEach((tempNode, index) => {
          const realId = insertedNodes[index].id;
          idMap.set(tempNode._tempId, realId);
        });
      }

      // Save Edges
      const validEdges = edges.map(e => {
        const sourceId = idMap.get(e.source);
        const targetId = idMap.get(e.target);
        if (sourceId === undefined || targetId === undefined) return null;
        return {
          graph_id: graphId,
          node_a_id: sourceId,
          node_b_id: targetId
        };
      }).filter(Boolean);

      if (validEdges.length > 0) {
        const { error: edgeError } = await supabase
          .from('wh_edges')
          .insert(validEdges);
        if (edgeError) throw new Error(`Edge save failed: ${edgeError.message}`);
      }

      // =================================================
      // 3. AUTO-GENERATE LEVELS & CELLS (CRITICAL FIX)
      // =================================================

      // A. Ensure Basic Levels Exist (0 and 1)
      const { data: existingLevels } = await supabase
        .from('wh_levels')
        .select('*')
        .eq('graph_id', graphId);

      const levelMap = new Map<number, number>(); // level_val -> level_id
      if (existingLevels) {
        existingLevels.forEach((l: any) => levelMap.set(l.level, l.id));
      }

      // If Level 0 or 1 missing, create them
      const levelsToCreate = [];
      if (!levelMap.has(0)) levelsToCreate.push({ graph_id: graphId, level: 0, height: 0 });
      if (!levelMap.has(1)) levelsToCreate.push({ graph_id: graphId, level: 1, height: 2.5 }); // Standard height

      if (levelsToCreate.length > 0) {
        const { data: newLevels, error: levelError } = await supabase
          .from('wh_levels')
          .insert(levelsToCreate)
          .select();

        if (levelError) console.warn("Level creation warning:", levelError);
        else if (newLevels) {
          newLevels.forEach((l: any) => levelMap.set(l.level, l.id));
        }
      }

      // B. Create Cells for All Nodes
      // Use the idMap (tempId -> realId) and node data to map nodes to levels
      const cellsPayload = [];

      // Combine new and existing nodes for processing
      const allActiveNodes = [...existingNodesPayload, ...newNodesPayload];

      for (const nodePayload of allActiveNodes) {
        // Determine Node ID
        let realNodeId: number | undefined;
        if ('_tempId' in nodePayload) {
          realNodeId = idMap.get((nodePayload as any)._tempId);
        } else {
          realNodeId = nodePayload.id;
        }

        if (!realNodeId) continue;

        // Determine Level ID (Default to Level 0 if specified level not found)
        const nodeLevel = nodePayload.level || 0;
        const levelId = levelMap.get(nodeLevel) || levelMap.get(0);

        if (levelId) {
          cellsPayload.push({
            graph_id: graphId,
            node_id: realNodeId,
            level_id: levelId,
            height: null // Ensure XOR constraint (level_id provided, height null)
          });
        }
      }

      // Upsert Cells (Insert or Update if exists)
      // Note: We don't delete cells here to avoid losing data, relying on node deletion cascading if needed
      if (cellsPayload.length > 0) {
        const { error: cellError } = await supabase
          .from('wh_cells')
          .upsert(cellsPayload, { onConflict: 'node_id, level_id' }); // Schema unique constraint

        if (cellError) console.error("Cell auto-generation failed:", cellError);
      }

      alert("Map saved successfully! (Cells & Levels auto-updated)");
      return true;

    } catch (error: unknown) {
      console.error('Error saving map:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Save failed: ${msg}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [graphId]);

  return { loadGraph, saveGraph, loading };
};