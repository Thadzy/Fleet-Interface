-- ============================================================================
-- FIX SCRIPT: Add missing columns to match Frontend requirements
-- ============================================================================

-- 1. Ensure wh_nodes has 'level' column (used by GraphEditor)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'wh_nodes' AND column_name = 'level'
  ) THEN
    ALTER TABLE public.wh_nodes ADD COLUMN level integer DEFAULT 0;
  END IF;
END $$;

-- 2. Ensure wh_cells exists (referenced by wh_requests)
-- If it was missing in the old schema, we must create it.
CREATE TABLE IF NOT EXISTS public.wh_cells (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  node_id bigint NOT NULL REFERENCES public.wh_nodes(id) ON DELETE CASCADE,
  level_id int, -- Optional reference to wh_levels
  height float, -- Or explicit height
  graph_id bigint REFERENCES public.wh_graphs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Ensure wh_levels exists (referenced by wh_cells)
CREATE TABLE IF NOT EXISTS public.wh_levels (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  graph_id bigint REFERENCES public.wh_graphs(id) ON DELETE CASCADE,
  level int NOT NULL,
  height float NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(graph_id, level)
);

-- 4. Sync wh_nodes.level -> wh_cells (Optional auto-sync)
-- This ensures that if we create a node with level X, a corresponding cell is created.
-- (Skipping for now to avoid complexity, but noted for future)
