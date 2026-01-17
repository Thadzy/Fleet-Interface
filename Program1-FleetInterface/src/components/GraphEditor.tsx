import React, { useCallback, useMemo, useEffect, useState } from "react"; // Consolidated imports
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    addEdge,
    type Connection,
    type Node,
    Panel,
    MarkerType,
    BackgroundVariant,
    Handle,
    Position,
    type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import {
    Save,
    PlusCircle,
    LayoutGrid,
    MousePointer2,
    Trash2,
    Settings,
    Upload,
    RefreshCw,
} from "lucide-react";

import { useGraphData } from "../hooks/useGraphData";
import { supabase } from "../lib/supabaseClient";

// --- HELPER COMPONENTS ---

const CreateHandleInternal = ({
    pos,
    id,
    className,
    isConnectable,
}: {
    pos: Position;
    id: string;
    className: string;
    isConnectable: boolean;
}) => (
    <>
        <Handle
            type="source"
            position={pos}
            id={`${id}-source`}
            isConnectable={isConnectable}
            className={className}
        />
        <Handle
            type="target"
            position={pos}
            id={`${id}-target`}
            isConnectable={isConnectable}
            className={className}
            style={{ pointerEvents: "none" }}
        />
    </>
);

// --- CUSTOM NODE DEFINITION ---

const WaypointNode = ({ data, isConnectable }: NodeProps) => {
    const handleStyle =
        "w-3 h-3 !bg-white !border-2 !border-blue-500 !rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-50";

    return (
        <div className="group relative flex flex-col items-center justify-center">
            <div className="absolute -top-7 whitespace-nowrap bg-slate-900/90 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm backdrop-blur-sm pointer-events-none">
                {data.label}
            </div>
            <div className="w-5 h-5 bg-red-600 rounded-full border-[3px] border-white shadow-lg cursor-move z-20" />
            
            <CreateHandleInternal pos={Position.Top} id="top" className={`${handleStyle} -top-1.5`} isConnectable={isConnectable} />
            <CreateHandleInternal pos={Position.Bottom} id="bottom" className={`${handleStyle} -bottom-1.5`} isConnectable={isConnectable} />
            <CreateHandleInternal pos={Position.Right} id="right" className={`${handleStyle} -right-1.5`} isConnectable={isConnectable} />
            <CreateHandleInternal pos={Position.Left} id="left" className={`${handleStyle} -left-1.5`} isConnectable={isConnectable} />
        </div>
    );
};

// --- MAIN COMPONENT ---

const GraphEditor: React.FC = () => {
    const nodeTypes = useMemo(() => ({ waypointNode: WaypointNode }), []);
    const [nodes, setNodes, onNodesChange] = useNodesState([]); 
    const [edges, setEdges, onEdgesChange] = useEdgesState([]); 

    // 1. STATE FOR MAP SELECTION
    const [mapList, setMapList] = useState<string[]>([]);
    const [currentMap, setCurrentMap] = useState<string>("warehouse_A");

    // 2. FETCH LIST OF AVAILABLE MAPS
    useEffect(() => {
        const fetchMaps = async () => {
            const { data } = await supabase.from('wh_graphs').select('name');
            if (data) {
                setMapList(data.map(d => d.name));
            }
        };
        fetchMaps();
    }, []);

    // 3. USE THE DYNAMIC MAP NAME IN THE HOOK
    const { loadGraph, saveGraph, loading } = useGraphData(currentMap);

    // 4. LOAD DATA (Fixed: Now correctly handles empty maps)
    useEffect(() => {
        const fetchData = async () => {
            const { nodes: dbNodes, edges: dbEdges } = await loadGraph();
            // Always set nodes, even if empty, to clear the screen when switching maps
            setNodes(dbNodes);
            setEdges(dbEdges);
        };
        fetchData();
    }, [loadGraph, setNodes, setEdges]); // loadGraph changes when currentMap changes

    const onConnect = useCallback(
        (params: Connection) => {
            const newEdge = {
                ...params,
                type: "straight",
                animated: true,
                style: { stroke: "#3b82f6", strokeWidth: 2, strokeDasharray: "5,5" },
                markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" },
            };
            setEdges((eds) => addEdge(newEdge, eds));
        },
        [setEdges]
    );

    // FIXED: Better ID generation to avoid collisions
    const addNode = () => {
        // Use a timestamp or random string for temporary UI IDs
        const id = `temp_${Date.now()}`; 
        const newNode: Node = {
            id,
            type: "waypointNode",
            position: {
                x: 400 + Math.random() * 100,
                y: 300 + Math.random() * 100,
            },
            data: { label: `NEW` }, // Simplified label
        };
        setNodes((nds) => nds.concat(newNode));
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const imageSrc = e.target?.result as string;
                const mapNode: Node = {
                    id: "map-background",
                    type: "group",
                    position: { x: 0, y: 0 },
                    data: { label: null },
                    style: {
                        backgroundImage: `url(${imageSrc})`,
                        backgroundSize: "cover",
                        width: 2000, 
                        height: 1500,
                        zIndex: -10,
                        pointerEvents: "none",
                    },
                    draggable: false,
                    selectable: false,
                };
                setNodes((nds) => [
                    mapNode,
                    ...nds.filter((n) => n.id !== "map-background"),
                ]);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="w-full h-full bg-slate-50 relative font-sans">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                fitView
                minZoom={0.1}
                maxZoom={4}
                defaultEdgeOptions={{ type: "straight" }}
            >
                <Background color="#cbd5e1" gap={20} size={1} variant={BackgroundVariant.Dots} />

                {/* --- HEADER --- */}
                <Panel position="top-left" className="m-4">
                    <div className="bg-white/90 backdrop-blur border border-slate-200 shadow-sm px-4 py-3 rounded-xl flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                            <LayoutGrid size={20} />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-slate-800 leading-tight">
                                Map Designer
                            </h2>

                            <select
                                value={currentMap}
                                onChange={(e) => setCurrentMap(e.target.value)}
                                className="text-[10px] text-slate-500 font-mono bg-transparent border-none outline-none cursor-pointer hover:text-blue-600"
                            >
                                {mapList.map(name => (
                                    <option key={name} value={name}>
                                        EDITING: {name.toUpperCase()}
                                    </option>
                                ))}
                            </select>
                            
                            <div className="h-6 w-px bg-slate-200 mx-1"></div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                                <span className={`w-2 h-2 rounded-full ${loading ? "bg-yellow-500 animate-ping" : "bg-green-500"}`}></span>
                                {loading ? "SYNCING..." : "ONLINE"}
                            </div>
                        </div>
                    </div>
                </Panel>

                {/* --- TOOLBAR --- */}
                <Panel position="top-right" className="m-4">
                    <div className="bg-white/90 backdrop-blur border border-slate-200 shadow-lg rounded-xl p-1.5 flex gap-1">
                        <div className="flex gap-1 pr-2 border-r border-slate-200 items-center">
                            <label className="cursor-pointer p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all group relative">
                                <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                                <Upload size={18} />
                            </label>

                            <button className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                                <MousePointer2 size={18} />
                            </button>

                            <button onClick={addNode} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                                <PlusCircle size={18} />
                            </button>

                            <button onClick={() => { setNodes([]); setEdges([]); }} className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                                <Trash2 size={18} />
                            </button>
                        </div>

                        <div className="flex gap-1 pl-1">
                            <button
                                onClick={async () => {
                                    const { nodes: dbNodes, edges: dbEdges } = await loadGraph();
                                    setNodes(dbNodes);
                                    setEdges(dbEdges);
                                }}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                            >
                                <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                            </button>

                            {/* --- FIXED: ADDED ONCLICK HANDLER --- */}
                            <button 
                                onClick={async () => {
                                    const success = await saveGraph(nodes, edges);
                                    if (success) {
                                        // Reload to get the real DB IDs replacing temp IDs
                                        const { nodes: dbNodes, edges: dbEdges } = await loadGraph();
                                        setNodes(dbNodes);
                                        setEdges(dbEdges);
                                    }
                                }}
                                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 shadow-md transition-all active:translate-y-0.5"
                            >
                                <Save size={14} />
                                <span>SAVE MAP</span>
                            </button>
                        </div>
                    </div>
                </Panel>

                {/* --- STATUS BAR --- */}
                <Panel position="bottom-center" className="mb-2">
                    <div className="bg-slate-800/90 backdrop-blur text-slate-300 text-[10px] font-mono px-4 py-1.5 rounded-full flex gap-4 shadow-lg border border-slate-700">
                        <span>NODES: {nodes.filter((n) => n.id !== "map-background").length}</span>
                        <span className="text-slate-600">|</span>
                        <span>EDGES: {edges.length}</span>
                        <span className="text-slate-600">|</span>
                        <span>ZOOM: 100%</span>
                    </div>
                </Panel>

                <Controls />
                <MiniMap className="!bg-slate-100 border border-slate-300 rounded-lg" nodeColor={(n) => (n.type === "waypointNode" ? "#ef4444" : "#e2e8f0")} />
            </ReactFlow>
        </div>
    );
};

export default GraphEditor;