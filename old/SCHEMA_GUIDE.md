# Database Schema Guide

## What is the Schema File?

The SQL schema file (`wh_schema_clean_fixed.sql`) is the **official database structure** for your warehouse management system. It defines:

1. **All database tables** (wh_graphs, wh_nodes, wh_edges, wh_requests, wh_assignments, etc.)
2. **Data types and constraints** (enums, foreign keys, unique constraints)
3. **Automatic behaviors** (triggers that auto-create depot nodes, sync robot slots)
4. **Helper functions** (like `astar_cost_matrix_by_names` for distance calculations)

## Key Changes from Old Code

### ✅ Fixed Issues

1. **`pd_pairs` → `wh_requests`**
   - Old code used `pd_pairs` table
   - Schema uses `wh_requests` (matches specification)
   - ✅ **FIXED**: Code updated to use `wh_requests`

2. **Node Types**
   - Schema includes: `inbound`, `outbound`, `shelf`, `waypoint`, `depot`
   - Old code had `charger` instead of `depot`
   - ✅ **FIXED**: Types updated in `database.ts`

3. **Status Enums**
   - Proper enum types: `pd_request_status`, `assignment_status`, `task_status`, `robot_status`
   - ✅ **FIXED**: Types added to `database.ts`

4. **Missing Tables**
   - Schema includes: `wh_assignments`, `wh_tasks`, `wh_robots`, `wh_robot_slots`, `wh_levels`
   - ✅ **FIXED**: Types added to `database.ts`

## How to Use the Schema

### Step 1: Apply Schema to Database

Run the SQL file in your Supabase SQL Editor:

```sql
-- Copy and paste the entire wh_schema_clean_fixed.sql file
-- This will:
-- 1. Drop and recreate the schema (DESTRUCTIVE - backup first!)
-- 2. Create all tables, types, triggers, and functions
-- 3. Set up constraints and indexes
```

⚠️ **WARNING**: The schema uses `DROP SCHEMA public CASCADE` which will **delete all existing data**. Make sure to:
- Backup your database first
- Or use a development/test database

### Step 2: Insert Sample Data

The schema file includes sample SQL commands to create:

1. **Graph**: `warehouse_A`
2. **Nodes**: 15 waypoints, 6 shelves, 1 inbound, 1 outbound
3. **Edges**: Connections between nodes
4. **Levels**: 3 height levels (1.25m, 2.5m, 3.75m)
5. **Cells**: Cells for each shelf at each level

Run these commands after applying the schema:

```sql
-- Create graph
INSERT INTO public.wh_graphs (name, map_url, map_res)
VALUES ('warehouse_A', 'https://example.com/maps/warehouse_A.png', 0.05)
RETURNING *;

-- Insert nodes (see schema file for full SQL)
-- Insert edges (see schema file for full SQL)
-- Insert levels (see schema file for full SQL)
-- Insert cells (see schema file for full SQL)
```

### Step 3: Verify Schema

Check that tables exist:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'wh_%';
```

You should see:
- wh_graphs
- wh_nodes
- wh_edges
- wh_levels
- wh_cells
- wh_requests
- wh_robots
- wh_robot_slots
- wh_assignments
- wh_tasks

## Important Schema Features

### 1. Auto-Created Depot

Every graph **automatically gets a depot node** when created:
- Name: `__depot__` (reserved)
- Type: `depot`
- Position: (0, 0)
- **Cannot be deleted** (protected by trigger)

### 2. Robot Slot Management

When you create/update a robot's `capacity`, slots are **automatically created**:
- Slots numbered 0 to (capacity-1)
- Cannot shrink capacity if slots are occupied
- Auto-managed by triggers

### 3. Distance Matrix Function

The schema includes `astar_cost_matrix_by_names()` function:

```sql
SELECT *
FROM public.astar_cost_matrix_by_names(
  'warehouse_A',                    -- graph name
  ARRAY['s_1','s_5','s_6','i_1','o_1'],  -- node names
  false,                            -- directed (false = undirected)
  5                                 -- heuristic
);
```

This uses **pgRouting** (A* algorithm) to calculate shortest paths between nodes.

## Code Updates Made

### ✅ Completed

1. **`src/types/database.ts`**
   - Added `depot` to NodeType
   - Added all new table interfaces (DBRequest, DBAssignment, DBTask, DBRobot, etc.)
   - Added enum types (PDRequestStatus, AssignmentStatus, TaskStatus, RobotStatus)

2. **`src/hooks/useTasks.ts`**
   - Changed from `pd_pairs` to `wh_requests`
   - Updated field names (`queued_at` → `created_at`)
   - Updated status values

3. **`src/components/Optimization.tsx`**
   - Changed from `pd_pairs` to `wh_requests`
   - Updated status: `transporting` → `in_progress`

### 🔄 Still Needed

1. **Graph Editor**
   - Add UI for selecting node types (including `depot`)
   - Visual distinction for different node types

2. **Assignment System**
   - Create assignments from VRP solutions
   - Convert assignments to tasks
   - Map routes to robots

3. **Fleet Controller**
   - Connect to robots via MQTT
   - Display robot positions
   - Control buttons (Pause/Stop)

## Next Steps

1. **Apply the schema** to your Supabase database
2. **Insert sample data** using the provided SQL
3. **Test the updated code** with the new schema
4. **Implement assignment system** (create assignments from VRP solutions)
5. **Build Fleet Controller** (robot visualization and control)

## Troubleshooting

### Error: "Graph name not found"
- Make sure you've created the graph first
- Check that the graph name matches exactly (case-sensitive)

### Error: "Depot already exists"
- Each graph can only have one depot
- The depot is auto-created, you don't need to create it manually

### Error: "Cannot shrink robot capacity"
- A robot's capacity cannot be reduced if any slots are occupied
- First clear the slots (set request_id to NULL), then reduce capacity

### Error: "pgRouting function not found"
- Make sure pgRouting extension is installed in your database
- Run: `CREATE EXTENSION IF NOT EXISTS pgrouting;`

## Schema File Location

The schema file should be saved as:
- `warehouse/wh_schema_clean_fixed.sql` (or similar)

You can run it directly in Supabase SQL Editor or via psql.
