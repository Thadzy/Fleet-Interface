import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom'; // <--- NEW IMPORTS
import { LayoutGrid, Cpu, Activity, ArrowLeft } from 'lucide-react';
import GraphEditor from './GraphEditor';
import Optimization from './Optimization';
import FleetController from './FleetController';

const FleetInterface: React.FC = () => {
  const { graphId } = useParams<{ graphId: string }>(); // Get ID from URL
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'graph' | 'opt' | 'fleet'>('graph');

  // Basic validation
  if (!graphId) return <div>Error: No Warehouse ID provided.</div>;

  const currentGraphId = parseInt(graphId);

  return (
    <div className="flex flex-col h-screen bg-slate-100">
      
      {/* HEADER */}
      <div className="h-14 bg-white border-b border-slate-200 px-4 flex justify-between items-center shadow-sm z-20">
        <div className="flex items-center gap-4">
          
          {/* Back Button */}
          <button 
            onClick={() => navigate('/')} 
            className="p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-full transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="h-6 w-px bg-slate-200"></div>

          <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            Warehouse Editor <span className="text-slate-400 text-xs font-mono ml-2">#{currentGraphId}</span>
          </h1>
        </div>

        {/* TAB SWITCHER */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
           {/* ... (Same tabs as before) ... */}
           <button onClick={() => setActiveTab('graph')} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'graph' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
             <LayoutGrid size={14} /> GRAPH
           </button>
           <button onClick={() => setActiveTab('opt')} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'opt' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
             <Cpu size={14} /> OPTIMIZATION
           </button>
           <button onClick={() => setActiveTab('fleet')} className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'fleet' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
             <Activity size={14} /> FLEET
           </button>
        </div>
      </div>

      {/* CONTENT AREA - PASS ID DOWN */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'graph' && <GraphEditor graphId={currentGraphId} />} 
        {activeTab === 'opt' && <Optimization graphId={currentGraphId} />}
        {activeTab === 'fleet' && <FleetController graphId={currentGraphId} />}
      </div>
    </div>
  );
};

export default FleetInterface;