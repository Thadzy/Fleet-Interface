import os
import time
import json
import asyncio
from dotenv import load_dotenv
from supabase import create_client, Client
import paho.mqtt.client as mqtt

# --- LOAD CONFIG ---
# Try to load from local .env first, then fallback to Frontend .env if possible
load_dotenv() 

# Supabase Config
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Supabase URL or Key not found. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env")
    # For dev convenience, we might hint looking at the frontend folder, 
    # but for now we'll just fail gracefully or use placeholders if tested locally.

# MQTT Config
MQTT_BROKER = "broker.emqx.io"
MQTT_PORT = 1883

# --- GLOBAL STATE ---
db: Client = None
mqtt_client: mqtt.Client = None
robot_status_cache = {} # { robot_id: { status, x, y } }

# --- DATABASE HELPERS ---

def init_db():
    global db
    if SUPABASE_URL and SUPABASE_KEY:
        db = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Connected to Supabase.")
    else:
        print("Warning: Database not connected.")

def fetch_pending_assignments():
    if not db: return []
    try:
        # Get 'in_progress' assignments that might need attention
        response = db.table("wh_assignments").select("*").eq("status", "in_progress").execute()
        return response.data
    except Exception as e:
        print(f"DB Error (fetch_assignments): {e}")
        return []

def fetch_assignment_tasks(assignment_id):
    if not db: return []
    try:
        response = db.table("wh_tasks").select("*").eq("assignment_id", assignment_id).order("seq_order").execute()
        return response.data
    except Exception as e:
        print(f"DB Error (fetch_tasks): {e}")
        return []

def update_task_status(task_id, status):
    if not db: return
    try:
        db.table("wh_tasks").update({"status": status}).eq("id", task_id).execute()
        print(f"[DB] Task {task_id} updated to {status}")
    except Exception as e:
        print(f"DB Error (update_task): {e}")

def update_assignment_status(assignment_id, status):
    if not db: return
    try:
        db.table("wh_assignments").update({"status": status}).eq("id", assignment_id).execute()
        print(f"[DB] Assignment {assignment_id} updated to {status}")
    except Exception as e:
        print(f"DB Error (update_assignment): {e}")

def fetch_node_position(cell_id):
    if not db: return None
    try:
        # Get Cell -> Node -> x,y
        # Supabase Python client join syntax is a bit specific, usually we do 2 queries or a view.
        # Let's do 2 queries for simplicity/robustness in prototype.
        cell_resp = db.table("wh_cells").select("node_id").eq("id", cell_id).single().execute()
        if not cell_resp.data: return None
        
        node_id = cell_resp.data['node_id']
        node_resp = db.table("wh_nodes").select("x,y,name").eq("id", node_id).single().execute()
        return node_resp.data
    except Exception as e:
        print(f"DB Error (fetch_pos): {e}")
        return None

# --- MQTT HELPERS ---

def on_mqtt_connect(client, userdata, flags, rc):
    print(f"Connected to MQTT Broker (RC: {rc})")
    client.subscribe("robots/+/status")

def on_mqtt_message(client, userdata, msg):
    try:
        topic = msg.topic # robots/{id}/status
        payload = json.loads(msg.payload.decode())
        
        # Parse Robot ID
        parts = topic.split('/')
        if len(parts) >= 2:
            robot_id = parts[1]
            robot_status_cache[robot_id] = payload
            # print(f"Update Robot {robot_id}: {payload['status']}")
            
    except Exception as e:
        print(f"MQTT Parse Error: {e}")

def send_robot_command(robot_id, command_type, target_x, target_y):
    topic = f"robots/{robot_id}/command"
    payload = {
        "command": command_type,
        "target_x": target_x,
        "target_y": target_y,
        "timestamp": time.time()
    }
    mqtt_client.publish(topic, json.dumps(payload))
    print(f"[MQTT] Sent {command_type} to Robot {robot_id} -> ({target_x}, {target_y})")

# --- CORE LOGIC ---

async def process_assignments():
    """Watch assignments and dispatch tasks."""
    print("Starting Assignment Processor Loop...")
    
    while True:
        assignments = fetch_pending_assignments()
        
        for asn in assignments:
            # For each in-progress assignment, check its tasks
            tasks = fetch_assignment_tasks(asn['id'])
            
            # Simple State Machine per Assignment
            # Find the first non-completed task
            current_task = next((t for t in tasks if t['status'] != 'completed'), None)
            
            if not current_task:
                # All tasks completed?
                if tasks and all(t['status'] == 'delivered' for t in tasks):
                    update_assignment_status(asn['id'], 'completed')
                continue

            robot_id = str(asn['robot_id']) if asn['robot_id'] else "1" # Default to Robot 1 if null (Prototype hack)
            
            # What is the state of this task?
            status = current_task['status']
            
            if status == 'on_another_delivery' or status == 'pending' or status == 'queuing': 
                # Note: 'on_another_delivery' is the default insert status in current Optimization.tsx
                # We transition to 'pickup_en_route' to indicate movement starts.
                
                print(f"Starting Task {current_task['id']} (Moving to Target)")
                update_task_status(current_task['id'], 'pickup_en_route')
                publish_log(f"Robot {robot_id} Started Task #{current_task['id']} (Moving)")
                
                # Get Target
                target_cell = current_task['cell_id']
                target_pos = fetch_node_position(target_cell)
                
                if target_pos:
                    send_robot_command(robot_id, "GOTO", target_pos['x'], target_pos['y'])
                else:
                    print(f"Error: Unknown position for cell {target_cell}")
            
            elif status == 'pickup_en_route' or status == 'picking_up' or status == 'delivery_en_route':
                # Check if Robot has arrived
                # We need the robot's current position from MQTT cache
                # robot_id is "1" (string) or 1 (int). Be careful with keys.
                
                bot_state = robot_status_cache.get(str(robot_id)) or robot_status_cache.get(int(robot_id))
                
                if bot_state:
                    # Check Distance to Target
                    target_cell = current_task['cell_id']
                    target_pos = fetch_node_position(target_cell)
                    
                    if target_pos:
                        dx = bot_state['x'] - target_pos['x']
                        dy = bot_state['y'] - target_pos['y']
                        dist = (dx**2 + dy**2)**0.5
                        
                        # Within 0.3 units (30cm) ?
                        if dist < 0.3:
                            print(f"Robot {robot_id} Arrived at Task {current_task['id']}")
                            update_task_status(current_task['id'], 'delivered')
                            publish_log(f"Robot {robot_id} Completed Task #{current_task['id']}")
                            # The next loop iteration will pick up the next task
                        elif bot_state['status'] == 'idle':
                             # Robot stopped but not at target? Resend command!
                             # This handles cases where the initial MQTT packet was lost or the robot was reset.
                             print(f"Warning: Robot {robot_id} is IDLE but should be at {target_pos['x']},{target_pos['y']}. Resending GOTO.")
                             send_robot_command(robot_id, "GOTO", target_pos['x'], target_pos['y'])
        
        await asyncio.sleep(2)

def publish_log(msg):
    """Publish a log message to the fleet/logs topic for the frontend."""
    if mqtt_client:
        payload = {
            "msg": msg,
            "timestamp": time.time()
        }
        mqtt_client.publish("fleet/logs", json.dumps(payload))
        print(f"[LOG] {msg}") # Optional debug print

def main():
    # 1. Init DB
    init_db()
    
    # 2. Init MQTT
    global mqtt_client
    mqtt_client = mqtt.Client(client_id="fleet_gateway_v1")
    mqtt_client.on_connect = on_mqtt_connect
    mqtt_client.on_message = on_mqtt_message
    
    print(f"Connecting to MQTT {MQTT_BROKER}...")
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_start()

    # 3. Start Loop
    try:
        asyncio.run(process_assignments())
    except KeyboardInterrupt:
        print("Stopping Gateway...")
        mqtt_client.loop_stop()

if __name__ == "__main__":
    main()
