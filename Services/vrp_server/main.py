from flask import Flask, request, jsonify
from flask_cors import CORS
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp
import math
import time

app = Flask(__name__)
CORS(app) # Enable Cross-Origin Resource Sharing

# --- CONFIG ---
DEPOT_INDEX = 0

def create_data_model(matrix, requests, num_vehicles, depot_index):
    """Stores the data for the problem."""
    data = {}
    data['distance_matrix'] = matrix
    # requests is expected to be [[pickup_idx, delivery_idx], ...]
    data['pickups_deliveries'] = requests 
    data['num_vehicles'] = num_vehicles
    data['depot'] = depot_index
    return data

def solve_vrp(distance_matrix, requests, num_vehicles):
    """Solves the VRP with Pickup and Delivery constraints."""
    # Instantiate the data problem.
    data = create_data_model(distance_matrix, requests, num_vehicles, DEPOT_INDEX)

    # Note: If no requests, just return empty route
    if not data['pickups_deliveries']:
         return None

    # Create the routing index manager.
    manager = pywrapcp.RoutingIndexManager(len(data['distance_matrix']),
                                           data['num_vehicles'], data['depot'])

    # Create Routing Model.
    routing = pywrapcp.RoutingModel(manager)

    # Create and register a transit callback.
    def distance_callback(from_index, to_index):
        # Returns the distance between the two nodes.
        from_node = manager.IndexToNode(from_index)
        to_node = manager.IndexToNode(to_index)
        return data['distance_matrix'][from_node][to_node]

    transit_callback_index = routing.RegisterTransitCallback(distance_callback)

    # Define cost of each arc.
    routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

    # Add Distance constraint.
    dimension_name = 'Distance'
    routing.AddDimension(
        transit_callback_index,
        0,  # no slack
        300000,  # vehicle maximum travel distance
        True,  # start cumul to zero
        dimension_name)
    distance_dimension = routing.GetDimensionOrDie(dimension_name)
    distance_dimension.SetGlobalSpanCostCoefficient(100)

    # --- ADD PICKUP AND DELIVERIES ---
    for request in data['pickups_deliveries']:
        pickup_index = manager.NodeToIndex(request[0])
        delivery_index = manager.NodeToIndex(request[1])
        
        # Enforce that the same vehicle does both
        routing.AddPickupAndDelivery(pickup_index, delivery_index)
        
        # Enforce that pickup <= delivery (same as distance constraint check essentially)
        routing.solver().Add(
            distance_dimension.CumulVar(pickup_index) <=
            distance_dimension.CumulVar(delivery_index))

    # Setting first solution heuristic.
    search_parameters = pywrapcp.DefaultRoutingSearchParameters()
    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION)

    # Solve the problem.
    solution = routing.SolveWithParameters(search_parameters)

    # Format solution
    if solution:
        return format_solution(data, manager, routing, solution)
    else:
        return None

def format_solution(data, manager, routing, solution):
    """Prints solution on console."""
    steps_list = []
    total_distance = 0
    
    routes = []

    for vehicle_id in range(data['num_vehicles']):
        index = routing.Start(vehicle_id)
        route_distance = 0
        route_nodes = []
        
        while not routing.IsEnd(index):
            node_index = manager.IndexToNode(index)
            route_nodes.append(node_index)
            
            previous_index = index
            index = solution.Value(routing.NextVar(index))
            route_distance += routing.GetArcCostForVehicle(previous_index, index, vehicle_id)
        
        # Add end node (depot)
        route_nodes.append(manager.IndexToNode(index))
        
        total_distance += route_distance
        
        if len(route_nodes) > 2: # Ignore empty routes (Depot -> Depot)
            routes.append({
                "vehicle_id": vehicle_id,
                "nodes": route_nodes,
                "distance": route_distance
            })

    return {
        "feasible": True,
        "total_distance": total_distance,
        "routes": routes
    }


@app.route('/solve', methods=['POST'])
def solve():
    try:
        req_data = request.json
        if not req_data:
            return jsonify({"error": "No data provided"}), 400

        matrix = req_data.get('matrix')
        requests = req_data.get('requests', [])
        num_vehicles = req_data.get('vehicle_count', 2)

        if not matrix:
            return jsonify({"error": "Missing distance matrix"}), 400

        print(f"Solving VRP for {num_vehicles} vehicles and {len(matrix)} nodes with {len(requests)} tasks...")
        start_time = time.time()
        
        result = solve_vrp(matrix, requests, num_vehicles)
        
        end_time = time.time()
        
        if result:
            result['wall_time_ms'] = int((end_time - start_time) * 1000)
            return jsonify(result)
        else:
            return jsonify({"feasible": False, "error": "No solution found"}), 422

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "service": "VRP Solver"})

if __name__ == '__main__':
    print("Starting VRP Solver on port 7779...")
    app.run(host='0.0.0.0', port=7779, debug=True)
