import React, { useEffect, useRef } from 'react';

interface LogPanelProps {
  logs: string[];
  onClear: () => void;
}

const LogPanel: React.FC<LogPanelProps> = ({ logs, onClear }) => {
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new log comes in
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="mt-4 border border-slate-300 rounded-xl overflow-hidden shadow-sm bg-slate-900 text-slate-200 font-mono text-xs">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-2 bg-slate-800 border-b border-slate-700">
        <span className="font-bold flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          SYSTEM LOGS
        </span>
        <button 
          onClick={onClear}
          className="text-xs text-slate-400 hover:text-white hover:bg-slate-700 px-2 py-1 rounded transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Log Content Area */}
      <div className="h-32 overflow-y-auto p-4 space-y-1">
        {logs.length === 0 ? (
          <div className="text-slate-600 italic">No activity recorded...</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="break-words">
              <span className="text-green-500 mr-2">➜</span>
              {log}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
};

export default LogPanel;