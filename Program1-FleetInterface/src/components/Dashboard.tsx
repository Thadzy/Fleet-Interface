import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, Search, LayoutGrid, MoreVertical, 
  Map as MapIcon, Clock, HardDrive 
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { DBGraph, DBNode, DBEdge } from '../types/database';

// --- SUB-COMPONENT: LIVE GRAPH PREVIEW ---
// Renders a mini SVG map of nodes & edges
const GraphPreview: React.FC<{ graphId: number, bgUrl: string | null }> = ({ graphId, bgUrl }) => {
  const [nodes, setNodes] = useState<DBNode[]>([]);
  const [edges, setEdges] = useState<DBEdge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // Fetch minimal data needed for preview
      const { data: nData } = await supabase.from('wh_nodes').select('id, x, y, type').eq('graph_id', graphId);
      const { data: eData } = await supabase.from('wh_edges').select('node_a_id, node_b_id').eq('graph_id', graphId);
      
      if (nData) setNodes(nData as DBNode[]);
      if (eData) setEdges(eData as DBEdge[]);
      setLoading(false);
    };
    fetchData();
  }, [graphId]);

  // Calculate ViewBox to fit all nodes + padding
  const viewBox = useMemo(() => {
    if (nodes.length === 0) return "0 0 800 600";
    
    // Convert meters to pixels (assuming scale 100 like in Editor)
    const xs = nodes.map(n => n.x * 100);
    const ys = nodes.map(n => n.y * 100);
    
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    const width = Math.max(maxX - minX, 100); // Prevent 0 width
    const height = Math.max(maxY - minY, 100);
    const padding = 100;

    return `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;
  }, [nodes]);

  // Helper to find node coordinates by ID
  const getNode = (id: number) => nodes.find(n => n.id === id);

  if (loading) return <div className="w-full h-full bg-slate-800/50 animate-pulse" />;

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#1a1a1a]">
      {/* 1. Background Image (if exists) */}
      {bgUrl && (
        <img 
          src={bgUrl} 
          alt="Map Bg" 
          className="absolute inset-0 w-full h-full object-cover opacity-30 blur-[1px]" 
        />
      )}

      {/* 2. SVG Overlay */}
      <svg 
        viewBox={viewBox} 
        className="w-full h-full absolute inset-0 pointer-events-none"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Draw Edges */}
        {edges.map((e, i) => {
          const nA = getNode(e.node_a_id);
          const nB = getNode(e.node_b_id);
          if (!nA || !nB) return null;
          return (
            <line 
              key={i}
              x1={nA.x * 100} y1={nA.y * 100}
              x2={nB.x * 100} y2={nB.y * 100}
              stroke="#3b82f6" 
              strokeWidth="4" // Thicker for thumbnail visibility
              opacity={0.6}
            />
          );
        })}

        {/* Draw Nodes */}
        {nodes.map((n) => (
          <circle 
            key={n.id}
            cx={n.x * 100}
            cy={n.y * 100}
            r={15} // Larger radius for visibility
            fill={n.type === 'waypoint' ? '#94a3b8' : n.type === 'shelf' ? '#06b6d4' : '#ef4444'}
            stroke="white"
            strokeWidth="2"
          />
        ))}
      </svg>
    </div>
  );
};

// --- MAIN DASHBOARD COMPONENT ---

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [warehouses, setWarehouses] = useState<DBGraph[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGraphs = async () => {
      try {
        const { data, error } = await supabase
          .from('wh_graphs')
          .select('*')
          .order('id', { ascending: true });

        if (error) throw error;
        setWarehouses(data || []);
      } catch (err) {
        console.error('Error fetching warehouses:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchGraphs();
  }, []);

  const handleCreateNew = async () => {
    const name = prompt("Enter new warehouse name:", `Warehouse ${warehouses.length + 1}`);
    if (!name) return;

    try {
      const { data, error } = await supabase
        .from('wh_graphs')
        .insert([{ name: name, map_url: null }])
        .select()
        .single();

      if (error) throw error;
      navigate(`/warehouse/${data.id}`);
    } catch (err) {
      alert("Failed to create warehouse");
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white font-sans">
      {/* HEADER */}
      <div className="h-16 border-b border-white/10 flex items-center justify-between px-6 bg-[#18181b]">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <LayoutGrid size={20} className="text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">Lertvilai Fleet Manager</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input 
              type="text" 
              placeholder="Search designs..." 
              className="bg-[#27272a] border border-transparent focus:border-blue-500 rounded-full py-2 pl-10 pr-4 text-xs outline-none transition-all w-64 placeholder:text-gray-500"
            />
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-cyan-400 border border-white/20"></div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="p-8 max-w-[1600px] mx-auto">
        <div className="flex justify-between items-end mb-8">
          <h2 className="text-xl font-bold">Recent Designs</h2>
          <button 
            onClick={handleCreateNew}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-900/20"
          >
            <Plus size={16} /> Create New Warehouse
          </button>
        </div>

        {/* GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          
          {/* Create New Card */}
          <div onClick={handleCreateNew} className="group cursor-pointer flex flex-col h-full">
            <div className="flex-1 bg-[#1e1e20] border border-white/5 rounded-xl flex flex-col items-center justify-center gap-3 min-h-[180px] transition-all group-hover:bg-[#27272a] group-hover:border-white/10 group-hover:shadow-lg">
              <div className="w-10 h-10 rounded-full bg-[#27272a] group-hover:bg-[#3f3f46] flex items-center justify-center transition-colors">
                <Plus size={20} className="text-blue-500" />
              </div>
              <span className="text-xs font-medium text-gray-400 group-hover:text-white">Start from blank</span>
            </div>
          </div>

          {/* Warehouse Cards */}
          {loading ? (
             [1,2,3].map(i => (
               <div key={i} className="animate-pulse">
                 <div className="bg-[#1e1e20] rounded-xl h-[180px] w-full mb-3"></div>
               </div>
             ))
          ) : (
            warehouses.map((wh) => (
              <div 
                key={wh.id} 
                onClick={() => navigate(`/warehouse/${wh.id}`)}
                className="group cursor-pointer flex flex-col gap-2"
              >
                {/* Thumbnail Container */}
                <div className="relative aspect-[16/10] bg-[#1e1e20] rounded-xl overflow-hidden border border-white/5 transition-all group-hover:ring-2 group-hover:ring-blue-500/50 group-hover:shadow-xl group-hover:translate-y-[-2px]">
                  
                  {/* --- THE PREVIEWER --- */}
                  <GraphPreview graphId={wh.id} bgUrl={wh.map_url} />

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                    <span className="bg-white text-black px-3 py-1.5 rounded-full text-[10px] font-bold shadow-lg transform scale-95 group-hover:scale-100 transition-transform">
                      OPEN EDITOR
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="px-1 flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-gray-200 text-sm truncate w-36 group-hover:text-blue-400 transition-colors">
                      {wh.name}
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-1">
                      <HardDrive size={10} />
                      <span className="font-mono">ID:{wh.id}</span>
                      <span>•</span>
                      <Clock size={10} />
                      <span>Updated just now</span>
                    </div>
                  </div>
                  <button className="text-gray-600 hover:text-white transition-colors">
                    <MoreVertical size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;