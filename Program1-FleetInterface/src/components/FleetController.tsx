/**
 * Fleet Controller - Production-Grade Robot Fleet Visualization
 * ==============================================================
 * 
 * This component provides real-time visualization of the robot fleet
 * on the warehouse map. It uses React Flow for the interactive canvas
 * and connects to the Fleet Gateway via MQTT.
 * 
 * Performance Optimizations:
 * - Memoized node types and components to prevent re-renders
 * - Batched robot position updates (via useFleetSocket)
 * - Stable callbacks with useCallback to prevent child re-subscriptions
 * 
 * @author WCS Team
 * @version 2.0.0
 */

import React, { useEffect, useState, useCallback, useMemo, memo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
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
  Box, ArrowDownToLine, ArrowUpFromLine, Zap, CircleDot, HelpCircle,
  WifiOff, RefreshCw
} from 'lucide-react';

import { supabase } from '../lib/supabaseClient';
import { type DBRobot, type DBNode, type DBEdge } from '../types/database';
import { useFleetSocket, type ConnectionStatus } from '../hooks/useFleetSocket';

// ============================================
// TYPE DEFINITIONS
// ============================================

/** Merged robot data combining DB metadata and live MQTT status */
interface FleetRobot {
  id: number;
  name: string;
  status: 'idle' | 'busy' | 'offline' | 'error';
  battery: number;
  x: number;
  y: number;
  currentTask: string;
  isActive: boolean;
}

/** Props for the custom WaypointNode */
interface WaypointNodeData {
  type: string;
  level?: number;
}

/** Props for the custom RobotNode */
interface RobotNodeData {
  label: string;
  status: FleetRobot['status'];
  battery: number;
}

// ============================================
// CONSTANTS
// ============================================

/** Map scale factor (meters to pixels) */
const MAP_SCALE = 100;

/** Path polling interval in milliseconds */
const PATH_POLL_INTERVAL_MS = 1000;

/** Maximum logs to display */
const MAX_DISPLAY_LOGS = 50;

/** Node styling based on type */
const NODE_STYLES: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  shelf: { color: 'bg-cyan-600 border-cyan-200 shadow-cyan-900/20', icon: Box, label: 'SHELF' },
  inbound: { color: 'bg-emerald-600 border-emerald-200 shadow-emerald-900/20', icon: ArrowDownToLine, label: 'INBOUND' },
  outbound: { color: 'bg-orange-600 border-orange-200 shadow-orange-900/20', icon: ArrowUpFromLine, label: 'OUTBOUND' },
  charger: { color: 'bg-yellow-500 border-yellow-200 shadow-yellow-900/20', icon: Zap, label: 'CHARGER' },
  waypoint: { color: 'bg-slate-600 border-slate-200 shadow-slate-900/20', icon: CircleDot, label: 'WAYPOINT' },
  default: { color: 'bg-slate-400 border-slate-200', icon: HelpCircle, label: 'UNKNOWN' }
} as const;

/** Status colors for robot markers */
const ROBOT_STATUS_COLORS: Record<FleetRobot['status'], string> = {
  idle: 'bg-green-500 border-green-200',
  busy: 'bg-blue-500 border-blue-200',
  offline: 'bg-slate-500 border-slate-200',
  error: 'bg-red-500 border-red-200'
} as const;

// ============================================
// MEMOIZED SUB-COMPONENTS
// ============================================

/**
 * Invisible handles for node connections.
 * Using memo to prevent unnecessary re-renders.
 */
const InvisibleHandle = memo<{ position: Position; id: string }>(({ position, id }) => (
  <>
    <Handle type="source" position={position} id={`${id}-source`} isConnectable={false} style={{ opacity: 0 }} />
    <Handle type="target" position={position} id={`${id}-target`} isConnectable={false} style={{ opacity: 0 }} />
  </>
));
InvisibleHandle.displayName = 'InvisibleHandle';

/**
 * Waypoint Node - Static map elements (shelves, waypoints, etc.)
 * Memoized to prevent re-renders when only robot positions change.
 */
const WaypointNode = memo<NodeProps<WaypointNodeData>>(({ data }) => {
  const nodeType = data.type || 'waypoint';
  const style = NODE_STYLES[nodeType] || NODE_STYLES.default;
  const Icon = style.icon;

  return (
    <div className="group relative flex flex-col items-center justify-center">
      <div className={`w-4 h-4 rounded-full shadow-sm flex items-center justify-center border-2 z-10 ${style.color}`}>
        <Icon size={8} className="text-white" strokeWidth={3} />
      </div>
      <InvisibleHandle position={Position.Top} id="top" />
      <InvisibleHandle position={Position.Bottom} id="bottom" />
      <InvisibleHandle position={Position.Left} id="left" />
      <InvisibleHandle position={Position.Right} id="right" />
    </div>
  );
});
WaypointNode.displayName = 'WaypointNode';

/**
 * Robot Node - Moving robot markers with status indication.
 * Uses CSS transitions for smooth movement.
 */
const RobotNode = memo<NodeProps<RobotNodeData>>(({ data }) => {
  const { label, status, battery } = data;
  const color = ROBOT_STATUS_COLORS[status] || ROBOT_STATUS_COLORS.offline;

  return (
    <div className="relative flex flex-col items-center justify-center pointer-events-none">
      {/* Robot Label */}
      <div className="absolute -top-8 bg-slate-900/90 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm backdrop-blur-sm whitespace-nowrap z-50">
        {label}
      </div>

      {/* Robot Body */}
      <div className={`w-10 h-10 ${color} rounded-lg shadow-xl flex items-center justify-center border-2 transition-all duration-300`}>
        <Truck size={20} className="text-white relative z-10" />
        <div className="absolute -top-1 w-1.5 h-1.5 bg-yellow-400 rounded-full z-20" />
      </div>

      {/* Battery Indicator */}
      <div className="absolute -bottom-6 flex gap-1">
        {battery !== undefined && (
          <div className={`bg-slate-800 text-[8px] px-1 rounded flex items-center gap-0.5 border border-slate-700 ${battery > 20 ? 'text-green-400' : 'text-red-400'
            }`}>
            <Battery size={8} /> {battery}%
          </div>
        )}
      </div>

      {/* Invisible Handles for Path Edges */}
      <Handle type="source" position={Position.Bottom} id="mobile-source" style={{ opacity: 0, top: '50%', left: '50%' }} />
      <Handle type="target" position={Position.Top} id="mobile-target" style={{ opacity: 0, top: '50%', left: '50%' }} />
    </div>
  );
});
RobotNode.displayName = 'RobotNode';

/**
 * Connection Status Badge - Shows MQTT connection state.
 */
const ConnectionStatusBadge = memo<{ status: ConnectionStatus; reconnectAttempts: number; onReconnect: () => void }>(
  ({ status, reconnectAttempts, onReconnect }) => {
    const statusConfig = {
      connected: { icon: Wifi, color: 'text-green-500', bg: 'bg-green-50', text: 'CONNECTED' },
      connecting: { icon: RefreshCw, color: 'text-amber-500', bg: 'bg-amber-50', text: 'CONNECTING...' },
      reconnecting: { icon: RefreshCw, color: 'text-amber-500', bg: 'bg-amber-50', text: `RECONNECTING (${reconnectAttempts})` },
      disconnected: { icon: WifiOff, color: 'text-red-500', bg: 'bg-red-50', text: 'DISCONNECTED' },
    };

    const config = statusConfig[status];
    const Icon = config.icon;
    const isAnimated = status === 'connecting' || status === 'reconnecting';

    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${config.bg} border border-slate-200`}>
        <Icon size={14} className={`${config.color} ${isAnimated ? 'animate-spin' : ''}`} />
        <span className={`text-xs font-semibold ${config.color}`}>{config.text}</span>
        {status === 'disconnected' && (
          <button
            onClick={onReconnect}
            className="ml-1 text-[10px] bg-slate-200 hover:bg-slate-300 px-2 py-0.5 rounded transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    );
  }
);
ConnectionStatusBadge.displayName = 'ConnectionStatusBadge';

/**
 * Robot Control Card - Individual robot status and action buttons.
 */
const RobotControlCard = memo<{
  robot: FleetRobot;
  onCommand: (robotId: number, command: string) => void;
}>(({ robot, onCommand }) => {
  const handlePause = useCallback(() => onCommand(robot.id, 'PAUSE'), [robot.id, onCommand]);
  const handleResume = useCallback(() => onCommand(robot.id, 'RESUME'), [robot.id, onCommand]);
  const handleEstop = useCallback(() => onCommand(robot.id, 'ESTOP'), [robot.id, onCommand]);

  return (
    <div className="bg-white/90 backdrop-blur border border-slate-200 p-3 rounded-xl shadow-lg flex flex-col gap-2">
      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Truck size={14} className="text-slate-400" />
          <span className="text-sm font-bold text-slate-800">{robot.name}</span>
        </div>
        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${robot.status === 'idle' ? 'bg-green-100 text-green-600' :
            robot.status === 'busy' ? 'bg-blue-100 text-blue-600' :
              'bg-red-100 text-red-600'
          }`}>
          {robot.status}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
        <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded border border-slate-100">
          <Battery size={10} /> {robot.battery}%
        </div>
        <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded border border-slate-100">
          <Wifi size={10} /> {robot.isActive ? 'Online' : 'Offline'}
        </div>
        <div className="col-span-2 flex items-center gap-1 bg-slate-50 p-1.5 rounded border border-slate-100">
          <Activity size={10} /> {robot.currentTask}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1 mt-1">
        <button onClick={handlePause} className="flex-1 py-1 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded flex justify-center items-center gap-1 text-[10px] font-bold border border-amber-200 transition-all">
          <PauseCircle size={12} /> PAUSE
        </button>
        <button onClick={handleResume} className="flex-1 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded flex justify-center items-center gap-1 text-[10px] font-bold border border-blue-200 transition-all">
          <PlayCircle size={12} /> RESUME
        </button>
        <button onClick={handleEstop} className="w-8 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded flex justify-center items-center text-[10px] font-bold border border-red-200 transition-all" title="EMERGENCY STOP">
          <AlertOctagon size={12} />
        </button>
      </div>
    </div>
  );
});
RobotControlCard.displayName = 'RobotControlCard';

/**
 * Log Panel - Displays recent system events.
 */
const LogPanel = memo<{ logs: readonly string[] }>(({ logs }) => (
  <div className="bg-white/90 backdrop-blur border border-slate-200 rounded-xl shadow-lg flex flex-col overflow-hidden max-h-48">
    <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-100 flex justify-between items-center">
      <span className="text-[10px] font-bold text-slate-500 uppercase">System Logs</span>
      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
    </div>
    <div className="flex-1 overflow-y-auto p-2 space-y-1">
      {logs.length === 0 && (
        <div className="text-[10px] text-slate-400 italic text-center py-2">No activity detected</div>
      )}
      {logs.map((log, i) => (
        <div key={i} className="text-[10px] font-mono text-slate-700 border-b border-slate-50 last:border-0 pb-1">
          {log}
        </div>
      ))}
    </div>
  </div>
));
LogPanel.displayName = 'LogPanel';

// ============================================
// MAIN COMPONENT
// ============================================

const FleetController: React.FC = () => {
  // --- NODE TYPES (memoized outside render loop) ---
  const nodeTypes = useMemo(() => ({
    waypoint: WaypointNode,
    robotNode: RobotNode
  }), []);

  const defaultEdgeOptions = useMemo(() => ({ type: 'straight' }), []);

  // --- STATE ---
  const [dbRobots, setDbRobots] = useState<DBRobot[]>([]);
  const [robots, setRobots] = useState<FleetRobot[]>([]);
  const [cellMap, setCellMap] = useState<Map<number, number>>(new Map());

  // React Flow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // MQTT Hook (production-grade)
  const {
    connectionStatus,
    isConnected,
    robotStates,
    logs,
    reconnectAttempts,
    publishCommand,
    forceReconnect
  } = useFleetSocket();

  // --- LOAD STATIC DATA (Graph + Robots + Cells) ---
  useEffect(() => {
    const loadStaticData = async () => {
      try {
        // Load Graph
        const { data: graphData } = await supabase
          .from('wh_graphs')
          .select('*')
          .limit(1)
          .single();

        if (!graphData) {
          console.warn('[FleetController] No graph found');
          return;
        }

        // Load Nodes
        const { data: nodeData } = await supabase
          .from('wh_nodes')
          .select('*')
          .eq('graph_id', graphData.id);

        if (nodeData) {
          const flowNodes: Node[] = nodeData.map((n: DBNode) => ({
            id: n.id.toString(),
            type: 'waypoint',
            position: { x: n.x * MAP_SCALE, y: n.y * MAP_SCALE },
            data: { type: n.type, level: n.level } as WaypointNodeData,
            draggable: false,
            selectable: false,
          }));

          // Add Map Background
          if (graphData.map_url) {
            flowNodes.unshift({
              id: 'map-bg',
              type: 'group',
              position: { x: 0, y: 0 },
              data: { label: null },
              style: {
                width: 3000,
                height: 2000,
                backgroundImage: `url(${graphData.map_url})`,
                backgroundSize: 'contain',
                zIndex: -10
              },
              draggable: false
            });
          }
          setNodes(flowNodes);
        }

        // Load Edges
        const { data: edgeData } = await supabase
          .from('wh_edges')
          .select('*')
          .eq('graph_id', graphData.id);

        if (edgeData) {
          setEdges(edgeData.map((e: DBEdge) => ({
            id: `e${e.node_a_id}-${e.node_b_id}`,
            source: e.node_a_id.toString(),
            target: e.node_b_id.toString(),
            style: { stroke: '#cbd5e1' }
          })));
        }

        // Load Cells (for path visualization)
        const { data: cellData } = await supabase.from('wh_cells').select('id, node_id');
        if (cellData) {
          const map = new Map<number, number>();
          cellData.forEach(c => map.set(c.id, c.node_id));
          setCellMap(map);
        }

        // Load Robots
        const { data: robotData } = await supabase.from('wh_robots').select('*');
        if (robotData) {
          setDbRobots(robotData as DBRobot[]);
        }

      } catch (err) {
        console.error('[FleetController] Error loading static data:', err);
      }
    };

    loadStaticData();
  }, [setNodes, setEdges]);

  // --- MERGE DB ROBOTS + MQTT STATUS ---
  useEffect(() => {
    if (dbRobots.length === 0) return;

    const mergedList: FleetRobot[] = dbRobots.map(dbBot => {
      const liveData = robotStates[dbBot.id] || robotStates[dbBot.name];

      return {
        id: dbBot.id,
        name: dbBot.name,
        status: (liveData?.status || 'offline') as FleetRobot['status'],
        battery: liveData?.battery || 0,
        x: liveData ? liveData.x * MAP_SCALE : 50,
        y: liveData ? liveData.y * MAP_SCALE : 50 + (dbBot.id * 50),
        currentTask: liveData?.current_task_id ? `Task #${liveData.current_task_id}` : 'Idle',
        isActive: !!liveData
      };
    });

    setRobots(mergedList);

    // Update Robot Nodes in ReactFlow
    setNodes(prevNodes => {
      const staticNodes = prevNodes.filter(n => n.type !== 'robotNode');
      const robotNodes: Node[] = mergedList.map(r => ({
        id: `robot-${r.id}`,
        type: 'robotNode',
        position: { x: r.x, y: r.y },
        data: { label: r.name, status: r.status, battery: r.battery } as RobotNodeData,
        draggable: false,
        zIndex: 100
      }));
      return [...staticNodes, ...robotNodes];
    });
  }, [dbRobots, robotStates, setNodes]);

  // --- PATH VISUALIZATION ---
  useEffect(() => {
    if (robots.length === 0 || cellMap.size === 0) return;

    const fetchPaths = async () => {
      try {
        const { data: assignments } = await supabase
          .from('wh_assignments')
          .select('id, robot_id')
          .eq('status', 'in_progress');

        if (!assignments || assignments.length === 0) {
          // Remove path edges if no active assignments
          setEdges(prev => prev.filter(e => !e.id.startsWith('path-')));
          return;
        }

        const assignmentIds = assignments.map(a => a.id);
        const { data: tasks } = await supabase
          .from('wh_tasks')
          .select('*')
          .in('assignment_id', assignmentIds)
          .neq('status', 'delivered')
          .order('seq_order');

        if (!tasks) return;

        const pathEdges: Edge[] = [];

        assignments.forEach(asn => {
          const asnTasks = tasks.filter(t => t.assignment_id === asn.id);
          if (asnTasks.length === 0) return;

          const bot = robots.find(r => r.id === asn.robot_id) || robots[0];
          let prevSource = bot ? `robot-${bot.id}` : null;
          let prevSourceHandle = 'mobile-source';

          asnTasks.forEach((task, i) => {
            const targetNodeId = cellMap.get(task.cell_id);
            if (!targetNodeId) return;

            const targetHandle = targetNodeId.toString();

            if (prevSource) {
              pathEdges.push({
                id: `path-${asn.id}-${i}`,
                source: prevSource,
                sourceHandle: prevSourceHandle,
                target: targetHandle,
                targetHandle: 'top-target',
                animated: true,
                style: { stroke: '#22c55e', strokeWidth: 2, strokeDasharray: '5,5' },
              });
            }
            prevSource = targetHandle;
            prevSourceHandle = 'bottom-source';
          });
        });

        setEdges(prev => {
          const mapEdges = prev.filter(e => !e.id.startsWith('path-'));
          return [...mapEdges, ...pathEdges];
        });
      } catch (err) {
        console.error('[FleetController] Error fetching paths:', err);
      }
    };

    fetchPaths();
    const interval = setInterval(fetchPaths, PATH_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [robots, cellMap, setEdges]);

  // --- COMMAND HANDLER (stable callback) ---
  const handleCommand = useCallback((robotId: number, command: string) => {
    console.log(`[FleetController] Sending ${command} to Robot ${robotId}`);
    publishCommand(robotId, command as 'PAUSE' | 'RESUME' | 'ESTOP');
  }, [publishCommand]);

  // --- RENDER ---
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

        {/* Header Panel */}
        <Panel position="top-left" className="m-4">
          <div className="bg-white/90 backdrop-blur border border-slate-200 shadow-xl px-4 py-3 rounded-xl flex items-center gap-4 text-slate-800">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg shadow-sm">
              <Truck size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-none">Fleet Controller</h2>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <ConnectionStatusBadge
                  status={connectionStatus}
                  reconnectAttempts={reconnectAttempts}
                  onReconnect={forceReconnect}
                />
                <span className="text-slate-300">|</span>
                <span>ACTIVE ROBOTS: <span className="text-slate-800 font-bold">{robots.filter(r => r.isActive).length}</span></span>
              </div>
            </div>
          </div>
        </Panel>

        {/* Robot Control Cards */}
        <Panel position="top-right" className="m-4">
          <div className="flex flex-col gap-2 w-72">
            {robots.map(r => (
              <RobotControlCard key={r.id} robot={r} onCommand={handleCommand} />
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

        {/* Log Panel */}
        <Panel position="bottom-left" className="m-4 w-80">
          <LogPanel logs={logs} />
        </Panel>
      </ReactFlow>
    </div>
  );
};

export default FleetController;