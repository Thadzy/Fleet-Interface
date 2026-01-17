import React, { useState, useMemo } from 'react';
import { 
  Play, Trash2, Plus, ArrowRight, Package, RefreshCcw, 
  Cpu, Map as MapIcon, Send, CheckSquare, Square 
} from 'lucide-react';
import { useTasks } from '../hooks/useTasks';
import { supabase } from '../lib/supabaseClient';
import { 
  generateDistanceMatrix, 
  formatTasksForSolver, 
  mockSolveVRP 
} from '../utils/solverUtils';
import { DBNode, DBEdge } from '../types/database';
import RouteVisualizer from './RouteVisualizer';

const Optimization: React.FC = () => {
  const { tasks, locations, addTask, deleteTask, loading, refresh } = useTasks();
  
  // Form State
  const [pickupId, setPickupId] = useState<string>("");
  const [deliveryId, setDeliveryId] = useState<string>("");

  // 1. NEW: Solver Settings
  const [vehicleCount, setVehicleCount] = useState<number>(2);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());

  // Visualizer State
  const [showVisualizer, setShowVisualizer] = useState(false);
  const [mapData, setMapData] = useState<{nodes: DBNode[], edges: DBEdge[]} | null>(null);

  // Solver State
  const [isSolving, setIsSolving] = useState(false);
  const [solution, setSolution] = useState<any>(null);

  // Helper: Toggle Checkbox
  const toggleTask = (id: number) => {
    const newSet = new Set(selectedTaskIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedTaskIds(newSet);
  };

  const toggleAll = () => {
    if (selectedTaskIds.size === tasks.length) setSelectedTaskIds(new Set());
    else setSelectedTaskIds(new Set(tasks.map(t => t.id)));
  };

  const handleAdd = async () => {
    if (!pickupId || !deliveryId) return alert("Select locations");
    if (pickupId === deliveryId) return alert("Locations must be different");
    const success = await addTask(parseInt(pickupId), parseInt(deliveryId));
    if (success) { setPickupId(""); setDeliveryId(""); }
  };

  const handleSolve = async () => {
    if (selectedTaskIds.size === 0) return alert("Please select at least one task to solve.");
    
    setIsSolving(true);
    setSolution(null);

    try {
      // 1. Fetch Graph
      const { data: graphData } = await supabase.from('wh_graphs').select('id').eq('name', 'warehouse_A').single();
      const graphId = graphData?.id || 1;
      const { data: nodeData } = await supabase.from('wh_nodes').select('*').eq('graph_id', graphId);
      const { data: edgeData } = await supabase.from('wh_edges').select('*').eq('graph_id', graphId);

      if (!nodeData || !edgeData) return alert("Error loading map");

      setMapData({ nodes: nodeData as DBNode[], edges: edgeData as DBEdge[] });

      // 2. Prepare Payload (Only selected tasks)
      const activeTasks = tasks.filter(t => selectedTaskIds.has(t.id));
      const matrix = generateDistanceMatrix(nodeData as DBNode[], edgeData as DBEdge[]);
      const solverTasks = formatTasksForSolver(activeTasks, nodeData as DBNode[]);
      
      // 3. Solve (Mock)
      // Pass vehicleCount to the solver here in a real scenario
      console.log(`Solving for ${vehicleCount} vehicles...`);
      const result = await mockSolveVRP(matrix, solverTasks);

      setSolution(result);
      
    } catch (err) {
      console.error(err);
      alert("Solver failed");
    } finally {
      setIsSolving(false);
    }
  };

  // 2. NEW: Dispatch to Fleet
  const handleDispatch = async () => {
    if (!solution || selectedTaskIds.size === 0) return;
    
    const confirm = window.confirm(`Dispatch ${vehicleCount} robots for these ${selectedTaskIds.size} tasks?`);
    if (!confirm) return;

    // Update Database: Set status to 'transporting'
    const { error } = await supabase
      .from('pd_pairs')
      .update({ status: 'transporting' })
      .in('id', Array.from(selectedTaskIds));

    if (error) alert("Error updating database");
    else {
      alert("Orders dispatched to Fleet Controller!");
      setSolution(null);
      setSelectedTaskIds(new Set());
      refresh(); // Reload table
    }
  };

  return (
    <div className="flex h-full bg-slate-100 p-4 gap-4">
      {/* LEFT: Task List */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Package size={16} className="text-purple-600" /> Task Queue
            </h2>
            <p className="text-[10px] text-slate-500 font-mono">SELECTED: {selectedTaskIds.size}</p>
          </div>
          <button onClick={refresh} className="p-2 text-slate-400 hover:text-blue-600 rounded-lg">
            <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 text-[10px] font-bold text-slate-500 border-b">
          <div className="col-span-1 flex items-center">
            <button onClick={toggleAll}>
               {selectedTaskIds.size > 0 && selectedTaskIds.size === tasks.length ? <CheckSquare size={14}/> : <Square size={14}/>}
            </button>
          </div>
          <div className="col-span-1">ID</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-3">Pickup</div>
          <div className="col-span-1 text-center">Dir</div>
          <div className="col-span-3">Delivery</div>
          <div className="col-span-1 text-right">Act</div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto">
          {tasks.map((task) => (
            <div key={task.id} className={`grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-50 text-xs items-center ${selectedTaskIds.has(task.id) ? 'bg-blue-50/50' : ''}`}>
              <div className="col-span-1">
                <button onClick={() => toggleTask(task.id)} className="text-slate-400 hover:text-blue-600">
                  {selectedTaskIds.has(task.id) ? <CheckSquare size={14} className="text-blue-600"/> : <Square size={14}/>}
                </button>
              </div>
              <div className="col-span-1 font-mono text-slate-400">#{task.id}</div>
              <div className="col-span-2">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${task.status === 'queuing' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100'}`}>
                  {task.status}
                </span>
              </div>
              <div className="col-span-3 font-medium">{task.pickup_name}</div>
              <div className="col-span-1 text-center text-slate-300"><ArrowRight size={12} /></div>
              <div className="col-span-3 font-medium">{task.delivery_name}</div>
              <div className="col-span-1 text-right">
                <button onClick={() => deleteTask(task.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Actions */}
      <div className="w-80 flex flex-col gap-4">
        {/* New Task */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
           <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2"><Plus size={16} className="text-blue-500"/> New Task</h3>
           <div className="space-y-3">
             <select className="w-full text-xs p-2 border rounded bg-slate-50" value={pickupId} onChange={e=>setPickupId(e.target.value)}>
               <option value="">Pickup From...</option>
               {locations.map(l => <option key={l.cell_id} value={l.cell_id}>{l.node_name} (L{l.level})</option>)}
             </select>
             <select className="w-full text-xs p-2 border rounded bg-slate-50" value={deliveryId} onChange={e=>setDeliveryId(e.target.value)}>
               <option value="">Deliver To...</option>
               {locations.map(l => <option key={l.cell_id} value={l.cell_id}>{l.node_name} (L{l.level})</option>)}
             </select>
             <button onClick={handleAdd} className="w-full py-2 bg-slate-800 text-white text-xs font-bold rounded hover:bg-slate-700">ADD TO QUEUE</button>
           </div>
        </div>

        {/* Solver */}
        <div className="bg-gradient-to-br from-blue-600 to-purple-700 p-5 rounded-xl shadow-md text-white">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold flex items-center gap-2"><Cpu size={18}/> VRP Solver</h3>
            <div className="flex items-center gap-2 bg-white/10 px-2 py-1 rounded">
               <span className="text-[10px]">ROBOTS:</span>
               <input type="number" min="1" max="10" value={vehicleCount} onChange={(e) => setVehicleCount(parseInt(e.target.value))} className="w-8 bg-transparent text-center font-bold text-xs outline-none border-b border-white/50" />
            </div>
          </div>
          <button onClick={handleSolve} disabled={isSolving || selectedTaskIds.size === 0} className="w-full py-2 bg-white text-blue-700 text-xs font-bold rounded hover:bg-blue-50 flex justify-center gap-2">
            {isSolving ? "Solving..." : <><Play size={14} fill="currentColor"/> SOLVE SELECTED ({selectedTaskIds.size})</>}
          </button>
        </div>

        {/* Results & Dispatch */}
        {solution && (
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 animate-in slide-in-from-bottom-2">
            <div className="flex justify-between items-center mb-3 border-b pb-2">
               <h3 className="text-sm font-bold text-slate-800">Optimization Result</h3>
               <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">FEASIBLE</span>
            </div>
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-xs"><span className="text-slate-500">Distance:</span> <span className="font-mono">{solution.total_distance} cm</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-500">Time:</span> <span className="font-mono">{solution.wall_time_ms} ms</span></div>
            </div>
            <div className="flex gap-2">
               <button onClick={() => setShowVisualizer(true)} className="flex-1 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-[10px] font-bold rounded flex justify-center gap-1"><MapIcon size={12}/> PREVIEW</button>
               <button onClick={handleDispatch} className="flex-1 py-1.5 bg-green-600 text-white hover:bg-green-700 text-[10px] font-bold rounded flex justify-center gap-1"><Send size={12}/> DISPATCH</button>
            </div>
          </div>
        )}
      </div>

      <RouteVisualizer isOpen={showVisualizer} onClose={() => setShowVisualizer(false)} solution={solution} dbNodes={mapData?.nodes || []} dbEdges={mapData?.edges || []} />
    </div>
  );
};

export default Optimization;