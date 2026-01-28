import { type DBNode, type DBEdge } from '../types/database';

// =========================================================
// 1. MATH & GRAPH HELPERS
// =========================================================

/**
 * Calculates Euclidean distance between two nodes.
 * @returns Distance in raw units (meters in this app).
 */
const getDist = (a: DBNode, b: DBNode): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Generates an All-Pairs Shortest Path Matrix using the Floyd-Warshall Algorithm.
 * * WHY IS THIS NEEDED?
 * The VRP Solver (OR-Tools) requires a cost matrix where matrix[i][j] represents
 * the travel cost from Node i to Node j.
 * * COMPLEXITY WARNING:
 * This runs in O(n^3). For a warehouse with < 200 nodes, it's instant (~5ms).
 * For > 500 nodes, this calculation should be moved to the Backend/Server.
 */
export const generateDistanceMatrix = (nodes: DBNode[], edges: DBEdge[]): number[][] => {
  const n = nodes.length;
  // Initialize with Infinity (representing no direct path)
  const dist: number[][] = Array(n).fill(null).map(() => Array(n).fill(Infinity));

  // Create a quick lookup map: NodeID -> Matrix Index (0 to n-1)
  const idToIndex = new Map<number, number>();
  nodes.forEach((node, index) => {
    idToIndex.set(node.id, index);
    dist[index][index] = 0; // Distance to self is 0
  });

  // Populate matrix with direct edge weights
  edges.forEach(edge => {
    const u = idToIndex.get(edge.node_a_id);
    const v = idToIndex.get(edge.node_b_id);
    const nodeA = nodes.find(n => n.id === edge.node_a_id);
    const nodeB = nodes.find(n => n.id === edge.node_b_id);

    if (u !== undefined && v !== undefined && nodeA && nodeB) {
      // SCALING: Convert Meters to Centimeters (Integers are faster for solvers)
      const weight = Math.round(getDist(nodeA, nodeB) * 100);

      // Assume bidirectional edges for now
      dist[u][v] = weight;
      dist[v][u] = weight;
    }
  });

  // Floyd-Warshall Logic: Find shortest path via intermediate node 'k'
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (dist[i][k] + dist[k][j] < dist[i][j]) {
          dist[i][j] = dist[i][k] + dist[k][j];
        }
      }
    }
  }

  // Final Polish: Convert remaining Infinity to -1 (standard convention for "unreachable")
  return dist.map(row => row.map(val => (val === Infinity ? -1 : val)));
};

/**
 * Formats user-selected tasks into simple [PickupIndex, DeliveryIndex] pairs.
 * * NOTE: This function attempts to map Task Names back to Node Indices because
 * the frontend 'Task' object might strictly contain IDs.
 */
export const formatTasksForSolver = (tasks: any[], nodes: DBNode[]): number[][] => {
  const nameToIndex = new Map<string, number>();
  nodes.forEach((node, index) => nameToIndex.set(node.name, index));

  return tasks.map(t => {
    // Attempt 1: Try to match by Node Name (Robust)
    let pickupIdx = nameToIndex.get(t.pickup_name);
    let deliveryIdx = nameToIndex.get(t.delivery_name);

    // Fallback: If map fails, default to generic indices (0, 1) to prevent crash
    // In production, this should throw an error or filter out the task.
    if (pickupIdx === undefined) pickupIdx = 1;
    if (deliveryIdx === undefined) deliveryIdx = 2;

    return [pickupIdx, deliveryIdx];
  });
};

// =========================================================
// 2. MOCK SOLVER (SIMULATION MODE)
// =========================================================

/**
 * Simulates a VRP Solver response.
 * Creates a route that simply visits every requested task in order.
 * * VISUALIZATION TIP:
 * Takes the [Pick, Drop] pairs and constructs a sequential path:
 * Depot -> Pick A -> Drop A -> Pick B -> Drop B -> Depot
 */
/**
 * Step in a VRP Route.
 */
export interface RouteStep {
  type: 'move' | 'pickup' | 'dropoff';
  node_id: number;
  request_id?: number;
  cell_id?: number; // Corresponding cell_id for the action
}

/**
 * Simulates a VRP Solver response.
 * Creates a route that simply visits every requested task in order.
 */
export const mockSolveVRP = async (_matrix: number[][], tasks: any[], nodes: DBNode[], cells: any[]) => { // Added nodes/cells to context
  console.log("SIMULATION MODE: Solving...", { tasks: tasks.length });

  // 1. Simulate Network Latency
  await new Promise(resolve => setTimeout(resolve, 600));

  // 2. Construct a Dummy Route
  // Start at Depot
  const depotNode = nodes.find(n => n.type === 'depot') || nodes[0];
  const routeSteps: RouteStep[] = [];

  // Initial Move
  routeSteps.push({ type: 'move', node_id: depotNode.id });

  let totalDistance = 0;
  let lastNodeId = depotNode.id;

  // Visit each task sequentially
  tasks.forEach((task) => {
    // Pickup Step
    // Find node ID for this pickup cell
    const pickupCell = cells.find(c => c.id === task.pickup_cell_id);
    const pickupNodeId = pickupCell ? pickupCell.node_id : lastNodeId;

    routeSteps.push({
      type: 'pickup',
      node_id: pickupNodeId,
      request_id: task.id,
      cell_id: task.pickup_cell_id
    });

    // Add distance (mock)
    totalDistance += 500; // Arbitrary distance

    // Delivery Step
    const deliveryCell = cells.find(c => c.id === task.delivery_cell_id);
    const deliveryNodeId = deliveryCell ? deliveryCell.node_id : pickupNodeId;

    routeSteps.push({
      type: 'dropoff',
      node_id: deliveryNodeId,
      request_id: task.id,
      cell_id: task.delivery_cell_id
    });

    totalDistance += 500;
    lastNodeId = deliveryNodeId;
  });

  // Return to start
  routeSteps.push({ type: 'move', node_id: depotNode.id });

  return {
    feasible: true,
    total_distance: totalDistance,
    wall_time_ms: 45,
    routes: [
      {
        vehicle_id: 1, // Mock Assigned Robot
        steps: routeSteps,
        distance: totalDistance
      }
    ],
    summary: "Simulation: Route constructed sequentially."
  };
};

// =========================================================
// 3. REAL SOLVER (PRODUCTION MODE)
// =========================================================

/*
// UNCOMMENT THIS WHEN BACKEND IS READY
// Expects a C++ VRP Broker running on localhost:7779
export const solveVRP = async (matrix: number[][], tasks: number[][]) => {
  console.log("PRODUCTION MODE: Calling VRP Broker...");

  const payload = {
    distance_matrix: matrix,
    pickups_deliveries: tasks,
    num_vehicles: 1, // Currently single agent for prototype
    depot: 0,
    vehicle_max_distance: 100000,
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