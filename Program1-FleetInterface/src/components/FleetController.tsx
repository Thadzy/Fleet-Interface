import React, { useEffect, useState } from 'react';
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

import { supabase } from '../lib/supabaseClient';
import { type DBRobot, type DBNode, type DBEdge } from '../types/database';
import { useMQTT } from '../hooks/useMQTT';

interface FleetRobot {
  id: number;
  name: string;
  status: string;
  battery: number;
  x: number;
  y: number;
  current_task: string;
  active: boolean;
}

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

  return (
    <div className="group relative flex flex-col items-center justify-center">
      <div className={`w-4 h-4 rounded-full shadow-sm flex items-center justify-center border-2 z-10 ${style.color}`}>
        <Icon size={8} className="text-white" strokeWidth={3} />
      </div>
      <CreateHandleInternal pos={Position.Top} id="top" />
      <CreateHandleInternal pos={Position.Bottom} id="bottom" />
      <CreateHandleInternal pos={Position.Left} id="left" />
      <CreateHandleInternal pos={Position.Right} id="right" />
    </div>
  );
};

// --- CUSTOM ROBOT NODE ---
const RobotNode = ({ data }: NodeProps) => {
  const { label, status, battery } = data;

  const statusColors = {
    idle: 'bg-green-500 border-green-200',
    busy: 'bg-blue-500 border-blue-200',
    offline: 'bg-slate-500 border-slate-200',
    inactive: 'bg-red-500 border-red-200'
  };

  const color = statusColors[status as keyof typeof statusColors] || statusColors.offline;

  return (
    <div className="relative flex flex-col items-center justify-center pointer-events-none">
      <div className="absolute -top-8 bg-slate-900/90 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm backdrop-blur-sm whitespace-nowrap z-50">
        {label}
      </div>
      <div className={`w-10 h-10 ${color} rounded-lg shadow-xl flex items-center justify-center border-2 transition-all duration-500`}>
        <Truck size={20} className="text-white relative z-10" />
        <div className="absolute -top-1 w-1.5 h-1.5 bg-yellow-400 rounded-full z-20"></div>
      </div>
      <div className="absolute -bottom-6 flex gap-1">
        {battery && (
          <div className="bg-slate-800 text-green-400 text-[8px] px-1 rounded flex items-center gap-0.5 border border-slate-700">
            <Battery size={8} /> {battery}%
          </div>
        )}
      </div>

      {/* Invisible Handles for Path Edges */}
      <Handle type="source" position={Position.Bottom} id="mobile-source" style={{ opacity: 0, top: '50%', left: '50%' }} />
      <Handle type="target" position={Position.Top} id="mobile-target" style={{ opacity: 0, top: '50%', left: '50%' }} />
    </div>
  );
};

// Define node types OUTSIDE the component to prevent re-creation on every render
// Define node types OUTSIDE the component to prevent re-creation on every render
// REMOVED: NODE_TYPES (Moved to useMemo inside component)

// --- CONTROLLER COMPONENT ---

const FleetController: React.FC = () => {
  // Define node types with useMemo to silence warnings about re-creation
  const nodeTypes = React.useMemo(() => ({
    waypoint: WaypointNode,
    robotNode: RobotNode
  }), []);

  const defaultEdgeOptions = React.useMemo(() => ({ type: 'straight' }), []);

  // --- 1. STATE & HOOKS ---
  const [dbRobots, setDbRobots] = useState<DBRobot[]>([]); // Robots from DB (Metadata)
  const [robots, setRobots] = useState<FleetRobot[]>([]);  // Merged Robots (Live)
  // removed loading state

  // React Flow
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // MQTT Hook
  const { isConnected, robotStates, logs, publishCommand } = useMQTT();

  // --- 2. LOAD STATIC GRAPH & ROBOTS ---
  useEffect(() => {
    const fetchContext = async () => {
      try {
        // A. Load Graph
        const { data: graphData } = await supabase.from('wh_graphs').select('*').limit(1).single();
        if (graphData) {
          // ... (Same graph loading logic as before, omitted for brevity if unchanged,
          // but we must assume the user wants me to keep the map loading logic)
          // Effectively we just load nodes/edges here
          const { data: nData } = await supabase.from('wh_nodes').select('*').eq('graph_id', graphData.id);
          const { data: eData } = await supabase.from('wh_edges').select('*').eq('graph_id', graphData.id);

          if (nData) {
            const flowNodes: Node[] = nData.map((n: DBNode) => ({
              id: n.id.toString(),
              type: 'waypoint',
              position: { x: n.x * 100, y: n.y * 100 },
              data: { type: n.type, level: n.level },
              draggable: false,
              selectable: false,
            }));

            // Add Map Background
            if (graphData.map_url) {
              flowNodes.unshift({
                id: 'map-bg', type: 'group', position: { x: 0, y: 0 },
                data: { label: null },
                style: { width: 3000, height: 2000, backgroundImage: `url(${graphData.map_url})`, backgroundSize: 'contain', zIndex: -10 },
                draggable: false
              });
            }
            setNodes(flowNodes);
          }
          if (eData) {
            setEdges(eData.map((e: DBEdge) => ({
              id: `e${e.node_a_id}-${e.node_b_id}`,
              source: e.node_a_id.toString(), target: e.node_b_id.toString(),
              style: { stroke: '#cbd5e1' }
            })));
          }
        }

        // B. Load Robots (Initial List)
        const { data: robotData } = await supabase.from('wh_robots').select('*');
        if (robotData) {
          setDbRobots(robotData as DBRobot[]);
        }

      } catch (err) {
        console.error("Load Error:", err);
      }
    };

    fetchContext();
  }, [setNodes, setEdges]); // Only run on mount

  // --- 3. MERGE DB DATA + MQTT DATA ---
  // --- 4. PATH VISUALIZATION (New) ---
  useEffect(() => {
    const fetchPaths = async () => {
      // Find active robots
      const activeBots = robots.filter(r => r.active); // Or just all robots that have tasks
      if (activeBots.length === 0) return;

      // For simplicity, let's fetch ALL tasks for 'in_progress' assignments
      const { data: assignments } = await supabase.from('wh_assignments').select('id, robot_id').eq('status', 'in_progress');
      if (!assignments || assignments.length === 0) return;

      const assignmentIds = assignments.map(a => a.id);
      const { data: tasks } = await supabase.from('wh_tasks')
        .select('*')
        .in('assignment_id', assignmentIds)
        .neq('status', 'delivered') // Only show pending/active tasks
        .order('seq_order');

      if (!tasks) return;

      // Draw Edges!
      // We need to map Task -> Cell -> Node ID
      // This requires knowing the Node ID for each Cell. We didn't load cells in state explicitly yet.
      // Let's do a quick fetch of relevant cells or just fetch all cells (lightweight).
      const { data: cells } = await supabase.from('wh_cells').select('id, node_id');
      const cellMap = new Map<number, number>(); // cell_id -> node_id
      cells?.forEach(c => cellMap.set(c.id, c.node_id));

      const pathEdges: any[] = [];

      // Group tasks by Assignment
      assignments.forEach(asn => {
        const asnTasks = tasks.filter(t => t.assignment_id === asn.id);
        if (asnTasks.length === 0) return;

        // Current Robot Position (Start of Path)
        const bot = robots.find(r => r.id === asn.robot_id) || robots.find(r => r.id === 1); // fallback
        // Connect to the generic handle we just added
        let prevSource = bot ? `robot-${bot.id}` : null;
        let prevSourceHandle = 'mobile-source'; // Start from robot center

        asnTasks.forEach((task, i) => {
          const targetNodeId = cellMap.get(task.cell_id);
          if (!targetNodeId) return;

          const targetHandle = targetNodeId.toString(); // Node IDs are strings in ReactFlow

          if (prevSource) {
            pathEdges.push({
              id: `path-${asn.id}-${i}`,
              source: prevSource,
              sourceHandle: prevSourceHandle,
              target: targetHandle,
              // Target handle: specific side? Just default (null) usually works or 'top' etc if defined. 
              // WaypointNodes have 'top', 'bottom', 'left', 'right'. Let's pick 'top' for simplicity or closest.
              targetHandle: 'top-target',
              animated: true,
              style: { stroke: '#22c55e', strokeWidth: 2, strokeDasharray: '5,5' }, // Green Dashed
            });
          }
          prevSource = targetHandle;
          prevSourceHandle = 'bottom-source'; // Subsequent segments go from Node to Node (Bottom to Top)
        });
      });

      setEdges(prev => {
        // Keep static map edges (grey)
        const mapEdges = prev.filter(e => !e.id.startsWith('path-'));
        return [...mapEdges, ...pathEdges];
      });
    };

    // Poll for path updates every 1s
    const interval = setInterval(fetchPaths, 1000);
    fetchPaths(); // Initial
    return () => clearInterval(interval);

  }, [robots, setEdges]); // Dep on robots to update start position

  useEffect(() => {
    if (dbRobots.length === 0) return;

    const mergedList: FleetRobot[] = dbRobots.map(dbBot => {
      // Check if we have live data for this robot
      const liveData = robotStates[dbBot.id] || robotStates[dbBot.name]; // Try ID or Name match

      // Debug Matching
      // if (liveData) console.log(`[FleetController] Matched Robot ${dbBot.id} with Live Data:`, liveData);
      // else console.log(`[FleetController] No Live Data for Robot ${dbBot.id} (Keys: ${Object.keys(robotStates)})`);

      return {
        id: dbBot.id,
        name: dbBot.name,
        // Prefer live data, fallback to defaults or DB if needed
        status: liveData?.status || 'offline',
        battery: liveData?.battery || 0,
        // If live data exists, use it (converted to map scale). Else use a holding area.
        x: liveData ? liveData.x * 100 : 50,
        y: liveData ? liveData.y * 100 : 50 + (dbBot.id * 50),
        current_task: liveData?.current_task_id ? `Task #${liveData.current_task_id}` : 'Idle',
        active: !!liveData
      };
    });

    setRobots(mergedList);

    // Update Robot Nodes in ReactFlow
    setNodes(prevNodes => {
      // Remove old robot nodes
      const staticNodes = prevNodes.filter(n => n.type !== 'robotNode');

      // Create new robot nodes
      const robotNodes: Node[] = mergedList.map(r => ({
        id: `robot-${r.id}`,
        type: 'robotNode',
        position: { x: r.x, y: r.y }, // Position is now driven by MQTT
        data: { label: r.name, status: r.status, battery: r.battery },
        draggable: false,
        zIndex: 100
      }));

      return [...staticNodes, ...robotNodes];
    });

  }, [dbRobots, robotStates, setNodes]);


  // --- 4. ACTIONS ---
  const sendCommand = (robotId: number, cmd: string) => {
    console.log(`Sending ${cmd} to ${robotId}`);
    publishCommand(robotId, cmd);
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
        defaultEdgeOptions={defaultEdgeOptions}
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
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></span>
                {isConnected ? 'MQTT CONNECTED' : 'DISCONNECTED'}
                <span className="text-slate-300">|</span>
                <span>ACTIVE ROBOTS: <span className="text-slate-800 font-bold">{robots.filter(r => r.active).length}</span></span>
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

        {/* --- LOG PANEL --- */}
        <Panel position="bottom-left" className="m-4 w-80">
          <div className="bg-white/90 backdrop-blur border border-slate-200 rounded-xl shadow-lg flex flex-col overflow-hidden max-h-48">
            <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-100 flex justify-between items-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase">System Logs</span>
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {logs.length === 0 && <div className="text-[10px] text-slate-400 italic text-center py-2">No activity detected</div>}
              {logs.map((log, i) => (
                <div key={i} className="text-[10px] font-mono text-slate-700 border-b border-slate-50 last:border-0 pb-1">
                  {log}
                </div>
              ))}
            </div>
          </div>
        </Panel>

      </ReactFlow>
    </div>
  );
};

export default FleetController;