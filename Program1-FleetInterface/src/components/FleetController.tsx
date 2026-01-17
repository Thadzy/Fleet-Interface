import React, { useEffect, useState } from 'react';
import ReactFlow, { Background, BackgroundVariant, useNodesState, useEdgesState, Node } from 'reactflow';
import { supabase } from '../lib/supabaseClient';
import { useRobotSimulation } from '../hooks/useRobotSimulation';
import { DBNode, DBEdge } from '../types/database';
import { Battery, Activity, PauseCircle, PlayCircle, Octagon } from 'lucide-react';
import 'reactflow/dist/style.css';

const FleetController: React.FC = () => {
  const [dbNodes, setDbNodes] = useState<DBNode[]>([]);
  const [dbEdges, setDbEdges] = useState<DBEdge[]>([]);
  
  // React Flow State
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<any[]>([]);

  // 1. NEW: System Status State
  const [systemState, setSystemState] = useState<'RUNNING' | 'PAUSED' | 'STOPPED'>('RUNNING');

  // Load Map
  useEffect(() => {
    const loadMap = async () => {
      const { data: graph } = await supabase.from('wh_graphs').select('id').eq('name', 'warehouse_A').single();
      if(!graph) return;
      const { data: n } = await supabase.from('wh_nodes').select('*').eq('graph_id', graph.id);
      const { data: e } = await supabase.from('wh_edges').select('*').eq('graph_id', graph.id);

      if(n && e) {
        setDbNodes(n as DBNode[]);
        setDbEdges(e as DBEdge[]);
        // Static Map
        setNodes(n.map((node: any) => ({
           id: node.id.toString(), type: 'default', position: { x: node.x * 100, y: node.y * 100 },
           data: { label: node.name }, style: { width: 10, height: 10, background: '#cbd5e1', border: 'none', fontSize: 8 }
        })));
        setEdges(e.map((edge: any) => ({
           id: `e${edge.node_a_id}-${edge.node_b_id}`, source: edge.node_a_id.toString(), target: edge.node_b_id.toString(), style: { stroke: '#e2e8f0' }
        })));
      }
    };
    loadMap();
  }, []);

  // Connect Simulation (In real app, pass systemState to stop updates)
  const robots = useRobotSimulation(dbNodes, dbEdges);

  // Render Robots
  useEffect(() => {
    const robotNodes: Node[] = robots.map(r => ({
      id: r.id,
      type: 'default',
      position: { x: r.x, y: r.y },
      data: { label: r.id },
      draggable: false,
      style: {
        width: 40, height: 40,
        backgroundColor: systemState === 'STOPPED' ? '#ef4444' : (r.status === 'ERROR' ? '#ef4444' : '#2563eb'),
        color: 'white', borderRadius: '50%', border: '3px solid white', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '10px', zIndex: 1000,
        transition: 'all 0.05s linear',
        opacity: systemState === 'PAUSED' ? 0.5 : 1
      }
    }));
    setNodes(prev => [...prev.filter(n => !n.id.startsWith('R-')), ...robotNodes]);
  }, [robots, systemState]);

  // 2. NEW: Command Handlers
  const sendCommand = (cmd: 'PAUSE' | 'RESUME' | 'STOP') => {
    console.log(`[MQTT] Publishing to fleet/control: { "command": "${cmd}" }`);
    if(cmd === 'PAUSE') setSystemState('PAUSED');
    if(cmd === 'RESUME') setSystemState('RUNNING');
    if(cmd === 'STOP') setSystemState('STOPPED');
  };

  return (
    <div className="flex h-full bg-slate-100">
       {/* Sidebar */}
       <div className="w-64 bg-white border-r border-slate-200 p-4 flex flex-col gap-6 z-10 shadow-sm">
          
          {/* Status Panel */}
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

          {/* Robot List */}
          <div className="space-y-3 flex-1 overflow-y-auto">
            {robots.map(r => (
              <div key={r.id} className="p-3 border border-slate-100 rounded-lg bg-slate-50">
                <div className="flex justify-between items-center mb-2">
                   <span className="font-bold text-xs text-slate-700">{r.id}</span>
                   <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">{r.status}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                   <Battery size={14} />
                   <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-green-500" style={{ width: `${r.battery}%` }}></div></div>
                   <span>{r.battery}%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Command Center */}
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

       {/* Map Area */}
       <div className="flex-1 relative">
         <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.1}>
            <Background color="#cbd5e1" gap={20} size={1} variant={BackgroundVariant.Dots} />
         </ReactFlow>
       </div>
    </div>
  );
};

export default FleetController;