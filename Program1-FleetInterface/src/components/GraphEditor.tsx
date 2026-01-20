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
  ConnectionLineType,
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
  XCircle,
  Link as LinkIcon,
  // Icons for Node Types
  Box, ArrowDownToLine, ArrowUpFromLine, Zap, CircleDot, HelpCircle,
  Edit3,
  Layers // For Level/Height
} from 'lucide-react';

import { useGraphData } from '../hooks/useGraphData';
import { supabase } from '../lib/supabaseClient';

// --- HELPER: CUSTOM HANDLES ---
// Renders handles on all 4 sides for flexible connections
const CreateHandleInternal = ({ pos, id, className, isConnectable }: any) => (
  <>
    <Handle type="source" position={pos} id={`${id}-source`} isConnectable={isConnectable} className={className} />
    <Handle type="target" position={pos} id={`${id}-target`} isConnectable={isConnectable} className={className} style={{ pointerEvents: 'none' }} />
  </>
);

// --- CONFIG: NODE STYLES ---
const NODE_STYLES: Record<string, { color: string, icon: React.ElementType, label: string }> = {
  shelf: { color: 'bg-cyan-600 border-cyan-200 shadow-cyan-900/20', icon: Box, label: 'SHELF' },
  inbound: { color: 'bg-emerald-600 border-emerald-200 shadow-emerald-900/20', icon: ArrowDownToLine, label: 'INBOUND' },
  outbound: { color: 'bg-orange-600 border-orange-200 shadow-orange-900/20', icon: ArrowUpFromLine, label: 'OUTBOUND' },
  charger: { color: 'bg-yellow-500 border-yellow-200 shadow-yellow-900/20', icon: Zap, label: 'CHARGER' },
  waypoint: { color: 'bg-slate-600 border-slate-200 shadow-slate-900/20', icon: CircleDot, label: 'WAYPOINT' },
  default: { color: 'bg-slate-400 border-slate-200', icon: HelpCircle, label: 'UNKNOWN' }
};

// --- CUSTOM NODE COMPONENT ---
const WaypointNode = ({ data, isConnectable, selected }: NodeProps) => {
  const nodeType = data.type || 'waypoint';
  const style = NODE_STYLES[nodeType] || NODE_STYLES.default;
  const Icon = style.icon;

  // Show level badge if > 0
  const level = data.level || 0;

  return (
    <div className="group relative flex flex-col items-center justify-center">
      
      {/* Tooltip Label */}
      <div className="absolute -top-12 flex flex-col items-center z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-all duration-200 translate-y-2 group-hover:translate-y-0">
        <div className="bg-slate-900/95 text-white text-[10px] px-2.5 py-1.5 rounded-md shadow-xl backdrop-blur-md whitespace-nowrap flex items-center gap-2 border border-slate-700">
           <span className="font-bold text-slate-100 tracking-wide">{data.label}</span>
           <span className="w-px h-3 bg-slate-600"></span>
           <span className="font-mono text-[9px] uppercase font-bold text-slate-300">{style.label}</span>
        </div>
        <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1 border-r border-b border-slate-700"></div>
      </div>
      
      {/* Node Body */}
      <div 
        className={`
          w-9 h-9 rounded-full shadow-lg flex items-center justify-center 
          border-[3px] transition-all cursor-move z-20 relative
          ${style.color}
          ${selected ? 'ring-4 ring-blue-500/30 scale-110' : ''} 
        `}
      >
        <Icon size={16} className="text-white drop-shadow-sm" strokeWidth={2.5} />
        
        {/* Level Badge (Only show if not 0) */}
        {level > 0 && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-purple-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center border border-white shadow-sm">
            {level}
          </div>
        )}
      </div>

      {/* Connection Handles (Only visible on hover + connect mode) */}
      <CreateHandleInternal pos={Position.Top} id="top" className="w-3 h-3 !bg-white !border-2 !border-blue-500 !rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-50 -top-1.5" isConnectable={isConnectable} />
      <CreateHandleInternal pos={Position.Bottom} id="bottom" className="w-3 h-3 !bg-white !border-2 !border-blue-500 !rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-50 -bottom-1.5" isConnectable={isConnectable} />
      <CreateHandleInternal pos={Position.Right} id="right" className="w-3 h-3 !bg-white !border-2 !border-blue-500 !rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-50 -right-1.5" isConnectable={isConnectable} />
      <CreateHandleInternal pos={Position.Left} id="left" className="w-3 h-3 !bg-white !border-2 !border-blue-500 !rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-50 -left-1.5" isConnectable={isConnectable} />
    </div>
  );
};

const nodeTypes = { waypointNode: WaypointNode };

// --- MAIN COMPONENT PROPS ---
interface GraphEditorProps {
  graphId: number;
}

// --- MAIN COMPONENT ---
const GraphEditor: React.FC<GraphEditorProps> = ({ graphId }) => {
  // React Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  
  // Editor State
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toolMode, setToolMode] = useState<'move' | 'connect'>('move');

  // Custom Hook for Supabase Data
  const { loadGraph, saveGraph, loading } = useGraphData(graphId);

  // Helper: Get currently selected node
  const selectedNode = useMemo(() => nodes.find((n) => n.selected), [nodes]);

  // Helper: Update a specific property of the selected node
  const updateSelectedNode = (key: string, value: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.selected) {
          return { ...node, data: { ...node.data, [key]: value } };
        }
        return node;
      })
    );
  };

  // --- 1. LOAD DATA ---
  useEffect(() => {
    const fetchData = async () => {
      const { nodes: dbNodes, edges: dbEdges, mapUrl } = await loadGraph();
      setNodes(dbNodes);
      setEdges(dbEdges);
      setBgUrl(mapUrl || null);
    };
    fetchData();
  }, [graphId, loadGraph, setNodes, setEdges]); 

  // --- 2. HANDLERS ---

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

  const addNode = () => {
    const id = `temp_${Date.now()}`;
    const newNode: Node = {
      id,
      type: 'waypointNode',
      position: {
        x: 100 + Math.random() * 200,
        y: 100 + Math.random() * 200,
      },
      data: { label: `N_${nodes.length + 1}`, type: 'waypoint', level: 0 },
    };
    setNodes((nds) => nds.concat(newNode));
    setToolMode('move'); // Switch to move mode to place it
  };

  const handleDelete = useCallback(() => {
    setNodes((nds) => nds.filter((node) => !node.selected));
    setEdges((eds) => eds.filter((edge) => !edge.selected));
  }, [setNodes, setEdges]);

  // Upload Map Image
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      // Create unique filename: map_{id}_{timestamp}_{clean_name}
      const fileName = `map_${graphId}_${Date.now()}_${file.name.replace(/\s/g, '')}`;
      
      const { error: uploadError } = await supabase.storage.from('maps').upload(fileName, file);
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage.from('maps').getPublicUrl(fileName);
      
      // Update Database
      await supabase.from('wh_graphs').update({ map_url: publicUrl }).eq('id', graphId);
      
      setBgUrl(publicUrl);
      alert('Map uploaded successfully!');

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error(error);
      alert(`Upload failed: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  // Remove Map Image
  const handleRemoveBackground = async () => {
    if (!window.confirm("Are you sure you want to remove the background map?")) return;
    try {
      setUploading(true);
      await supabase.from('wh_graphs').update({ map_url: null }).eq('id', graphId);
      setBgUrl(null);
    } catch (error) {
      alert('Failed to remove image');
    } finally {
      setUploading(false);
    }
  };

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
        connectionLineType={ConnectionLineType.Straight}
        
        // Tool Switcher Logic
        nodesDraggable={toolMode === 'move'}
        nodesConnectable={toolMode === 'connect'}
        
        // Deselect when clicking empty space
        onPaneClick={() => setNodes((nds) => nds.map((n) => ({ ...n, selected: false })))}
      >


        <Background color="#cbd5e1" gap={20} size={1} variant={BackgroundVariant.Dots} />

        {/* --- 2. HEADER INFO --- */}
        <Panel position="top-left" className="m-4">
          <div className="bg-white/90 backdrop-blur border border-slate-200 shadow-sm px-4 py-3 rounded-xl flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
              <LayoutGrid size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 leading-tight">Map Designer</h2>
              <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                 <span>EDITING ID: <span className="text-blue-600 font-bold">#{graphId}</span></span>
                 {loading && <span className="text-amber-500 animate-pulse">(SYNCING...)</span>}
              </div>
            </div>
          </div>
        </Panel>

        {/* --- 3. RIGHT TOOLBAR --- */}
        <Panel position="top-right" className="m-4 flex flex-col gap-2 items-end">
          
          {/* A. NODE PROPERTIES PANEL (Visible only when node selected) */}
          {selectedNode && (
            <div className="bg-white/90 backdrop-blur border border-blue-200 shadow-xl rounded-xl p-3 flex flex-col gap-2 w-64 animate-in slide-in-from-right-4">
              <div className="flex items-center gap-2 text-blue-600 border-b border-blue-100 pb-2 mb-1">
                <Edit3 size={14} />
                <span className="text-xs font-bold uppercase">Edit Node Props</span>
              </div>
              
              {/* Name Input */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Node Name</label>
                <input 
                  type="text" 
                  value={selectedNode.data.label}
                  onChange={(e) => updateSelectedNode('label', e.target.value)}
                  className="text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              {/* Type Select */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Node Type</label>
                <select 
                  value={selectedNode.data.type || 'waypoint'}
                  onChange={(e) => updateSelectedNode('type', e.target.value)}
                  className="text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:border-blue-500 bg-white"
                >
                  <option value="waypoint">Waypoint</option>
                  <option value="shelf">Shelf</option>
                  <option value="inbound">Inbound</option>
                  <option value="outbound">Outbound</option>
                  <option value="charger">Charger</option>
                </select>
              </div>

              {/* Level / Height Stepper */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                  <Layers size={10} /> Level (Height)
                </label>
                <div className="flex items-center gap-2">
                   <button 
                     onClick={() => updateSelectedNode('level', Math.max(0, (Number(selectedNode.data.level) || 0) - 1))}
                     className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-600 font-bold text-xs"
                   >-</button>
                   
                   <input 
                      type="number"
                      min="0"
                      value={selectedNode.data.level || 0}
                      onChange={(e) => updateSelectedNode('level', parseInt(e.target.value) || 0)}
                      className="flex-1 text-xs text-center border border-slate-300 rounded py-1 font-mono focus:outline-none focus:border-blue-500"
                   />

                   <button 
                     onClick={() => updateSelectedNode('level', (Number(selectedNode.data.level) || 0) + 1)}
                     className="w-6 h-6 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded text-slate-600 font-bold text-xs"
                   >+</button>
                </div>
              </div>

            </div>
          )}

          {/* B. GLOBAL TOOLS BUTTONS */}
          <div className="bg-white/90 backdrop-blur border border-slate-200 shadow-lg rounded-xl p-1.5 flex gap-1">
            <div className="flex gap-1 pr-2 border-r border-slate-200 items-center">
              
              {/* Map Controls */}
              {bgUrl && (
                <button onClick={handleRemoveBackground} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Remove Map">
                  <XCircle size={18} />
                </button>
              )}

              <label className="cursor-pointer p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all group relative" title="Upload Map">
                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                <Upload size={18} />
              </label>

              {/* Tool Switcher: Move vs Connect */}
              <button 
                onClick={() => setToolMode('move')}
                className={`p-2 rounded-lg transition-all ${
                  toolMode === 'move' 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'
                }`}
                title="Move Tool (Drag Nodes)"
              >
                <MousePointer2 size={18} />
              </button>

              <button 
                onClick={() => setToolMode('connect')}
                className={`p-2 rounded-lg transition-all ${
                  toolMode === 'connect' 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-slate-500 hover:text-blue-600 hover:bg-blue-50'
                }`}
                title="Connect Tool (Draw Lines)"
              >
                <LinkIcon size={18} />
              </button>

              {/* Editor Actions */}
              <button onClick={addNode} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Add Waypoint">
                <PlusCircle size={18} />
              </button>

              <button onClick={handleDelete} className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Delete Selected">
                <Trash2 size={18} />
              </button>
            </div>

            {/* Sync Actions */}
            <div className="flex gap-1 pl-1">
              <button 
                onClick={async () => {
                  const { nodes: dbNodes, edges: dbEdges, mapUrl } = await loadGraph();
                  setNodes(dbNodes);
                  setEdges(dbEdges);
                  setBgUrl(mapUrl || null);
                }} 
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all" 
                title="Reload"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              </button>

              <button 
                onClick={async () => {
                  const success = await saveGraph(nodes, edges);
                  if (success) {
                    const { nodes: dbNodes, edges: dbEdges } = await loadGraph();
                    setNodes(dbNodes);
                    setEdges(dbEdges);
                  }
                }} 
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 shadow-md transition-all active:translate-y-0.5"
              >
                <Save size={14} />
                <span>SAVE</span>
              </button>
            </div>
          </div>
        </Panel>

        {/* --- 4. BOTTOM STATUS BAR --- */}
        <Panel position="bottom-center" className="mb-2">
          <div className="bg-slate-800/90 backdrop-blur text-slate-300 text-[10px] font-mono px-4 py-1.5 rounded-full flex gap-4 shadow-lg border border-slate-700">
            <span>MODE: <span className="text-white font-bold">{toolMode.toUpperCase()}</span></span>
            <span className="text-slate-600">|</span>
            <span>NODES: {nodes.filter((n) => n.id !== 'map-background').length}</span>
            <span className="text-slate-600">|</span>
            <span>EDGES: {edges.length}</span>
          </div>
        </Panel>

        <Controls />
        <MiniMap 
          className="!bg-slate-100 border border-slate-300 rounded-lg"
          nodeColor={(n) => {
             const type = n.data?.type || 'waypoint';
             if (type === 'shelf') return '#0891b2';
             if (type === 'inbound') return '#059669';
             if (type === 'outbound') return '#ea580c';
             if (type === 'charger') return '#eab308';
             return '#475569';
          }}
        />
      </ReactFlow>
    </div>
  );
};

export default GraphEditor;