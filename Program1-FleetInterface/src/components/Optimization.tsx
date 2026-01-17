import React, { useState } from 'react';
import {
    Play,
    Trash2,
    Plus,
    ArrowRight,
    Package,
    RefreshCcw,
    Cpu,
    Map as MapIcon
} from 'lucide-react';
import { useTasks } from '../hooks/useTasks';
import { supabase } from '../lib/supabaseClient';
import {
    generateDistanceMatrix,
    formatTasksForSolver,
    mockSolveVRP
    // solveVRP // <--- UNCOMMENT THIS WHEN READY FOR REAL API
} from '../utils/solverUtils';
import { type DBNode, type DBEdge } from '../types/database';
import RouteVisualizer from './RouteVisualizer';

const Optimization: React.FC = () => {
    const { tasks, locations, addTask, deleteTask, loading, refresh } = useTasks();

    // Form State
    const [pickupId, setPickupId] = useState<string>("");
    const [deliveryId, setDeliveryId] = useState<string>("");

    // 2. NEW STATE FOR VISUALIZATION
    const [showVisualizer, setShowVisualizer] = useState(false);
    const [mapData, setMapData] = useState<{ nodes: DBNode[], edges: DBEdge[] } | null>(null);

    // Solver State
    const [isSolving, setIsSolving] = useState(false);
    const [solution, setSolution] = useState<any>(null);

    const handleAdd = async () => {
        if (!pickupId || !deliveryId) return alert("Please select both locations");
        if (pickupId === deliveryId) return alert("Pickup and Delivery cannot be the same");

        const success = await addTask(parseInt(pickupId), parseInt(deliveryId));
        if (success) {
            setPickupId("");
            setDeliveryId("");
        }
    };
    


    const handleSolve = async () => {
        setIsSolving(true);
        setSolution(null);

        try {
            // 1. Fetch Graph Data
            const { data: graphData } = await supabase.from('wh_graphs').select('id').eq('name', 'warehouse_A').single();
            const graphId = graphData?.id || 1;
            
            const { data: nodeData } = await supabase.from('wh_nodes').select('*').eq('graph_id', graphId);
            const { data: edgeData } = await supabase.from('wh_edges').select('*').eq('graph_id', graphId);

            if (!nodeData || !edgeData) {
                alert("Error loading map data");
                return;
            }

            // SAVE DATA FOR VISUALIZER
            setMapData({ nodes: nodeData as DBNode[], edges: edgeData as DBEdge[] });

            // 2. Run Solver
            const matrix = generateDistanceMatrix(nodeData as DBNode[], edgeData as DBEdge[]);
            const solverTasks = formatTasksForSolver(tasks, nodeData as DBNode[]);
            
            // Call Mock Solver (or Real API)
            const result = await mockSolveVRP(matrix, solverTasks);

            setSolution(result);

        } catch (err) { 
            console.error("Solver Error:", err);
            alert("Optimization failed. Check console.");
        } finally {
            // --- FIX: ALWAYS STOP LOADING ---
            setIsSolving(false);
        }
    };

        return (
            <div className="flex h-full bg-slate-100 p-4 gap-4">

                {/* --- LEFT PANEL: TASK LIST --- */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">

                    {/* Header */}
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div>
                            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <Package size={16} className="text-purple-600" />
                                Pickup & Delivery Queue
                            </h2>
                            <p className="text-[10px] text-slate-500 font-mono">
                                TOTAL TASKS: {tasks.length}
                            </p>
                        </div>
                        <button
                            onClick={refresh}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                        >
                            <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>

                    {/* Table Header */}
                    <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                        <div className="col-span-1">ID</div>
                        <div className="col-span-2">Status</div>
                        <div className="col-span-3">Pickup From</div>
                        <div className="col-span-1 text-center">Dir</div>
                        <div className="col-span-3">Deliver To</div>
                        <div className="col-span-1 text-center">Pri</div>
                        <div className="col-span-1 text-right">Action</div>
                    </div>

                    {/* Table Body */}
                    <div className="flex-1 overflow-y-auto">
                        {tasks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                                <Package size={32} className="mb-2 opacity-20" />
                                <span className="text-xs">No tasks in queue</span>
                            </div>
                        ) : (
                            tasks.map((task) => (
                                <div
                                    key={task.id}
                                    className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors items-center text-xs text-slate-700"
                                >
                                    <div className="col-span-1 font-mono text-slate-400">#{task.id}</div>

                                    <div className="col-span-2">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase
                    ${task.status === 'queuing' ? 'bg-yellow-100 text-yellow-700' : ''}
                    ${task.status === 'completed' ? 'bg-green-100 text-green-700' : ''}
                  `}>
                                            {task.status}
                                        </span>
                                    </div>

                                    <div className="col-span-3 font-medium">{task.pickup_name}</div>
                                    <div className="col-span-1 flex justify-center text-slate-300"><ArrowRight size={12} /></div>
                                    <div className="col-span-3 font-medium">{task.delivery_name}</div>
                                    <div className="col-span-1 text-center font-mono text-slate-500">{task.priority}</div>

                                    <div className="col-span-1 flex justify-end">
                                        <button
                                            onClick={() => deleteTask(task.id)}
                                            className="text-slate-300 hover:text-red-500 p-1 hover:bg-red-50 rounded transition-all"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* --- RIGHT PANEL: ACTIONS --- */}
                <div className="w-80 flex flex-col gap-4">

                    {/* Create Task Card */}
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <Plus size={16} className="text-blue-500" />
                            New Task
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Pickup Location</label>
                                <select
                                    className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-blue-500"
                                    value={pickupId}
                                    onChange={(e) => setPickupId(e.target.value)}
                                >
                                    <option value="">Select Shelf...</option>
                                    {locations.map(loc => (
                                        <option key={loc.cell_id} value={loc.cell_id}>
                                            {loc.node_name} (Level {loc.level})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Delivery Location</label>
                                <select
                                    className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-blue-500"
                                    value={deliveryId}
                                    onChange={(e) => setDeliveryId(e.target.value)}
                                >
                                    <option value="">Select Shelf...</option>
                                    {locations.map(loc => (
                                        <option key={loc.cell_id} value={loc.cell_id}>
                                            {loc.node_name} (Level {loc.level})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button
                                onClick={handleAdd}
                                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition-all active:translate-y-0.5"
                            >
                                ADD TO QUEUE
                            </button>
                        </div>
                    </div>

                    {/* Solver Card */}
                    <div className="bg-gradient-to-br from-blue-600 to-purple-700 p-5 rounded-xl shadow-md text-white">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                <Cpu size={20} />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold">VRPPD Solver</h3>
                                <p className="text-[10px] opacity-80 font-mono">OPTIMIZER: ONLINE</p>
                            </div>
                        </div>

                        <p className="text-xs opacity-80 mb-6 leading-relaxed">
                            Ready to compute optimal routes using the active map.
                        </p>

                        <button
                            onClick={handleSolve}
                            disabled={isSolving}
                            className={`w-full py-2 bg-white text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-50 transition-all flex items-center justify-center gap-2 shadow-sm ${isSolving ? 'opacity-75 cursor-wait' : ''}`}
                        >
                            {isSolving ? (
                                <>Processing...</>
                            ) : (
                                <>
                                    <Play size={14} fill="currentColor" />
                                    SOLVE & PREVIEW
                                </>
                            )}
                        </button>
                    </div>

                    {/* --- RESULTS DISPLAY --- */}
                    {solution && (
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <h3 className="text-sm font-bold text-slate-800 mb-2 border-b border-slate-100 pb-2 flex justify-between items-center">
                                <span>Optimization Results</span>
                                <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full uppercase">
                                    {solution.feasible ? "Feasible" : "Impossible"}
                                </span>
                            </h3>

                            <div className="space-y-3">
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">Total Distance:</span>
                                    <span className="font-mono text-slate-700 font-bold">{solution.total_distance} cm</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">Comp. Time:</span>
                                    <span className="font-mono text-slate-700">{solution.wall_time_ms} ms</span>
                                </div>

                                <div className="bg-slate-50 p-2 rounded text-[10px] font-mono text-slate-600 border border-slate-100">
                                    <p className="font-bold text-blue-600 mb-1 flex items-center gap-1">
                                        <MapIcon size={10} />
                                        VEHICLE 1 PATH:
                                    </p>
                                    <div className="break-words leading-tight">
                                        {solution.routes[0].nodes.join(" → ")}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowVisualizer(true)}
                                className="w-full mt-3 py-1.5 border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                            >
                                <MapIcon size={12} />
                                VISUALIZE ROUTE ON MAP
                            </button>
                        </div>
                    )}

                </div>
                {/* RENDER THE MODAL AT THE END */}
                <RouteVisualizer
                    isOpen={showVisualizer}
                    onClose={() => setShowVisualizer(false)}
                    solution={solution}
                    dbNodes={mapData?.nodes || []}
                    dbEdges={mapData?.edges || []}
                />
            </div>
        );
    };

export default Optimization;