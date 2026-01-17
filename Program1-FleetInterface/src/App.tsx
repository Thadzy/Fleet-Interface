import React, { useState } from 'react';
import { Map, Zap, MonitorPlay, Box } from 'lucide-react';
import GraphEditor from './components/GraphEditor';
import Optimization from './components/Optimization';
import FleetController from './components/FleetController';

// Define the tabs based on your PDF requirements
type Tab = 'designer' | 'optimization' | 'fleet';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('designer');

  return (
    <div className="w-screen h-screen flex flex-col bg-slate-100 overflow-hidden font-sans">
      
      {/* --- TOP NAVIGATION BAR --- */}
      <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-50 shadow-sm shrink-0">
        
        {/* Logo / Branding */}
        <div className="flex items-center gap-2">
          <div className="bg-slate-900 text-white p-1.5 rounded-lg">
            <Box size={20} />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-800 leading-tight">Lertvilai Fleet Manager</h1>
            <p className="text-[10px] text-slate-500 font-mono">VRPPD SYSTEM v1.0</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setActiveTab('designer')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeTab === 'designer' 
                ? 'bg-white text-slate-800 shadow-sm text-blue-600' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Map size={14} />
            <span>Map Designer</span>
          </button>

          <button
            onClick={() => setActiveTab('optimization')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeTab === 'optimization' 
                ? 'bg-white text-slate-800 shadow-sm text-purple-600' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Zap size={14} />
            <span>Optimization</span>
          </button>

          <button
            onClick={() => setActiveTab('fleet')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeTab === 'fleet' 
                ? 'bg-white text-slate-800 shadow-sm text-green-600' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <MonitorPlay size={14} />
            <span>Fleet Control</span>
          </button>
        </div>

        {/* User / Status (Placeholder) */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-slate-200 border-2 border-white shadow-sm overflow-hidden">
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" />
          </div>
        </div>
      </header>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 relative overflow-hidden">
        {activeTab === 'designer' && <GraphEditor />}
        {activeTab === 'optimization' && <Optimization />}
        {activeTab === 'fleet' && <FleetController />}
      </main>

    </div>
  );
}

export default App;