import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface Task {
  id: number;
  pickup_name: string;
  delivery_name: string;
  status: string;
  priority: number;
  queued_at: string; // <-- CHANGED from created_at
}

export interface AvailableLocation {
  cell_id: number;
  node_name: string;
  level: number | null;
}

export const useTasks = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [locations, setLocations] = useState<AvailableLocation[]>([]);
  const [loading, setLoading] = useState(false);

  // 1. FETCH TASKS
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      // FIX: Changed 'created_at' to 'queued_at' to match your DB Schema
      const { data, error } = await supabase
        .from('pd_pairs')
        .select(`
          id,
          status,
          priority,
          queued_at, 
          pickup:pickup_cell_id (
            node:node_id (name)
          ),
          delivery:delivery_cell_id (
            node:node_id (name)
          )
        `)
        .order('queued_at', { ascending: false }); // Sort by queued_at

      if (error) throw error;

      const formattedTasks: Task[] = data.map((t: any) => ({
        id: t.id,
        pickup_name: t.pickup?.node?.name || 'Unknown',
        delivery_name: t.delivery?.node?.name || 'Unknown',
        status: t.status,
        priority: t.priority,
        queued_at: t.queued_at, // Map correctly
      }));

      setTasks(formattedTasks);
    } catch (err) {
      console.error('Error fetching tasks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. FETCH LOCATIONS
  const fetchLocations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('wh_cells')
        .select(`
          id,
          level:level_id (level),
          node:node_id (name)
        `);

      if (error) throw error;

      const validLocs = data.map((d: any) => ({
        cell_id: d.id,
        node_name: d.node?.name,
        level: d.level?.level || 1,
      }));
      setLocations(validLocs);
    } catch (err) {
      console.error('Error fetching locations:', err);
    }
  }, []);

  // 3. ADD TASK
  const addTask = async (pickupCellId: number, deliveryCellId: number) => {
    // Note: We don't need to send 'queued_at' because the DB sets it automatically (DEFAULT now())
    const { error } = await supabase.from('pd_pairs').insert({
      pickup_cell_id: pickupCellId,
      delivery_cell_id: deliveryCellId,
      status: 'queuing',
      priority: 1,
    });
    
    if (error) {
      alert(`Error: ${error.message}`);
      return false;
    }
    await fetchTasks();
    return true;
  };

  // 4. DELETE TASK
  const deleteTask = async (id: number) => {
    const { error } = await supabase.from('pd_pairs').delete().eq('id', id);
    if (error) alert(error.message);
    else await fetchTasks();
  };

  useEffect(() => {
    fetchTasks();
    fetchLocations();
  }, [fetchTasks, fetchLocations]);

  return { tasks, locations, addTask, deleteTask, loading, refresh: fetchTasks };
};