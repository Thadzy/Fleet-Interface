import React from 'react';
import GraphEditor from './components/GraphEditor';

function App() {
  return (
    <div className="h-screen w-screen bg-slate-100 flex flex-col overflow-hidden">
      
      <header className="flex-none p-4 bg-white border-b border-slate-200">
        <h1 className="text-xl font-bold text-slate-800">Lertvilai Fleet Manager</h1>
        <p className="text-xs text-slate-500">Program 1: Fleet Interface</p>
      </header>

      <main className="flex-1 relative w-full h-full p-4">
        <GraphEditor />
      </main>

    </div>
  );
}

export default App;