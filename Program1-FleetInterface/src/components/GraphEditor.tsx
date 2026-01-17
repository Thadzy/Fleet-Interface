import React, { useCallback, useMemo, useEffect, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  Panel,
  MarkerType,
  BackgroundVariant,
  Handle,
  Position,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Save,
  PlusCircle,
  LayoutGrid,
  MousePointer2,
  Trash2,
  Upload,
  RefreshCw,
} from 'lucide-react';

import { useGraphData } from '../hooks/useGraphData';
import { supabase } from '../lib/supabaseClient';

// --- HELPER COMPONENTS ---

/**
 * Creates a pair of Source/Target handles for a specific position (Top, Right, Bottom, Left).
 * This ensures nodes can be connected from any side.
 */
const CreateHandleInternal = ({
  pos,
  id,
  className,
  isConnectable,
}: {
  pos: Position;
  id: string;
  className: string;
  isConnectable: boolean;
}) => (
  <>
    <Handle
      type="source"
      position={pos}
      id={`${id}-source`}
      isConnectable={isConnectable}
      className={className}
    />
    <Handle
      type="target"
      position={pos}
      id={`${id}-target`}
      isConnectable={isConnectable}
      className={className}
      style={{ pointerEvents: 'none' }}
    />
  </>
);

// --- CUSTOM NODE DEFINITION ---

/**
 * Custom Waypoint Node Component.
 * Visualizes a "Red Dot" draggable node with connection handles on all 4 sides.
 * Labels are shown in a floating tooltip above the node.
 */
const WaypointNode = ({ data, isConnectable }: NodeProps) => {
  // Styles for the connection handles (hidden by default, shown on hover)
  const handleStyle =
    'w-3 h-3 !bg-white !border-2 !border-blue-500 !rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-50';

  return (
    <div className="group relative flex flex-col items-center justify-center">
      {/* Label Tooltip */}
      <div className="absolute -top-7 whitespace-nowrap bg-slate-900/90 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm backdrop-blur-sm pointer-events-none">
        {data.label}
      </div>
      
      {/* Visual Dot */}
      <div className="w-5 h-5 bg-red-600 rounded-full border-[3px] border-white shadow-lg cursor-move z-20" />

      {/* Connection Handles (Top, Bottom, Right, Left) */}
      <CreateHandleInternal
        pos={Position.Top}
        id="top"
        className={`${handleStyle} -top-1.5`}
        isConnectable={isConnectable}
      />
      <CreateHandleInternal
        pos={Position.Bottom}
        id="bottom"
        className={`${handleStyle} -bottom-1.5`}
        isConnectable={isConnectable}
      />
      <CreateHandleInternal
        pos={Position.Right}
        id="right"
        className={`${handleStyle} -right-1.5`}
        isConnectable={isConnectable}
      />
      <CreateHandleInternal
        pos={Position.Left}
        id="left"
        className={`${handleStyle} -left-1.5`}
        isConnectable={isConnectable}
      />
    </div>
  );
};

// --- MAIN COMPONENT ---

/**
 * COMPONENT: GraphEditor (Tab 1)
 * * The core visual editor for designing warehouse layouts.
 * Responsibilities:
 * 1. Load/Save graph data (Nodes/Edges) to Supabase.
 * 2. Upload and display warehouse floorplans (images).
 * 3. Provide tools to Add, Delete, and Connect nodes visually.
 */
const GraphEditor: React.FC = () => {
  // Define custom node types for React Flow
  const nodeTypes = useMemo(() => ({ waypointNode: WaypointNode }), []);
  
  // React Flow State (Nodes & Edges)
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // =========================================================
  // 1. STATE MANAGEMENT (MAP SELECTION)
  // =========================================================
  const [mapList, setMapList] = useState<string[]>([]);
  const [currentMap, setCurrentMap] = useState<string>('warehouse_A');
  const [uploading, setUploading] = useState(false);

  // =========================================================
  // 2. DATA LOADING
  // =========================================================

  // Fetch list of available map names on mount
  useEffect(() => {
    const fetchMaps = async () => {
      const { data } = await supabase.from('wh_graphs').select('name');
      if (data) {
        setMapList(data.map((d) => d.name));
      }
    };
    fetchMaps();
  }, []);

  // Use Custom Hook to manage DB operations for the *current* map
  const { loadGraph, saveGraph, loading } = useGraphData(currentMap);

  // Load Graph Data whenever the selected map changes
  useEffect(() => {
    const fetchData = async () => {
      const { nodes: dbNodes, edges: dbEdges } = await loadGraph();
      // Always set nodes/edges (even if empty) to clear the canvas between map switches
      setNodes(dbNodes);
      setEdges(dbEdges);
    };
    fetchData();
  }, [loadGraph, setNodes, setEdges]); 

  // =========================================================
  // 3. EDITOR ACTIONS
  // =========================================================

  /**
   * Handle creating connections between nodes.
   * Adds a styled "Edge" (dotted blue line) when user drags between handles.
   */
  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge = {
        ...params,
        type: 'straight',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '5,5' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
      };
      setEdges((eds) => addEdge(newEdge, eds));
    },
    [setEdges]
  );

  /**
   * Add a new "Waypoint" node to the canvas.
   * Uses a temporary ID (timestamp) which is replaced by a real DB ID upon saving.
   */
  const addNode = () => {
    const id = `temp_${Date.now()}`;
    const newNode: Node = {
      id,
      type: 'waypointNode',
      position: {
        x: 400 + Math.random() * 100, // Random offset to avoid stacking
        y: 300 + Math.random() * 100,
      },
      data: { label: `NEW` },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  /**
   * Delete ONLY the currently selected nodes/edges.
   * Filters the state array to remove items where `selected === true`.
   */
  const handleDelete = useCallback(() => {
    setNodes((nds) => nds.filter((node) => !node.selected));
    setEdges((eds) => eds.filter((edge) => !edge.selected));
  }, [setNodes, setEdges]);

  /**
   * Uploads a new map background image to Supabase Storage.
   * Updates the `wh_graphs` table with the new public URL.
   */
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true); 

      // 1. Upload file to 'maps' bucket
      const fileName = `map_${Date.now()}_${file.name.replace(/\s/g, '')}`;
      // FIX: Removed unused 'uploadData' variable to satisfy linter
      const { error: uploadError } = await supabase.storage
        .from('maps')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('maps')
        .getPublicUrl(fileName);

      // 3. Update Database Record
      const { error: dbError } = await supabase
        .from('wh_graphs')
        .update({ map_url: publicUrl })
        .eq('name', currentMap);

      if (dbError) throw dbError;

      alert('Map uploaded successfully!');

      // 4. Reload Graph to show new background
      const { nodes: newNodes, edges: newEdges } = await loadGraph();
      setNodes(newNodes);
      setEdges(newEdges);

    } catch (error: unknown) {
      console.error('Upload failed:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      alert(`Upload failed: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  // =========================================================
  // 4. RENDER
  // =========================================================

  return (
    <div className="w-full h-full bg-slate-50 relative font-sans">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        minZoom={0.1}
        maxZoom={4}
        defaultEdgeOptions={{ type: 'straight' }}
      >
        <Background
          color="#cbd5e1"
          gap={20}
          size={1}
          variant={BackgroundVariant.Dots}
        />

        {/* --- PANEL: HEADER & MAP SELECTOR --- */}
        <Panel position="top-left" className="m-4">
          <div className="bg-white/90 backdrop-blur border border-slate-200 shadow-sm px-4 py-3 rounded-xl flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
              <LayoutGrid size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 leading-tight">
                Map Designer
              </h2>

              <select
                value={currentMap}
                onChange={(e) => setCurrentMap(e.target.value)}
                className="text-[10px] text-slate-500 font-mono bg-transparent border-none outline-none cursor-pointer hover:text-blue-600"
              >
                {mapList.map((name) => (
                  <option key={name} value={name}>
                    EDITING: {name.toUpperCase()}
                  </option>
                ))}
              </select>

              <div className="h-6 w-px bg-slate-200 mx-1"></div>
              {/* Sync Status Indicator */}
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                <span
                  className={`w-2 h-2 rounded-full ${
                    loading || uploading
                      ? 'bg-yellow-500 animate-ping'
                      : 'bg-green-500'
                  }`}
                ></span>
                {loading || uploading ? 'SYNCING...' : 'ONLINE'}
              </div>
            </div>
          </div>
        </Panel>

        {/* --- PANEL: TOOLBAR --- */}
        <Panel position="top-right" className="m-4">
          <div className="bg-white/90 backdrop-blur border border-slate-200 shadow-lg rounded-xl p-1.5 flex gap-1">
            <div className="flex gap-1 pr-2 border-r border-slate-200 items-center">
              {/* File Upload Button */}
              <label className="cursor-pointer p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all group relative">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Upload size={18} />
              </label>

              <button className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                <MousePointer2 size={18} />
              </button>

              <button
                onClick={addNode}
                className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                title="Add Waypoint"
              >
                <PlusCircle size={18} />
              </button>

              <button
                onClick={handleDelete}
                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                title="Delete Selected (Backspace)"
              >
                <Trash2 size={18} />
              </button>
            </div>

            <div className="flex gap-1 pl-1">
              {/* Refresh Button */}
              <button
                onClick={async () => {
                  const { nodes: dbNodes, edges: dbEdges } = await loadGraph();
                  setNodes(dbNodes);
                  setEdges(dbEdges);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                <RefreshCw
                  size={18}
                  className={loading ? 'animate-spin' : ''}
                />
              </button>

              {/* SAVE BUTTON */}
              <button
                onClick={async () => {
                  const success = await saveGraph(nodes, edges);
                  if (success) {
                    // Reload to replace temporary IDs with real DB IDs
                    const { nodes: dbNodes, edges: dbEdges } = await loadGraph();
                    setNodes(dbNodes);
                    setEdges(dbEdges);
                  }
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 shadow-md transition-all active:translate-y-0.5"
              >
                <Save size={14} />
                <span>SAVE MAP</span>
              </button>
            </div>
          </div>
        </Panel>

        {/* --- PANEL: STATUS BAR --- */}
        <Panel position="bottom-center" className="mb-2">
          <div className="bg-slate-800/90 backdrop-blur text-slate-300 text-[10px] font-mono px-4 py-1.5 rounded-full flex gap-4 shadow-lg border border-slate-700">
            <span>
              NODES: {nodes.filter((n) => n.id !== 'map-background').length}
            </span>
            <span className="text-slate-600">|</span>
            <span>EDGES: {edges.length}</span>
            <span className="text-slate-600">|</span>
            <span>ZOOM: 100%</span>
          </div>
        </Panel>

        <Controls />
        <MiniMap
          className="!bg-slate-100 border border-slate-300 rounded-lg"
          nodeColor={(n) => (n.type === 'waypointNode' ? '#ef4444' : '#e2e8f0')}
        />
      </ReactFlow>
    </div>
  );
};

export default GraphEditor;