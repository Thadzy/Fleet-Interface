import { type DBNode, type DBEdge } from '../types/database';

// --- 1. MATH HELPERS (Translator) ---

const getDist = (a: DBNode, b: DBNode) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const generateDistanceMatrix = (nodes: DBNode[], edges: DBEdge[]): number[][] => {
  const n = nodes.length;
  // Initialize with generic high cost (Infinity)
  const dist: number[][] = Array(n).fill(null).map(() => Array(n).fill(Infinity));

  const idToIndex = new Map<number, number>();
  nodes.forEach((node, index) => {
    idToIndex.set(node.id, index);
    dist[index][index] = 0;
  });

  edges.forEach(edge => {
    const u = idToIndex.get(edge.node_a_id);
    const v = idToIndex.get(edge.node_b_id);
    const nodeA = nodes.find(n => n.id === edge.node_a_id);
    const nodeB = nodes.find(n => n.id === edge.node_b_id);

    if (u !== undefined && v !== undefined && nodeA && nodeB) {
      // Scale by 100 to convert meters to cm (integers) for the solver
      const weight = Math.round(getDist(nodeA, nodeB) * 100); 
      dist[u][v] = weight;
      dist[v][u] = weight;
    }
  });

  // Floyd-Warshall Algorithm (All-pairs shortest path)
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (dist[i][k] + dist[k][j] < dist[i][j]) {
          dist[i][j] = dist[i][k] + dist[k][j];
        }
      }
    }
  }

  // Convert unreachable (Infinity) to -1 for the C++ Solver
  return dist.map(row => row.map(val => (val === Infinity ? -1 : val)));
};

export const formatTasksForSolver = (tasks: any[], nodes: DBNode[]): number[][] => {
  const idToIndex = new Map<number, number>();
  nodes.forEach((node, index) => idToIndex.set(node.id, index));

  return tasks.map(t => {
    // Note: Depends on how your useTasks hook returns data. 
    // Assuming t.pickup_cell_id maps to a node eventually, 
    // but for simplicity here we assume we can resolve the Node ID.
    // In a real app, you might need to fetch the Node ID associated with the Cell ID first.
    
    // MOCKING IDs for the prototype if real join data is missing:
    // This just grabs random nodes if the real map isn't perfect yet.
    const pickupIdx = idToIndex.get(t.pickup_node_id) || 1; 
    const deliveryIdx = idToIndex.get(t.delivery_node_id) || 2;
    
    return [pickupIdx, deliveryIdx];
  });
};

// --- 2. MOCK SOLVER (Simulation Mode) ---
// ACTIVE: Use this for development/demo
export const mockSolveVRP = async (matrix: number[][], tasks: number[][]) => {
  console.log("SIMULATION MODE: Solving...", { matrixSize: matrix.length, tasks: tasks.length });
  
  // Simulate network latency (0.8s)
  await new Promise(resolve => setTimeout(resolve, 800));

  // Generate a fake route based on the matrix size
  // It simply visits the first few nodes available in the map
  const routeNodes = [0];
  const maxNode = Math.min(matrix.length - 1, 5); // Don't go out of bounds
  for(let i=1; i<=maxNode; i++) routeNodes.push(i);
  routeNodes.push(0); // Return to start

  return {
    feasible: true,
    total_distance: 1250,
    wall_time_ms: 45,
    routes: [
      {
        vehicle_id: 1,
        nodes: routeNodes,
        distance: 1250
      }
    ],
    summary: "Simulation: Optimal route found using mock logic."
  };
};

// --- 3. REAL SOLVER (Production Mode) ---
// INACTIVE: Switch to this when C++ server is running (localhost:7779)
/*
export const solveVRP = async (matrix: number[][], tasks: number[][]) => {
  console.log("🚀 PRODUCTION MODE: Calling VRP Broker...");

  const payload = {
    distance_matrix: matrix,
    pickups_deliveries: tasks,
    num_vehicles: 1,
    depot: 0,
    vehicle_max_distance: 5000,
    global_span_cost_coefficient: 100
  };

  try {
    const response = await fetch('http://127.0.0.1:7779/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const result = await response.json();
    return result;

  } catch (error) {
    console.error("VRP Broker Connection Failed:", error);
    throw error;
  }
};
*/