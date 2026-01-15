# Lertvilai Fleet Management Interface

![Project Status](https://img.shields.io/badge/Status-In%20Development-yellow)
![Tech Stack](https://img.shields.io/badge/Stack-React%20%7C%20ReactFlow%20%7C%20Supabase-blue)

## 📖 Overview

[cite_start]The **Lertvilai Fleet Management Interface** is a web-based control system for managing a fleet of Autonomous Mobile Robots (AMRs) in a warehouse environment[cite: 1, 2].

[cite_start]This repository specifically houses **Program 1: Fleet Interface**, which serves as the central command dashboard[cite: 7]. [cite_start]It allows operators to design warehouse maps, define road networks (graphs), solve VRPPD (Vehicle Routing Problem with Pickup and Delivery) optimization tasks, and monitor robot status in real-time[cite: 8, 9, 13, 19].

---

## 🏗 System Architecture

The Fleet Interface is divided into three main operational tabs:

### 1. 🗺️ Tab 1: Graph Designer (Current Focus)
* [cite_start]**Purpose:** To define the "Road Network" that robots can traverse[cite: 10].
* **Functionality:**
    * [cite_start]Upload and render warehouse floor plans as a background map[cite: 10].
    * [cite_start]Create **Nodes** (Waypoints) where robots can park or perform tasks[cite: 10, 11].
    * [cite_start]Draw **Edges** (Paths) to define valid routes between nodes[cite: 10].
    * **Architecture Role:** Serves as the static database generator for the VRPPD Solver.

### 2. ⚡ Tab 2: Optimization (Upcoming)
* [cite_start]**Purpose:** To solve Pickup & Delivery tasks using VRPPD algorithms[cite: 13, 15].
* **Functionality:**
    * [cite_start]CRUD management of Pickup & Delivery (PD) pairs.
    * [cite_start]Communication with the **VRPPD Broker** via API to solve routing problems.
    * [cite_start]Preview solutions before committing them to the fleet[cite: 18].

### 3. 🤖 Tab 3: Fleet Controller (Upcoming)
* [cite_start]**Purpose:** Real-time monitoring and control[cite: 19].
* **Functionality:**
    * [cite_start]Visualize robot positions via MQTT streams[cite: 20, 21].
    * [cite_start]Issue Pause/Stop commands to the fleet[cite: 22].

---

## 🚀 Getting Started

### Prerequisites
* Node.js (v18+)
* npm or yarn

### Installation

1.  **Clone the repository**
    ```bash
    git clone [https://github.com/your-username/lertvilai-fleet-interface.git](https://github.com/your-username/lertvilai-fleet-interface.git)
    cd lertvilai-fleet-interface
    ```

2.  **Install dependencies**
    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Start the development server**
    ```bash
    npm run dev
    # or
    yarn dev
    ```

---

## 🛠 Feature Documentation: Graph Designer

The Graph Designer uses **React Flow** to visualize the warehouse graph.

### Key Components

* **`GraphEditor.tsx`**: The main canvas component. Handles map uploads and state management.
* **`WaypointNode`**: A custom node component designed as a "Red Dot" with a floating label. It supports bidirectional connections (Source/Target) from all 4 sides (Top, Bottom, Left, Right) to allow flexible path creation.

### How to Use
1.  **Upload Map:** Click the "Upload Map" button in the top-right toolbar to load your warehouse floor plan.
2.  **Add Nodes:** Click "Add Node" to spawn a new Waypoint (Red Dot). Drag the center of the dot to move it.
3.  **Create Edges:** Hover over a Red Dot to reveal 4 white handles. Click and drag from a handle to another node to create a path.
4.  [cite_start]**Save:** (In Progress) Click "Save Map" to export the graph structure to Supabase.

---

## 📂 Project Structure

```text
src/
├── components/
│   ├── GraphEditor.tsx       # Main Map Designer Canvas
│   ├── WaypointNode.tsx      # Custom Node UI (Red Dot)
│   └── ...
├── App.tsx                   # Main Entry Point
└── main.tsx                  # React DOM Render
