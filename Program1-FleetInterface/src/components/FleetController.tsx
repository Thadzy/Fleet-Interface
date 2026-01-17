import React, { useEffect, useState, useMemo } from 'react';
import ReactFlow, { Background, BackgroundVariant, useNodesState, useEdgesState, Node, Edge } from 'reactflow';
import { supabase } from '../lib/supabaseClient';
import { useRobotSimulation } from '../hooks/useRobotSimulation'; // Import the hook
import { DBNode, DBEdge } from '../types/database';
import { Battery, Activity, AlertCircle } from 'lucide-react';
import 'reactflow/dist/style.css';

const FleetController: React.FC = () => {
  const [dbNodes, setDbNodes] = useState<DBNode[]>([]);
  const [dbEdges, setDbEdges] = useState<DBEdge[]>([]);
  
  // React Flow State
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // 1. Load the Map (Same as before)
  useEffect(() => {
    const loadMap = async () => {
      const { data: graph } = await supabase.from('wh_graphs').select('id').eq('name', 'warehouse_A').single();
      if(!graph) return;
      const { data: n } = await supabase.from('wh_nodes').select('*').eq('graph_id', graph.id);
      const { data: e } = await supabase.from('wh_edges').select('*').eq('graph_id', graph.id);

      if(n && e) {
        setDbNodes(n as DBNode[]);
        setDbEdges(e as DBEdge[]);
        
        // Static Map Elements
        setNodes(n.map((node: any) => ({
           id: node.id.toString(),
           type: 'default',
           position: { x: node.x * 100, y: node.y * 100 },
           data: { label: node.name },
           style: { width: 10, height: 10, background: '#cbd5e1', border: 'none', fontSize: 8 }
        })));
        
        setEdges(e.map((edge: any) => ({
           id: `e${edge.node_a_id}-${edge.node_b_id}`,
           source: edge.node_a_id.toString(),
           target: edge.node_b_id.toString(),
           style: { stroke: '#e2e8f0' }
        })));
      }
    };
    loadMap();
  }, []);

  // 2. Connect the Simulation
  const robots = useRobotSimulation(dbNodes, dbEdges);

  // 3. Render Robots as "Overlay Nodes" in React Flow
  useEffect(() => {
    const robotNodes: Node[] = robots.map(r => ({
      id: r.id,
      type: 'default',
      position: { x: r.x, y: r.y },
      data: { label: r.id },
      draggable: false,
      style: {
        width: 40,
        height: 40,
        backgroundColor: r.status === 'ERROR' ? '#ef4444' : '#2563eb',
        color: 'white',
        borderRadius: '50%',
        border: '3px solid white',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        fontSize: '10px',
        zIndex: 1000, // Always on top
        transition: 'all 0.05s linear' // Smooth movement
      }
    }));

    // Merge static map nodes + robot nodes
    setNodes(prev => {
      const staticNodes = prev.filter(n => !n.id.startsWith('R-'));
      return [...staticNodes, ...robotNodes];
    });

  }, [robots, setNodes]);

  return (
    <div className="flex h-full bg-slate-100">
       {/* Sidebar Status */}
       <div className="w-64 bg-white border-r border-slate-200 p-4 flex flex-col gap-4 z-10 shadow-sm">
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Activity size={18} className="text-green-500" />
            Fleet Status
          </h2>
          
          <div className="space-y-3">
            {robots.map(r => (
              <div key={r.id} className="p-3 border border-slate-100 rounded-lg bg-slate-50">
                <div className="flex justify-between items-center mb-2">
                   <span className="font-bold text-xs text-slate-700">{r.id}</span>
                   <span className={`text-[10px] px-2 py-0.5 rounded-full ${r.status === 'MOVING' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
                     {r.status}
                   </span>
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
       </div>

       {/* Map */}
       <div className="flex-1 relative">
         <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.1}>
            <Background color="#cbd5e1" gap={20} size={1} variant={BackgroundVariant.Dots} />
         </ReactFlow>
       </div>
    </div>
  );
};

export default FleetController;