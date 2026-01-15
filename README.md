# Lertvilai Fleet Management Interface

![Project Status](https://img.shields.io/badge/Status-In%20Development-yellow)
![Tech Stack](https://img.shields.io/badge/Stack-React%20%7C%20ReactFlow%20%7C%20Supabase-blue)

## Overview

The **Lertvilai Fleet Management Interface** is a web-based control system for managing a fleet of Autonomous Mobile Robots (AMRs) in a warehouse environment.

This repository specifically houses **Program 1: Fleet Interface**, which serves as the central command dashboard. It allows operators to design warehouse maps, define road networks (graphs), solve VRPPD (Vehicle Routing Problem with Pickup and Delivery) optimization tasks, and monitor robot status in real-time.

---

## System Architecture

The Fleet Interface is divided into three main operational tabs:

### 1. Tab 1: Graph Designer (Current Focus)
* **Purpose:** To define the "Road Network" that robots can traverse.
* **Functionality:**
    * Upload and render warehouse floor plans as a background map.
    * Create **Nodes** (Waypoints) where robots can park or perform tasks.
    * Draw **Edges** (Paths) to define valid routes between nodes.
    * **Architecture Role:** Serves as the static database generator for the VRPPD Solver.

### 2. Tab 2: Optimization (Upcoming)
* **Purpose:** To solve Pickup & Delivery tasks using VRPPD algorithms.
* **Functionality:**
    * CRUD management of Pickup & Delivery (PD) pairs.
    * Communication with the **VRPPD Broker** via API to solve routing problems.
    * Preview solutions before committing them to the fleet.

### 3. Tab 3: Fleet Controller (Upcoming)
* **Purpose:** Real-time monitoring and control.
* **Functionality:**
    * Visualize robot positions via MQTT streams.
    * Issue Pause/Stop commands to the fleet.

---

## Getting Started

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

## Feature Documentation: Graph Designer

The Graph Designer uses **React Flow** to visualize the warehouse graph.

### Key Components

* **`GraphEditor.tsx`**: The main canvas component. Handles map uploads and state management.
* **`WaypointNode`**: A custom node component designed as a "Red Dot" with a floating label. It supports bidirectional connections (Source/Target) from all 4 sides (Top, Bottom, Left, Right) to allow flexible path creation.

### How to Use
1.  **Upload Map:** Click the "Upload Map" button in the top-right toolbar to load your warehouse floor plan.
2.  **Add Nodes:** Click "Add Node" to spawn a new Waypoint (Red Dot). Drag the center of the dot to move it.
3.  **Create Edges:** Hover over a Red Dot to reveal 4 white handles. Click and drag from a handle to another node to create a path.
4.  **Save:** (In Progress) Click "Save Map" to export the graph structure to Supabase.

---

## Project Structure

```text
src/
├── components/
│   ├── GraphEditor.tsx       # Main Map Designer Canvas
│   ├── WaypointNode.tsx      # Custom Node UI (Red Dot)
│   └── ...
├── App.tsx                   # Main Entry Point
└── main.tsx                  # React DOM Render
