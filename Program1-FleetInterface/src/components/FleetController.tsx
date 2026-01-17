import React, { useEffect, useState, useMemo } from 'react';
import ReactFlow, { 
  Background, 
  BackgroundVariant, 
  type Node, 
  type Edge 
} from 'reactflow';
import { supabase } from '../lib/supabaseClient';
import { useRobotSimulation } from '../hooks/useRobotSimulation'; // 1. SIMULATION IMPORT
import { type DBNode, type DBEdge } from '../types/database';
import { Battery, Activity, PauseCircle, PlayCircle, Octagon } from 'lucide-react';
import 'reactflow/dist/style.css';

// --- MQTT IMPORTS (UNCOMMENT FOR PRODUCTION) ---
// import mqtt from 'mqtt'; 

/**
 * Interface defining the telemetry data structure expected from the robot fleet.
 */

// interface RobotStatus {
//   id: string;
//   x: number;
//   y: number;
//   battery: number;
//   status: 'IDLE' | 'MOVING' | 'ERROR' | 'CHARGING';
// }

/**
 * COMPONENT: FleetController (Tab 3)
 * * Acts as the centralized "Control Room" dashboard.
 * Responsibilities:
 * 1. Fetches and renders the static warehouse map (Nodes & Edges).
 * 2. Visualizes real-time robot positions (overlaying the map).
 * 3. Provides operator controls (Pause, Resume, Emergency Stop).
 * * NOTE: Currently configured to run in SIMULATION mode. 
 * See "Data Source Switcher" section to enable real MQTT telemetry.
 */
const FleetController: React.FC = () => {
  
  // =========================================================
  // 1. STATE MANAGEMENT
  // =========================================================

  // Raw Database Data (Used for logic/simulation)
  const [dbNodes, setDbNodes] = useState<DBNode[]>([]);
  const [dbEdges, setDbEdges] = useState<DBEdge[]>([]);
  
  // Visual Graph Elements (React Flow specific)
  const [staticNodes, setStaticNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // Global System State: Controls the operational mode of the fleet
  const [systemState, setSystemState] = useState<'RUNNING' | 'PAUSED' | 'STOPPED'>('RUNNING');

  // =========================================================
  // 2. DATA LOADING (STATIC MAP)
  // =========================================================

  /**
   * Effect: Load Map Configuration
   * Fetches the first available map from Supabase and transforms it into 
   * visual nodes/edges for React Flow.
   */
  useEffect(() => {
    const loadMap = async () => {
      try {
        // 1. Fetch the active graph metadata
        // Note: Currently grabs the first map found. In the future, this could use a specific ID.
        const { data: graphs } = await supabase.from('wh_graphs').select('id, name').limit(1);
        
        if (!graphs || graphs.length === 0) {
          console.warn('[FleetController] No graphs found in database.');
          return;
        }

        const activeGraph = graphs[0];
        console.log(`[FleetController] Loading Map: ${activeGraph.name}`);

        // 2. Fetch Nodes & Edges associated with this graph
        const { data: n } = await supabase.from('wh_nodes').select('*').eq('graph_id', activeGraph.id);
        const { data: e } = await supabase.from('wh_edges').select('*').eq('graph_id', activeGraph.id);

        if (n && e) {
          // Store raw data for simulation logic
          setDbNodes(n as DBNode[]);
          setDbEdges(e as DBEdge[]);
          
          // Transform DB Nodes -> React Flow Static Waypoints
          setStaticNodes((n as DBNode[]).map((node) => ({
             id: node.id.toString(),
             type: 'default',
             position: { x: node.x * 100, y: node.y * 100 }, // Scaling: 1m = 100px
             data: { label: node.name },
             style: { width: 10, height: 10, background: '#cbd5e1', border: 'none', fontSize: 8 }
          })));
          
          // Transform DB Edges -> React Flow Paths
          setEdges((e as DBEdge[]).map((edge) => ({
             id: `e${edge.node_a_id}-${edge.node_b_id}`,
             source: edge.node_a_id.toString(),
             target: edge.node_b_id.toString(),
             style: { stroke: '#e2e8f0' }
          })));
        }
      } catch (err) { 
        console.error('[FleetController] Map Load Error:', err); 
      }
    };

    loadMap();
  }, []);

  // =========================================================
  // 3. ROBOT DATA SOURCE (SWITCHER)
  // =========================================================

  /**
   * DATA SOURCE CONFIGURATION
   * To switch to production (Real Robots), comment out Option A and uncomment Option B.
   */

  // --- OPTION A: SIMULATION (CURRENTLY ACTIVE) ---
  // Uses a hook to move "Ghost Robots" along the graph edges for testing UI.
  const simulatedRobots = useRobotSimulation(dbNodes, dbEdges);

  // --- OPTION B: REAL MQTT TELEMETRY (PREPARED) ---
  /*
  const [mqttRobots, setMqttRobots] = useState<RobotStatus[]>([]);

  useEffect(() => {
    // Initialize MQTT Client (WebSocket Protocol)
    // Ensure your Broker supports WebSockets (typically port 9001 or 8083)
    const client = mqtt.connect('ws://localhost:9001/mqtt');

    client.on('connect', () => {
      console.log('Connected to MQTT Broker');
      client.subscribe('fleet/status');
    });

    client.on('message', (topic, message) => {
      if (topic === 'fleet/status') {
        try {
            const payload = JSON.parse(message.toString());
            // Expected Format: { "robots": [ { "id": "R-01", "x": 100, "y": 200, ... } ] }
            if (payload.robots) {
                setMqttRobots(payload.robots);
            }
        } catch (e) {
            console.error('MQTT JSON Parse Error', e);
        }
      }
    });

    return () => {
      if (client) client.end();
    };
  }, []);
  */

  // --- ACTIVE DATA SELECTOR ---
  const activeRobots = simulatedRobots; 
  // const activeRobots = mqttRobots; // <--- UNCOMMENT THIS FOR PRODUCTION

  // =========================================================
  // 4. VISUALIZATION LOGIC
  // =========================================================

  /**
   * Memoized computation of Dynamic Robot Nodes.
   * * PERFORMANCE OPTIMIZATION:
   * We use useMemo here instead of useEffect + useState.
   * This calculates the visual state of robots *during* the render cycle,
   * preventing the "Cascading Render" performance issue.
   */
  const robotNodes = useMemo(() => {
    return activeRobots.map((r) => ({
      id: r.id,
      type: 'default', // Using default circle node for now
      position: { x: r.x, y: r.y },
      data: { label: r.id },
      draggable: false,
      style: {
        width: 40,
        height: 40,
        // Visual Feedback Logic:
        // - RED: If System Stopped OR Robot Error
        // - BLUE: Normal Operation
        backgroundColor: systemState === 'STOPPED' 
          ? '#ef4444' 
          : (r.status === 'ERROR' ? '#ef4444' : '#2563eb'),
        color: 'white',
        borderRadius: '50%',
        border: '3px solid white',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        fontSize: '10px',
        zIndex: 1000, // Ensure robots render ON TOP of map nodes
        transition: 'all 0.05s linear', // Smooths out low-tick-rate updates
        opacity: systemState === 'PAUSED' ? 0.5 : 1 // Dim robots when paused
      }
    }));
  }, [activeRobots, systemState]);

  // =========================================================
  // 5. COMMAND HANDLERS
  // =========================================================

  /**
   * Broadcasts high-level commands to the fleet.
   * @param cmd - The command type ('PAUSE', 'RESUME', 'STOP')
   */
  const sendCommand = (cmd: 'PAUSE' | 'RESUME' | 'STOP') => {
    // 1. Simulation Logic (Console Log)
    console.log(`[COMMAND ISSUED] Type: ${cmd}`);

    // 2. Optimistic UI Update (Immediate feedback for user)
    if (cmd === 'PAUSE') setSystemState('PAUSED');
    if (cmd === 'RESUME') setSystemState('RUNNING');
    if (cmd === 'STOP') setSystemState('STOPPED');

    // 3. Real MQTT Logic (Prepared)
    /*
    // Example publication logic:
    if (mqttClient.connected) {
        mqttClient.publish('fleet/control', JSON.stringify({ 
            command: cmd,
            timestamp: Date.now() 
        }));
    }
    */
  };

  // =========================================================
  // 6. RENDER
  // =========================================================

  return (
    <div className="flex h-full bg-slate-100">
       
       {/* --- LEFT SIDEBAR: CONTROL PANEL --- */}
       <div className="w-64 bg-white border-r border-slate-200 p-4 flex flex-col gap-6 z-10 shadow-sm">
          
          {/* Status Indicator Widget */}
          <div>
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
              <Activity size={18} className={systemState === 'RUNNING' ? "text-green-500" : "text-red-500"} />
              Fleet Status
            </h2>
            <div className={`p-3 rounded-lg border text-center font-bold text-xs ${
                systemState === 'RUNNING' ? 'bg-green-50 border-green-200 text-green-700' :
                systemState === 'PAUSED' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                'bg-red-50 border-red-200 text-red-700'
            }`}>
                SYSTEM {systemState}
            </div>
          </div>

          {/* Active Robots List */}
          <div className="space-y-3 flex-1 overflow-y-auto">
            {activeRobots.map(r => (
              <div key={r.id} className="p-3 border border-slate-100 rounded-lg bg-slate-50">
                <div className="flex justify-between items-center mb-2">
                   <span className="font-bold text-xs text-slate-700">{r.id}</span>
                   <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">{r.status}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                   <Battery size={14} />
                   <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                     <div className="h-full bg-green-500" style={{ width: `${r.battery}%` }}></div>
                   </div>
                   <span>{r.battery}%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Operator Controls */}
          <div className="space-y-2 pt-4 border-t border-slate-100">
             <label className="text-[10px] font-bold text-slate-400 uppercase">Broadcast Commands</label>
             <div className="grid grid-cols-2 gap-2">
                <button onClick={() => sendCommand('PAUSE')} className="flex flex-col items-center justify-center p-2 bg-slate-100 hover:bg-yellow-100 text-slate-600 hover:text-yellow-700 rounded transition-colors">
                   <PauseCircle size={20} className="mb-1"/> <span className="text-[10px] font-bold">PAUSE</span>
                </button>
                <button onClick={() => sendCommand('RESUME')} className="flex flex-col items-center justify-center p-2 bg-slate-100 hover:bg-green-100 text-slate-600 hover:text-green-700 rounded transition-colors">
                   <PlayCircle size={20} className="mb-1"/> <span className="text-[10px] font-bold">RESUME</span>
                </button>
             </div>
             <button onClick={() => sendCommand('STOP')} className="w-full flex items-center justify-center gap-2 p-3 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg font-bold text-xs transition-colors">
                <Octagon size={16}/> EMERGENCY STOP
             </button>
          </div>
       </div>

       {/* --- RIGHT PANEL: MAP VISUALIZATION --- */}
       <div className="flex-1 relative">
         <ReactFlow 
            // MERGE: Combine Static Waypoints with Dynamic Robot Nodes
            nodes={[...staticNodes, ...robotNodes]} 
            edges={edges} 
            fitView 
            minZoom={0.1}
         >
            <Background color="#cbd5e1" gap={20} size={1} variant={BackgroundVariant.Dots} />
         </ReactFlow>
       </div>
    </div>
  );
};

export default FleetController;