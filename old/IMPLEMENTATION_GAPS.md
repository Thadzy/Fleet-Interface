# Implementation Gaps Analysis

This document compares the current codebase against the specification to identify what needs to be implemented.

## 📋 Table of Contents
1. [Database Schema Issues](#database-schema-issues)
2. [Program 1: Fleet Interface](#program-1-fleet-interface)
3. [Program 2: Robot Interface](#program-2-robot-interface)
4. [Backend Integration](#backend-integration)
5. [Missing Features Summary](#missing-features-summary)

---

## 🗄️ Database Schema Issues

### Current State
- ✅ `wh_graphs` - Implemented
- ✅ `wh_nodes` - Implemented (but missing node types: inbound, outbound, shelf, depot)
- ✅ `wh_edges` - Implemented
- ⚠️ `wh_cells` - Referenced but not fully utilized
- ❌ `wh_levels` - Not implemented
- ❌ `wh_requests` - Using `pd_pairs` instead (should use `wh_requests`)
- ❌ `wh_assignments` - Not implemented
- ❌ `wh_tasks` - Not implemented
- ❌ `wh_robots` - Not implemented
- ❌ `wh_robot_slots` - Not implemented

### Required Changes

1. **Node Types**: Graph Editor should support all node types:
   - `inbound` - Receiving area
   - `outbound` - Shipping area
   - `shelf` - Storage location
   - `waypoint` - Navigation point
   - `depot` - Robot parking/charging station

2. **Replace `pd_pairs` with `wh_requests`**:
   - Current: Using `pd_pairs` table
   - Required: Use `wh_requests` table with proper status tracking
   - Status values: `cancelled`, `failed`, `queuing`, `awaiting`, `transporting`, `completed`

3. **Implement `wh_assignments` table**:
   - Store VRP solution as assignments
   - Fields: `status`, `original_seq` (JSON), `provider`, `priority`
   - Status: `cancelled`, `failed`, `in_progress`, `partial`, `completed`
   - Provider: `user`, `user_vrp`, `wms`, `wms_vrp`, `test`, `test_vrp`

4. **Implement `wh_tasks` table**:
   - Created from assignments
   - Fields: `cell_id`, `retrieve` (bool), `status`, `seq_order`
   - Status: `cancelled`, `failed`, `on_another_delivery`, `pickup_en_route`, `picking_up`, `delivery_en_route`, `dropping_off`, `delivered`

5. **Implement `wh_robots` table**:
   - Fields: `status`, `endpoint`, `capacity`
   - Status: `offline`, `idle`, `inactive`, `on_duty`

6. **Implement `wh_robot_slots` table**:
   - Tracks which requests are being carried by which robot
   - Auto-updated when robot capacity changes

---

## 🏭 Program 1: Fleet Interface

### Tab 1: Graph Editor ✅ (Mostly Complete)

**Current State:**
- ✅ Load/Save graph data
- ✅ Upload map images
- ✅ Add/Delete nodes and edges
- ✅ Visual editing with ReactFlow

**Missing:**
- ❌ Node type selection (currently all nodes are waypoints)
- ❌ Support for `depot` nodes (robot parking)
- ❌ Cell management (cells should be associated with inbound/outbound/shelf nodes)
- ❌ Level management (height configuration for cells)

**Required Changes:**
1. Add node type selector in Graph Editor
2. Visual distinction for different node types (color coding)
3. Cell creation UI for shelf/inbound/outbound nodes
4. Level configuration UI

---

### Tab 2: Optimization ⚠️ (Partially Complete)

**Current State:**
- ✅ CRUD for Pickup & Delivery pairs
- ✅ Task selection UI
- ✅ VRP Solver integration (mocked)
- ✅ Solution visualization
- ✅ Preview functionality

**Missing:**
- ❌ Using `pd_pairs` instead of `wh_requests`
- ❌ Assignment creation from VRP solution
- ❌ Manual routing option (without VRP)
- ❌ Robot assignment mapping (which robot gets which route)
- ❌ Assignment dispatch to Fleet Gateway
- ❌ Real VRP API integration (currently mocked)

**Required Changes:**
1. Replace `pd_pairs` with `wh_requests` table
2. After VRP solve, create `wh_assignments` records
3. Convert assignments to `wh_tasks` (or let Fleet Gateway do this)
4. Add robot selection UI (map routes to specific robots)
5. Add "Manual Routing" mode (create assignments without VRP)
6. Replace `mockSolveVRP` with real API call to VRP Solver
7. Add "Solve & Dispatch" option (automatically send to Fleet Controller)

---

### Tab 3: Fleet Controller ❌ (NOT IMPLEMENTED)

**Current State:**
- ❌ File is a duplicate of GraphEditor (needs complete rewrite)

**Required Implementation:**
1. **MQTT Connection**:
   - Connect to MQTT broker (central server)
   - Subscribe to robot status topics
   - Publish commands to robots

2. **Robot Visualization**:
   - Display robot positions on map
   - Show robot status (idle, on_duty, offline)
   - Show current task progress
   - Real-time position updates via MQTT

3. **Control Functions**:
   - Pause button (pause current task)
   - Stop button (stop and return to depot)
   - Resume button
   - Emergency stop

4. **Robot Status Panel**:
   - List all robots
   - Show current assignment
   - Show battery level (if available)
   - Show current location

5. **Task Monitoring**:
   - Display active tasks from `wh_tasks`
   - Show task status updates
   - Filter by robot

**Required Files:**
- Create new `FleetController.tsx` (replace current duplicate)
- Create `hooks/useMQTT.ts` for MQTT connection
- Create `hooks/useRobots.ts` for robot data management
- Create `hooks/useAssignments.ts` for assignment monitoring

---

## 🤖 Program 2: Robot Interface

### Tab 1: Mobile Base ⚠️ (UI Complete, Backend Missing)

**Current State:**
- ✅ Open-loop mode UI (DirectionPad, ParameterInput)
- ✅ Distance and speed inputs
- ✅ Execute button

**Missing:**
- ❌ ROS Action client integration (`OpenLoopMove.action`)
- ❌ Closed-loop mode (QRNavigate.action)
- ❌ QR Code status subscription
- ❌ Graph representation for sequence building
- ❌ Waypoint sequence creation UI
- ❌ Real-time status display (speed, position, QR code)

**Required Changes:**
1. **Open-loop Mode**:
   - Connect to ROS Action server
   - Send `OpenLoopMove.action` with distance/speed
   - Display feedback (moved_distance, duration, progress)

2. **Closed-loop Mode**:
   - Load graph representation from database
   - Build waypoint sequence UI
   - Send `QRNavigate.action` with waypoint array
   - Display feedback (index, target_waypoint, progress)

3. **Status Subscription**:
   - Subscribe to QR Code topic
   - Display: ID, x, y, angle
   - Display current speed
   - Display other status information

**Required Files:**
- Create `lib/rosClient.ts` for ROS connection
- Create `hooks/useROSActions.ts` for action calls
- Create `hooks/useROSSubscriptions.ts` for status updates
- Update `MobileBaseTab.tsx` with real functionality

---

### Tab 2: Piggyback ❌ (NOT IMPLEMENTED)

**Current State:**
- ❌ Just a placeholder component

**Required Implementation:**
1. **Independent Axis Control**:
   - Lift control (std_msgs/Float64) - height input
   - Turntable control (std_msgs/Float64) - angle input
   - Insert control (std_msgs/Float64) - distance input
   - Hook control (Bool) - toggle button

2. **Sequence Control**:
   - `TransportTote.action` integration
   - Parameters:
     - `robot_level` (int8) - which level on robot (0 = lowest)
     - `lift_height` (float64)
     - `turntable_angle` (float64)
     - `is_retrieving` (bool) - true: shelf→robot, false: robot→shelf
     - `expected_id` (string) - optional validation
   - Display feedback:
     - `state` (enum): PICKING_FROM_SHELF, PLACING_ON_SHELF, PICKING_FROM_ROBOT, PLACING_ON_ROBOT
     - `moving_component` (enum): LIFT, TURNTABLE, INSERT, HOOK
     - `progress` (float64)

3. **UI Components**:
   - Individual axis control sliders/inputs
   - Sequence builder (drag-and-drop or form-based)
   - Preview of sequence
   - Execute button with progress display

**Required Files:**
- Complete rewrite of `PiggybackTab.tsx`
- Create `components/Piggyback/IndependentControl.tsx`
- Create `components/Piggyback/SequenceBuilder.tsx`
- Add ROS service clients for individual controls
- Add ROS action client for TransportTote

---

## 🔌 Backend Integration

### VRP Solver ⚠️ (Mocked)

**Current State:**
- ✅ Mock solver in `solverUtils.ts`
- ✅ Distance matrix generation
- ✅ Task formatting

**Missing:**
- ❌ Real API integration
- ❌ Error handling for API failures
- ❌ Connection to actual VRP Broker (C++ service)

**Required:**
1. Uncomment and fix `solveVRP` function in `solverUtils.ts`
2. Configure VRP Broker endpoint (currently `http://127.0.0.1:7779/solve`)
3. Add proper error handling
4. Add timeout handling
5. Add retry logic for network failures

---

### Fleet Gateway ❌ (NOT IMPLEMENTED)

**Current State:**
- ❌ No Fleet Gateway implementation
- ❌ No backend service

**Required:**
1. **Backend Service** (separate from frontend):
   - Stateful service (maintains connection state)
   - Monitors `wh_assignments` table
   - Monitors `wh_robots` table
   - Converts assignments to tasks
   - Sends tasks to robots via MQTT/ROS
   - Updates task status based on robot feedback

2. **Integration Points**:
   - Frontend should be able to trigger assignment creation
   - Fleet Gateway should automatically pick up new assignments
   - Status updates should flow back to database

**Note:** This is a backend service, not a frontend component. It should be implemented as a separate Node.js/Python service.

---

## 📊 Missing Features Summary

### High Priority (Core Functionality)

1. **Fleet Controller Tab** - Complete rewrite needed
   - MQTT integration
   - Robot visualization
   - Control buttons (Pause/Stop)

2. **Database Schema Migration**
   - Replace `pd_pairs` with `wh_requests`
   - Implement `wh_assignments` table usage
   - Implement `wh_tasks` table usage
   - Implement `wh_robots` table usage

3. **Assignment System**
   - Create assignments from VRP solutions
   - Map routes to robots
   - Dispatch assignments to Fleet Gateway

4. **Robot Interface - Mobile Base**
   - ROS Action integration
   - Closed-loop mode
   - Status subscriptions

5. **Robot Interface - Piggyback**
   - Complete implementation
   - Independent controls
   - Sequence control

### Medium Priority (Enhanced Features)

1. **Graph Editor Enhancements**
   - Node type selection
   - Cell management
   - Level management

2. **Optimization Enhancements**
   - Manual routing mode
   - Robot selection UI
   - Real VRP API integration

3. **Status Monitoring**
   - Real-time task updates
   - Robot health monitoring
   - Battery level display

### Low Priority (Nice to Have)

1. **UI/UX Improvements**
   - Better error messages
   - Loading states
   - Confirmation dialogs

2. **Performance Optimizations**
   - Optimize distance matrix calculation
   - Implement caching
   - Reduce re-renders

---

## 🔧 Implementation Order Recommendation

1. **Phase 1: Database & Core Data Flow**
   - Migrate from `pd_pairs` to `wh_requests`
   - Implement assignment creation from VRP solutions
   - Add robot management tables

2. **Phase 2: Fleet Controller**
   - Implement MQTT connection
   - Add robot visualization
   - Add control buttons

3. **Phase 3: Robot Interface**
   - Complete Mobile Base tab
   - Complete Piggyback tab

4. **Phase 4: Backend Services**
   - Implement Fleet Gateway
   - Connect real VRP Solver

5. **Phase 5: Polish & Testing**
   - Error handling
   - UI improvements
   - Integration testing

---

## 📝 Notes

- The current `FleetController.tsx` is a duplicate of `GraphEditor.tsx` and needs complete replacement
- MQTT package is installed but not used anywhere
- ROS integration is not implemented (would need `roslibjs` or similar)
- Backend services (Fleet Gateway, VRP Solver) are separate from frontend and may need separate implementation
