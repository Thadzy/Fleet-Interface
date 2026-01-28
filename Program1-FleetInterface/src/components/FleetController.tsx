import React, { useMemo, useEffect, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  Panel,
  BackgroundVariant,
  type NodeProps,
  Handle,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Truck, PauseCircle, PlayCircle, AlertOctagon,
  Battery, Wifi, Activity,
  Box, ArrowDownToLine, ArrowUpFromLine, Zap, CircleDot, HelpCircle
} from 'lucide-react';

import { useGraphData } from '../hooks/useGraphData';
import { supabase } from '../lib/supabaseClient';
import { type DBRobot } from '../types/database';

// --- CONFIG: NODE STYLES (Copied from GraphEditor to match UI) ---
const NODE_STYLES: Record<string, { color: string, icon: React.ElementType, label: string }> = {
  shelf: { color: 'bg-cyan-600 border-cyan-200 shadow-cyan-900/20', icon: Box, label: 'SHELF' },
  inbound: { color: 'bg-emerald-600 border-emerald-200 shadow-emerald-900/20', icon: ArrowDownToLine, label: 'INBOUND' },
  outbound: { color: 'bg-orange-600 border-orange-200 shadow-orange-900/20', icon: ArrowUpFromLine, label: 'OUTBOUND' },
  charger: { color: 'bg-yellow-500 border-yellow-200 shadow-yellow-900/20', icon: Zap, label: 'CHARGER' },
  waypoint: { color: 'bg-slate-600 border-slate-200 shadow-slate-900/20', icon: CircleDot, label: 'WAYPOINT' },
  default: { color: 'bg-slate-400 border-slate-200', icon: HelpCircle, label: 'UNKNOWN' }
};

// --- HELPER: CUSTOM HANDLES ---
const CreateHandleInternal = ({ pos, id, className }: any) => (
  <>
    <Handle type="source" position={pos} id={`${id}-source`} isConnectable={false} className={className} style={{ opacity: 0 }} />
    <Handle type="target" position={pos} id={`${id}-target`} isConnectable={false} className={className} style={{ opacity: 0 }} />
  </>
);

// --- CUSTOM NODE: WAYPOINT (Static Map Elements) ---
const WaypointNode = ({ data }: NodeProps) => {
  const nodeType = data.type || 'waypoint';
  const style = NODE_STYLES[nodeType] || NODE_STYLES.default;
  const Icon = style.icon;
  const level = data.level || 0;

  return (
    <div className="group relative flex flex-col items-center justify-center">
      {/* Node Body */}
      <div
        className={`w-4 h-4 rounded-full shadow-sm flex items-center justify-center border-2 z-10 ${style.color}`}
      >
        {/* Simplified view for Fleet Controller - smaller nodes */}
        <Icon size={8} className="text-white" strokeWidth={3} />
      </div>

      {/* Handles for edges to connect to */}
      <CreateHandleInternal pos={Position.Top} id="top" />
      <CreateHandleInternal pos={Position.Bottom} id="bottom" />
      <CreateHandleInternal pos={Position.Left} id="left" />
      <CreateHandleInternal pos={Position.Right} id="right" />
    </div>
  );
};

// --- CUSTOM ROBOT NODE ---
// Visualizes a Robot moving on the map
const RobotNode = ({ data }: NodeProps) => {
  const { label, status, battery, rotation } = data;

  const statusColors = {
    idle: 'bg-green-500 border-green-200',
    busy: 'bg-blue-500 border-blue-200',
    offline: 'bg-slate-500 border-slate-200',
    inactive: 'bg-red-500 border-red-200'
  };

  const color = statusColors[status as keyof typeof statusColors] || statusColors.offline;

  return (
    <div className="relative flex flex-col items-center justify-center pointer-events-none">
      {/* Robot Label */}
      <div className="absolute -top-8 bg-slate-900/90 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm backdrop-blur-sm whitespace-nowrap z-50">
        {label}
      </div>

      {/* Robot Body */}
      <div
        className={`w-10 h-10 ${color} rounded-lg shadow-xl flex items-center justify-center border-2 transition-all duration-500`}
      // style={{ transform: `rotate(${rotation || 0}deg)` }} // Rotation removed for simpler viewing or can be re-added
      >
        <Truck size={20} className="text-white relative z-10" />
        <div className="absolute -top-1 w-1.5 h-1.5 bg-yellow-400 rounded-full z-20"></div>
      </div>

      {/* Status Badges */}
      <div className="absolute -bottom-6 flex gap-1">
        {battery && (
          <div className="bg-slate-800 text-green-400 text-[8px] px-1 rounded flex items-center gap-0.5 border border-slate-700">
            <Battery size={8} /> {battery}%
          </div>
        )}
      </div>
    </div>
  );
};

// --- CONTROLLER COMPONENT ---

interface FleetControllerProps {
  graphId: number;
}

const FleetController: React.FC<FleetControllerProps> = ({ graphId }) => {
  // Graph Data
  const { loadGraph } = useGraphData(graphId);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Robot Data
  const [robots, setRobots] = useState<DBRobot[]>([]);
  const [loading, setLoading] = useState(true);

  // Define Node Types
  const nodeTypes = useMemo(() => ({
    robotNode: RobotNode,
    waypointNode: WaypointNode
  }), []);

  // 1. Initial Load (Map + Robots)
  useEffect(() => {
    const init = async () => {
      // Load Static Map
      const { nodes: mapNodes, edges: mapEdges } = await loadGraph();

      // Load Robots
      const { data: robotData } = await supabase.from('wh_robots').select('*');
      if (robotData) setRobots(robotData as DBRobot[]);

      // Merge Map Nodes
      setNodes(mapNodes);
      setEdges(mapEdges);
      setLoading(false);
    };
    init();
  }, [graphId, loadGraph, setNodes, setEdges]);


  // 2. Real-time Robot Updates (Supabase Subscription)
  useEffect(() => {
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wh_robots' },
        (payload) => {
          console.log('Robot Update:', payload);
          // Refresh full list for simplicity
          supabase.from('wh_robots').select('*').then(({ data }) => {
            if (data) setRobots(data as DBRobot[]);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 3. Render Robots as Nodes on ReactFlow
  useEffect(() => {
    if (robots.length === 0) return;

    setNodes((currentNodes) => {
      // Keep map nodes, remove old robot nodes
      const mapNodesOnly = currentNodes.filter(n => n.type !== 'robotNode');

      // Convert DBRobots to Flow Nodes
      const robotNodes: Node[] = robots.map((r, i) => ({
        id: `robot-${r.id}`,
        type: 'robotNode',
        position: { x: 100 + (i * 100), y: 100 }, // Mock position
        data: {
          label: r.name,
          status: r.status,
          battery: 85,
          rotation: 0
        },
        draggable: false,
        zIndex: 100,
      }));

      return [...mapNodesOnly, ...robotNodes];
    });
  }, [robots, setNodes]);


  // --- HANDLERS ---
  const sendCommand = async (robotId: number, cmd: string) => {
    alert(`Sending command [${cmd}] to Robot #${robotId} (Not connected to MQTT yet)`);
  };

  return (
    <div className="w-full h-full bg-slate-100 relative font-sans">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        minZoom={0.1}
        maxZoom={4}
        defaultEdgeOptions={{ type: 'straight' }}
      >
        <Background color="#cbd5e1" gap={20} size={1} variant={BackgroundVariant.Dots} />

        {/* --- HEADER --- */}
        <Panel position="top-left" className="m-4">
          <div className="bg-white/90 backdrop-blur border border-slate-200 shadow-xl px-4 py-3 rounded-xl flex items-center gap-4 text-slate-800">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg shadow-sm">
              <Truck size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-none">Fleet Controller</h2>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${loading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></span>
                {loading ? 'CONNECTING...' : 'ONLINE'}
                <span className="text-slate-300">|</span>
                <span>ACTIVE ROBOTS: <span className="text-slate-800 font-bold">{robots.length}</span></span>
              </div>
            </div>
          </div>
        </Panel>

        {/* --- ROBOT LIST / CONTROLS --- */}
        <Panel position="top-right" className="m-4">
          <div className="flex flex-col gap-2 w-72">
            {robots.map(r => (
              <div key={r.id} className="bg-white/90 backdrop-blur border border-slate-200 p-3 rounded-xl shadow-lg flex flex-col gap-2">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Truck size={14} className="text-slate-400" />
                    <span className="text-sm font-bold text-slate-800">{r.name}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${r.status === 'idle' ? 'bg-green-100 text-green-600' :
                    r.status === 'busy' ? 'bg-blue-100 text-blue-600' :
                      'bg-red-100 text-red-600'
                    }`}>
                    {r.status}
                  </span>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                  <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded border border-slate-100"><Battery size={10} /> 85%</div>
                  <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded border border-slate-100"><Wifi size={10} /> -64dBm</div>
                  <div className="col-span-2 flex items-center gap-1 bg-slate-50 p-1.5 rounded border border-slate-100"><Activity size={10} /> Pending Assignment #102</div>
                </div>

                {/* Actions */}
                <div className="flex gap-1 mt-1">
                  <button onClick={() => sendCommand(r.id, 'PAUSE')} className="flex-1 py-1 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded flex justify-center items-center gap-1 text-[10px] font-bold border border-amber-200 transition-all">
                    <PauseCircle size={12} /> PAUSE
                  </button>
                  <button onClick={() => sendCommand(r.id, 'RESUME')} className="flex-1 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded flex justify-center items-center gap-1 text-[10px] font-bold border border-blue-200 transition-all">
                    <PlayCircle size={12} /> RESUME
                  </button>
                  <button onClick={() => sendCommand(r.id, 'ESTOP')} className="w-8 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded flex justify-center items-center gap-1 text-[10px] font-bold border border-red-200 transition-all" title="EMERGENCY STOP">
                    <AlertOctagon size={12} />
                  </button>
                </div>
              </div>
            ))}
            {robots.length === 0 && (
              <div className="bg-white/90 text-slate-400 p-4 rounded-xl text-center text-xs italic border border-slate-200 hover:bg-white transition-colors">
                No robots detected in fleet.
              </div>
            )}
          </div>
        </Panel>

        <Controls className="!bg-white !border-slate-200 !text-slate-600 !fill-slate-600 shadow-lg" />
        <MiniMap
          className="!bg-slate-50 border border-slate-200 rounded-lg shadow-lg"
          nodeColor={(n) => n.type === 'robotNode' ? '#ef4444' : '#94a3b8'}
        />
      </ReactFlow>
    </div>
  );
};

export default FleetController;