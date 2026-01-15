/**
 * GraphEditor.tsx
 *
 * This component serves as the primary interface for the Fleet Management System's
 * "Map Designer" (Program 1). It allows operators to visualy construct robot paths
 * by overlaying nodes (waypoints) and edges (paths) onto a warehouse map.
 *
 * Key Features:
 * - Map Image Upload: Renders a user-uploaded floor plan as a locked background layer.
 * - Custom Nodes: "WaypointNode" component with bidirectional connection handles.
 * - Bezier Connections: Automated curved path generation between nodes.
 * - State Management: Uses ReactFlow hooks for managing node and edge state.
 */

import React, { useCallback, useMemo } from "react";
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
} from "lucide-react";

// --- HELPER COMPONENTS ---

/**
 * CreateHandleInternal
 *
 * A helper component that renders two ReactFlow handles (Source and Target)
 * at the exact same position.
 *
 * Architecture Note:
 * ReactFlow differentiates between "Source" (output) and "Target" (input).
 * To allow a user to connect "from anywhere to anywhere" without strictly defining
 * inputs/outputs, we stack both handle types.
 *
 * @param pos - The position on the node (Top, Bottom, Left, Right).
 * @param id - Unique identifier for the handle.
 * @param className - CSS classes for styling.
 * @param isConnectable - Boolean state from the parent node.
 */
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
        {/* Source Handle: Acts as the drag source for new connections */}
        <Handle
            type="source"
            position={pos}
            id={`${id}-source`}
            isConnectable={isConnectable}
            className={className}
        />
        {/* Target Handle: Acts as the drop target.
        style={{ pointerEvents: "none" }} is CRITICAL here. It allows mouse events
        to pass through the Target handle so the user can grab the Source handle
        underneath it to start a connection. */}
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

/**
 * WaypointNode
 *
 * Custom node component replacing the default ReactFlow box.
 * Visuals: A distinct red dot representing a robot waypoint.
 * Interaction: Displays 4 connection handles (Top, Bottom, Left, Right) on hover.
 */
const WaypointNode = ({ data, isConnectable }: NodeProps) => {
    // Styles for the handles: invisible by default, white with blue border on hover.
    const handleStyle =
        "w-3 h-3 !bg-white !border-2 !border-blue-500 !rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-50";

    return (
        <div className="group relative flex flex-col items-center justify-center">
            {/* Node Label: Floating above the dot */}
            <div className="absolute -top-7 whitespace-nowrap bg-slate-900/90 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm backdrop-blur-sm pointer-events-none">
                {data.label}
            </div>

            {/* Visual Body: The draggable red dot */}
            <div className="w-5 h-5 bg-red-600 rounded-full border-[3px] border-white shadow-lg cursor-move z-20" />

            {/* Connection Interface: 4 Directional Handles */}
            <CreateHandleInternal
                pos={Position.Top}
                id="top"
                className={`${handleStyle} -top-1.5`}
                isConnectable={isConnectable}
            />

            <CreateHandleInternal
                pos={Position.Bottom}
                id="bottom"
                className={`${handleStyle} -bottom-1.5`}
                isConnectable={isConnectable}
            />

            <CreateHandleInternal
                pos={Position.Right}
                id="right"
                className={`${handleStyle} -right-1.5`}
                isConnectable={isConnectable}
            />

            <CreateHandleInternal
                pos={Position.Left}
                id="left"
                className={`${handleStyle} -left-1.5`}
                isConnectable={isConnectable}
            />
        </div>
    );
};

// --- CONFIGURATION DATA ---

// Initial static nodes for demonstration or default state.
const initialNodes: Node[] = [
    {
        id: "1",
        type: "waypointNode", // Must match the key in nodeTypes
        position: { x: 300, y: 300 },
        data: { label: "START [N-01]" },
    },
    {
        id: "2",
        type: "waypointNode",
        position: { x: 500, y: 200 },
        data: { label: "SHELF-A [N-02]" },
    },
];

// --- MAIN COMPONENT ---

const GraphEditor: React.FC = () => {
    /**
     * Node Types Memoization
     *
     * We wrap nodeTypes in useMemo. If this object is recreated on every render,
     * ReactFlow will treat every node as a new instance, causing severe performance
     * issues and flickering.
     */
    const nodeTypes = useMemo(() => ({ waypointNode: WaypointNode }), []);

    // ReactFlow State Hooks
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    /**
     * Connection Handler
     *
     * Callback fired when a user connects two handles.
     * We force 'default' type to ensure Bezier curves (curved lines).
     */
    const onConnect = useCallback(
        (params: Connection) => {
            const newEdge = {
                ...params,
                type: "default", // Enforce Bezier curvature
                animated: true, // Visual feedback for flow direction
                style: { stroke: "#3b82f6", strokeWidth: 2, strokeDasharray: "5,5" },
                markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" },
            };
            setEdges((eds) => addEdge(newEdge, eds));
        },
        [setEdges]
    );

    /**
     * Node Factory
     *
     * Creates a new WaypointNode with a generated ID and random offset.
     * In production, ID generation should use UUIDs to prevent collisions.
     */
    const addNode = () => {
        const id = `${nodes.length + 1}`;
        const newNode: Node = {
            id,
            type: "waypointNode",
            position: {
                x: 400 + Math.random() * 100, // Offset to prevent stacking
                y: 300 + Math.random() * 100,
            },
            data: { label: `WAYPOINT [N-${id.padStart(2, "0")}]` },
        };
        setNodes((nds) => nds.concat(newNode));
    };

    /**
     * Map Background Handler
     *
     * Reads a user-uploaded image file and injects it as a "Group" node
     * at the bottom of the stack (z-index: -10).
     */
    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const imageSrc = e.target?.result as string;
                // Create standard Image object to extract natural dimensions
                const img = new Image();
                img.src = imageSrc;
                img.onload = () => {
                    const mapNode: Node = {
                        id: "map-background",
                        type: "group", // Groups render behind child nodes by default
                        position: { x: 0, y: 0 },
                        data: { label: null },
                        style: {
                            backgroundImage: `url(${imageSrc})`,
                            backgroundSize: "cover",
                            width: img.width,
                            height: img.height,
                            zIndex: -10, // Ensure it stays in the background
                            pointerEvents: "none", // Allow clicking "through" the map
                        },
                        draggable: false, // Lock map in place
                        selectable: false,
                    };
                    // Prepend mapNode to ensure it renders first (bottom layer)
                    setNodes((nds) => [
                        mapNode,
                        ...nds.filter((n) => n.id !== "map-background"),
                    ]);
                };
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
                defaultEdgeOptions={{ type: "default" }}
            >
                {/* Visual Grid for alignment */}
                <Background
                    color="#cbd5e1"
                    gap={20}
                    size={1}
                    variant={BackgroundVariant.Dots}
                />

                {/* --- UI PANEL: Header --- */}
                <Panel position="top-left" className="m-4">
                    <div className="bg-white/90 backdrop-blur border border-slate-200 shadow-sm px-4 py-3 rounded-xl flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                            <LayoutGrid size={20} />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-slate-800 leading-tight">
                                Map Designer
                            </h2>
                            <p className="text-[10px] text-slate-500 font-mono">
                                EDITING: WAREHOUSE_MAIN_V2
                            </p>
                        </div>
                        <div className="h-6 w-px bg-slate-200 mx-1"></div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            ONLINE
                        </div>
                    </div>
                </Panel>

                {/* --- UI PANEL: Toolbar --- */}
                <Panel position="top-right" className="m-4">
                    <div className="bg-white/90 backdrop-blur border border-slate-200 shadow-lg rounded-xl p-1.5 flex gap-1">
                        <div className="flex gap-1 pr-2 border-r border-slate-200 items-center">
                            {/* File Upload Trigger */}
                            <label className="cursor-pointer p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all group relative">
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                />
                                <Upload size={18} />
                                <span className="absolute top-10 right-0 text-[10px] bg-slate-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-50">
                                    Upload Map
                                </span>
                            </label>

                            <button className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all group relative">
                                <MousePointer2 size={18} />
                            </button>

                            <button
                                onClick={addNode}
                                className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all group relative"
                            >
                                <PlusCircle size={18} />
                                <span className="absolute top-10 right-0 text-[10px] bg-slate-800 text-white px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-50">
                                    Add Node
                                </span>
                            </button>

                            <button
                                onClick={() => {
                                    setNodes([]);
                                    setEdges([]);
                                }}
                                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all group relative"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>

                        <div className="flex gap-1 pl-1">
                            <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 shadow-md transition-all active:translate-y-0.5">
                                <Save size={14} />
                                <span>SAVE MAP</span>
                            </button>
                            <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
                                <Settings size={18} />
                            </button>
                        </div>
                    </div>
                </Panel>

                {/* --- UI PANEL: Status Bar --- */}
                <Panel position="bottom-center" className="mb-2">
                    <div className="bg-slate-800/90 backdrop-blur text-slate-300 text-[10px] font-mono px-4 py-1.5 rounded-full flex gap-4 shadow-lg border border-slate-700">
                        <span>
                            NODES: {nodes.filter((n) => n.id !== "map-background").length}
                        </span>
                        <span className="text-slate-600">|</span>
                        <span>EDGES: {edges.length}</span>
                        <span className="text-slate-600">|</span>
                        <span>ZOOM: 100%</span>
                    </div>
                </Panel>

                <Controls />
                <MiniMap
                    className="!bg-slate-100 border border-slate-300 rounded-lg"
                    nodeColor={(n) => (n.type === "waypointNode" ? "#ef4444" : "#e2e8f0")}
                />
            </ReactFlow>
        </div>
    );
};

export default GraphEditor;