import time
import json
import random
import math
import paho.mqtt.client as mqtt

# --- CONFIG ---
BROKER = 'broker.emqx.io'
PORT = 1883
ROBOT_ID = 1  # Must match the ID in your Database (e.g. Veri-Bot-1)
TOPIC = f"robots/{ROBOT_ID}/status"

def on_connect(client, userdata, flags, rc):
    print(f"Connected to MQTT Broker with result code {rc}")

client = mqtt.Client(client_id=f"sim_robot_{ROBOT_ID}")
client.on_connect = on_connect

print(f"Connecting to {BROKER}...")
client.connect(BROKER, PORT, 60)
client.loop_start()

# Simulation State
state = {
    "x": 1.5,
    "y": 1.5,
    "battery": 100,
    "status": "idle",
    "target_x": None,
    "target_y": None
}

def on_message(client, userdata, msg):
    try:
        topic = msg.topic
        if "command" in topic:
            payload = json.loads(msg.payload.decode())
            print(f"[RECV] Command: {payload}")
            cmd = payload.get("command")
            if cmd == "GOTO":
                state["target_x"] = payload.get("target_x")
                state["target_y"] = payload.get("target_y")
                state["status"] = "busy"
            elif cmd == "PAUSE":
                state["status"] = "idle"
                state["target_x"] = None
                state["target_y"] = None
                
    except Exception as e:
        print(f"Error parsing command: {e}")

client.on_message = on_message
client.subscribe(f"robots/{ROBOT_ID}/command")

print(f"Simulating Robot {ROBOT_ID}...")
print(f"Listening for commands on robots/{ROBOT_ID}/command")
print(f"Publishing status to {TOPIC}")

try:
    while True:
        # 1. Movement Logic
        if state["target_x"] is not None and state["target_y"] is not None:
            # Move towards target
            dx = state["target_x"] - state["x"]
            dy = state["target_y"] - state["y"]
            dist = math.sqrt(dx*dx + dy*dy)
            
            speed = 0.1 # units per tick (10Hz = 1 unit per second approx)
            
            if dist < speed:
                # Arrived
                state["x"] = state["target_x"]
                state["y"] = state["target_y"]
                state["target_x"] = None
                state["target_y"] = None
                state["status"] = "idle"
                print("Arrived at target.")
            else:
                # Move
                ratio = speed / dist
                state["x"] += dx * ratio
                state["y"] += dy * ratio
        else:
            # Idle behavior: Just stay put (or slow drift to show liveness if desired, but user disliked random move)
            pass 

        # 2. Battery Drain
        state["battery"] = max(0, state["battery"] - 0.001)

        # 4. Construct Payload
        payload = {
            "id": ROBOT_ID,
            "status": state["status"],
            "battery": int(state["battery"]),
            "x": round(state["x"], 2),
            "y": round(state["y"], 2),
            "angle": 0,
            "current_task_id": 102 if state["status"] == "busy" else None
        }

        # 5. Publish
        client.publish(TOPIC, json.dumps(payload))
        # print(f"Sent: {payload}") # Reduce spam
        
        time.sleep(0.1)

except KeyboardInterrupt:
    print("Simulation stopped.")
    client.loop_stop()
    client.disconnect()
