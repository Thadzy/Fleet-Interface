import React, { useEffect } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge
} from 'reactflow';
import { X, Map as MapIcon } from 'lucide-react';
import 'reactflow/dist/style.css';
import { type DBNode, type DBEdge } from '../types/database';

// --- TYPE DEFINITIONS ---

/**
 * Represents a single vehicle's assigned path.
 */
interface SolverRoute {
  vehicle_id: number;
  steps?: any[];
  nodes?: number[];
  distance: number;
}

/**
 * Represents the full response from the VRP Solver.
 * Matches the structure used in Optimization.tsx.
 */
interface SolverSolution {
  feasible: boolean;
  total_distance: number;
  wall_time_ms: number;
  routes: SolverRoute[];
  summary: string;
}

interface RouteVisualizerProps {
  isOpen: boolean;
  onClose: () => void;
  solution: SolverSolution | null; // <--- FIXED: Replaced 'any' with specific type
  dbNodes: DBNode[];
  dbEdges: DBEdge[];
}

/**
 * COMPONENT: RouteVisualizer
 * * A read-only modal that renders the optimized path on the map.
 * * It highlights the specific edges the robot will travel.
 */
const RouteVisualizer: React.FC<RouteVisualizerProps> = ({
  isOpen,
  onClose,
  solution,
  dbNodes,
  dbEdges
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // --- EFFECT: DATA TRANSFORMATION ---
  useEffect(() => {
    if (!isOpen || !solution || !dbNodes) return;

    // 1. SETUP NODES (Visual Markers)
    const scale = 100; // Scale factor: 1m = 100px
    const flowNodes: Node[] = dbNodes.map(n => ({
      id: n.id.toString(),
      type: 'default', // Simple circle for view-only
      position: { x: n.x * scale, y: n.y * scale },
      data: { label: n.name },
      draggable: false, // Read-only
      style: {
        width: 10,
        height: 10,
        backgroundColor: '#ef4444',
        borderRadius: '50%',
        color: 'white',
        fontSize: '8px',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    }));

    // 2. SETUP EDGES (Path Highlighting)

    // Safety check: Ensure we have at least one route
    if (!solution.routes || solution.routes.length === 0) {
      setNodes(flowNodes);
      return;
    }

    // The solver returns complex steps now (RouteStep[]).
    // We map these to find the path.
    const routeSteps = solution.routes[0].steps || []; // Use steps if available
    const routeNodes = solution.routes[0].nodes || []; // Fallback (though likely empty or unused)

    // Create a Lookup Set of "Active Connections"
    // Format: "startID-endID"
    const routeConnections = new Set<string>();

    // Logic for Steps (New)
    if (routeSteps.length > 0) {
      for (let i = 0; i < routeSteps.length - 1; i++) {
        const startId = routeSteps[i].node_id;
        const endId = routeSteps[i + 1].node_id;
        routeConnections.add(`${startId}-${endId}`);
        routeConnections.add(`${endId}-${startId}`);
      }
    }
    // Logic for Nodes Array (Old/Fallback)
    else if (routeNodes.length > 0) {
      for (let i = 0; i < routeNodes.length - 1; i++) {
        const startNodeIdx = routeNodes[i];
        const endNodeIdx = routeNodes[i + 1];
        const startId = dbNodes[startNodeIdx]?.id;
        const endId = dbNodes[endNodeIdx]?.id;
        if (startId && endId) {
          routeConnections.add(`${startId}-${endId}`);
          routeConnections.add(`${endId}-${startId}`);
        }
      }
    }

    // Map DB Edges to React Flow Edges
    const flowEdges: Edge[] = dbEdges.map(e => {
      const isRoute = routeConnections.has(`${e.node_a_id}-${e.node_b_id}`);
      return {
        id: `e${e.node_a_id}-${e.node_b_id}`,
        source: e.node_a_id.toString(),
        target: e.node_b_id.toString(),
        animated: isRoute, // Animate the active path
        style: {
          stroke: isRoute ? '#2563eb' : '#cbd5e1', // Blue if active, Grey if inactive
          strokeWidth: isRoute ? 4 : 1,
          opacity: isRoute ? 1 : 0.3 // Fade out unused paths
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isRoute ? '#2563eb' : '#cbd5e1'
        },
      };
    });

    setNodes(flowNodes);
    setEdges(flowEdges);

  }, [isOpen, solution, dbNodes, dbEdges]);

  if (!isOpen) return null;

  // --- RENDER ---

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
              <p className="text-[10px] text-slate-500 font-mono">
                VEHICLE 1 • {solution?.total_distance ?? 0} CM
              </p>
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
            className="px-4 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 transition-colors"
          >
            CLOSE PREVIEW
          </button>
        </div>
      </div>
    </div>
  );
};

export default RouteVisualizer;