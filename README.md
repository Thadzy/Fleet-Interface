# Lertvilai Fleet Management Interface

![Project Status](https://img.shields.io/badge/Status-Prototype%20Complete-green)
![Tech Stack](https://img.shields.io/badge/Stack-React%20%7C%20ReactFlow%20%7C%20Supabase-blue)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

## Overview

The **Lertvilai Fleet Management Interface** is a web-based "Control Room" for managing a fleet of Autonomous Mobile Robots (AMRs) in a warehouse environment.

This application allows operators to:
1.  **Design** the warehouse road network (Graph).
2.  **Plan** tasks using a VRP (Vehicle Routing Problem) optimization engine.
3.  **Monitor** the fleet in real-time using a digital twin simulation.

---

## System Architecture

The application is structured into three primary operational modules (Tabs):

### 1. Graph Designer (Map Builder)
* **Purpose:** Define the static "Road Network" robots travel on.
* **Key Features:**
    * **Map Digitization:** Upload warehouse floor plans (PNG/JPG) as background overlays.
    * **Tool-Based Editing:** Switch between **Move Mode** (layout adjustment) and **Connect Mode** (path linking).
    * **Supabase Sync:** Loads and saves graph data (Nodes & Edges) directly to the cloud.
    * **Centralized Connections:** Uses 360° node handles for clean, straight-line paths.

### 2. Optimization Engine (Task Planner)
* **Purpose:** Assign Pickup & Delivery tasks to robots efficiently.
* **Key Features:**
    * **Task Queue:** CRUD interface for managing transport requests.
    * **VRP Solver:** Includes a **Mock Solver** for simulation and hooks for a real C++ VRP backend.
    * **Route Visualizer:** A read-only map popup to preview the calculated path before dispatching.

### 3. Fleet Controller (Operation Center)
* **Purpose:** Real-time monitoring and command broadcasting.
* **Key Features:**
    * **Simulation Mode:** Built-in "Ghost Robot" engine to test UI responsiveness without hardware.
    * **MQTT Ready:** Pre-wired architecture to switch from Simulation to Live Telemetry streams.
    * **Global Commands:** Broadcast Pause, Resume, and Emergency Stop signals.

---

## Getting Started

### Prerequisites
* Node.js (v18+)
* npm or yarn
* A valid **Supabase** project URL and Anon Key.

### Installation

1.  **Clone the repository**
    ```bash
    git clone [https://github.com/your-username/lertvilai-fleet-interface.git](https://github.com/your-username/lertvilai-fleet-interface.git)
    cd lertvilai-fleet-interface
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment**
    Create a `.env.local` file in the root directory:
    ```env
    VITE_SUPABASE_URL=your_supabase_project_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    ```

4.  **Start the development server**
    ```bash
    npm run dev
    ```

---

## Usage Guide

### Graph Designer (Tab 1)
* **Move Tool (Cursor Icon):** Select and drag nodes to position them on the map.
* **Connect Tool (Link Icon):** Click and drag from one node to another to create a blue dotted path.
* **Upload Map:** Use the upload button to place a floor plan image.
* **Remove Background:** If a map exists, a red "X" appears to remove it.

### Optimization (Tab 2)
1.  **Create Tasks:** Select "Pickup" and "Delivery" locations from the dropdowns on the right.
2.  **Select & Solve:** Check the boxes next to the tasks you want to bundle and click **"SOLVE SELECTED"**.
3.  **Preview & Dispatch:** Review the "Route Visualization" popup, then click **"DISPATCH"** to send orders to the fleet.

### Fleet Controller (Tab 3)
* **Simulation:** By default, the app runs a physics simulation moving robots between nodes.
* **Switching to Real Data:** Uncomment the MQTT logic in `src/components/FleetController.tsx` to connect to a live broker.

---

## Project Structure

```text
src/
├── components/          # UI Modules
│   ├── GraphEditor.tsx      # Tab 1: Map Designer
│   ├── Optimization.tsx     # Tab 2: VRP Solver & Task Queue
│   ├── FleetController.tsx  # Tab 3: Simulation & Monitoring
│   ├── RouteVisualizer.tsx  # Modal for viewing solved paths
│   └── ...
├── hooks/               # Custom React Hooks (Logic Layer)
│   ├── useGraphData.ts      # Supabase CRUD for Maps
│   ├── useTasks.ts          # Supabase CRUD for Tasks
│   └── useRobotSimulation.ts # Physics engine for Ghost Robots
├── lib/                 # Configuration
│   └── supabaseClient.ts    # Singleton DB connection
├── types/               # TypeScript Definitions
│   └── database.ts          # DB Schema Interfaces (Nodes, Edges)
└── utils/               # Helpers
    └── solverUtils.ts       # Floyd-Warshall Algorithm & Mock VRP
```

License
This project is proprietary software developed for Lertvilai.