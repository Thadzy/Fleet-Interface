import React, { useMemo, useEffect } from 'react';
import ReactFlow, { Background, BackgroundVariant, MarkerType, useNodesState, useEdgesState, Node, Edge } from 'reactflow';
import { X, Map as MapIcon } from 'lucide-react';
import 'reactflow/dist/style.css';
import { type DBNode, type DBEdge } from '../types/database';

interface RouteVisualizerProps {
  isOpen: boolean;
  onClose: () => void;
  solution: any; // The result from solver
  dbNodes: DBNode[];
  dbEdges: DBEdge[];
}

const RouteVisualizer: React.FC<RouteVisualizerProps> = ({ isOpen, onClose, solution, dbNodes, dbEdges }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Transform Data when Modal Opens
  useEffect(() => {
    if (!isOpen || !solution || !dbNodes) return;

    // 1. SETUP NODES (Same as GraphEditor)
    const scale = 100; // 1m = 100px
    const flowNodes: Node[] = dbNodes.map(n => ({
      id: n.id.toString(),
      type: 'default', // Simple circle for view-only
      position: { x: n.x * scale, y: n.y * scale },
      data: { label: n.name },
      style: { 
        width: 10, height: 10, backgroundColor: '#ef4444', borderRadius: '50%', 
        color: 'white', fontSize: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' 
      }
    }));

    // 2. SETUP EDGES (Highlight the Route)
    // The solver returns a sequence of INDICES (0, 1, 2...) matching the node array order
    // We need to map these indices back to DB IDs to find the right edges
    const routeIndices = solution.routes[0].nodes; // [0, 1, 2...]
    
    // Create a Set of "Active Connections" for O(1) lookup
    // Format: "startID-endID"
    const routeConnections = new Set<string>();
    for (let i = 0; i < routeIndices.length - 1; i++) {
      const startNodeIdx = routeIndices[i];
      const endNodeIdx = routeIndices[i+1];
      
      const startNodeId = dbNodes[startNodeIdx]?.id;
      const endNodeId = dbNodes[endNodeIdx]?.id;
      
      if (startNodeId && endNodeId) {
        routeConnections.add(`${startNodeId}-${endNodeId}`);
        routeConnections.add(`${endNodeId}-${startNodeId}`); // Bi-directional
      }
    }

    const flowEdges: Edge[] = dbEdges.map(e => {
      const isRoute = routeConnections.has(`${e.node_a_id}-${e.node_b_id}`);
      return {
        id: `e${e.node_a_id}-${e.node_b_id}`,
        source: e.node_a_id.toString(),
        target: e.node_b_id.toString(),
        animated: isRoute, // Animate the path!
        style: { 
          stroke: isRoute ? '#2563eb' : '#cbd5e1', // Blue if active, Grey if inactive
          strokeWidth: isRoute ? 4 : 1, 
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: isRoute ? '#2563eb' : '#cbd5e1' },
      };
    });

    setNodes(flowNodes);
    setEdges(flowEdges);

  }, [isOpen, solution, dbNodes, dbEdges]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-8">
      <div className="bg-white w-full h-full max-w-6xl max-h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="h-14 border-b border-slate-100 flex items-center justify-between px-6 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg">
              <MapIcon size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">Route Visualization</h2>
              <p className="text-[10px] text-slate-500 font-mono">VEHICLE 1 • {solution?.total_distance} CM</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Map Canvas */}
        <div className="flex-1 bg-slate-50 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            minZoom={0.1}
          >
            <Background color="#cbd5e1" gap={20} size={1} variant={BackgroundVariant.Dots} />
          </ReactFlow>
        </div>

        {/* Footer */}
        <div className="h-12 border-t border-slate-100 flex items-center justify-end px-6 bg-white gap-3">
            <span className="text-xs text-slate-400">Review the path before committing to fleet.</span>
            <button 
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700"
            >
              CLOSE PREVIEW
            </button>
        </div>
      </div>
    </div>
  );
};

export default RouteVisualizer;