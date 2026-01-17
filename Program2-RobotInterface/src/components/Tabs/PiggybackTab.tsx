import React from 'react';

const PiggybackTab: React.FC = () => {
  return (
    <div className="p-12 text-center border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 h-full flex flex-col items-center justify-center gap-4">
      <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center text-slate-400">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
      </div>
      <div>
        <h3 className="text-xl font-bold text-slate-700">Piggyback Control</h3>
        <p className="text-slate-500">Lift, Turntable, and Insert controls will be here.</p>
      </div>
    </div>
  );
};

export default PiggybackTab;