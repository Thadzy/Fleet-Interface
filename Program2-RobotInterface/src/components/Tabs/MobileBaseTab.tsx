import React, { useState } from 'react';
import DirectionPad, { type Direction } from '../ControlPanel/DirectionPad';
import ParameterInput from '../ControlPanel/ParameterInput';

interface MobileBaseTabProps {
  onLog: (message: string) => void;
}

const MobileBaseTab: React.FC<MobileBaseTabProps> = ({ onLog }) => {
  const [distance, setDistance] = useState<number>(1.0);
  const [speed, setSpeed] = useState<number>(0.5);
  const [selectedDir, setSelectedDir] = useState<Direction>('FORWARD');

  const handleSelectDirection = (dir: Direction) => {
    setSelectedDir(dir);
  };

  const handleExecute = () => {
    const cmd = `[CMD] EXECUTE: ${selectedDir}, Dist: ${distance}m, Speed: ${speed}m/s`;
    onLog(cmd);
  };

  const getStartBtnColor = () => {
    switch (selectedDir) {
        case 'FORWARD': return 'bg-blue-600 hover:bg-blue-500 border-blue-800';
        case 'BACKWARD': return 'bg-orange-600 hover:bg-orange-500 border-orange-800';
        case 'LEFT': return 'bg-indigo-600 hover:bg-indigo-500 border-indigo-800';
        case 'RIGHT': return 'bg-indigo-600 hover:bg-indigo-500 border-indigo-800';
        default: return 'bg-slate-600';
    }
  };

  return (
    // ปรับความสูงเป็น h-[500px] หรือ h-full เพื่อบังคับขนาดให้พอดีจอ
    <div className="h-[500px] bg-slate-100 p-2 overflow-hidden">
      
      <div className="grid grid-cols-12 gap-2 h-full">
        
        {/* --- COL 1: SETTINGS (3 Cols) --- */}
        <div className="col-span-3 bg-white rounded border border-slate-300 shadow-sm p-3 flex flex-col gap-2">
            <div className="border-b border-slate-100 pb-1 mb-1">
                <h3 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-2">
                    <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    Params
                </h3>
            </div>
            
            {/* Inputs: บีบ Padding ลง */}
            <div className="space-y-2">
                <div className="bg-slate-50 p-2 rounded border border-slate-200">
                    <ParameterInput label="Dist (m)" value={distance} onChange={setDistance} unit="m" />
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-200">
                    <ParameterInput label="Speed (m/s)" value={speed} onChange={setSpeed} unit="m/s" />
                </div>
            </div>

            {/* Status Panel: ดันลงล่างสุด */}
            <div className="mt-auto bg-slate-800 text-slate-200 p-2 rounded text-[10px] font-mono space-y-1">
                <div className="flex justify-between"><span>MODE:</span> <span className="text-yellow-400">OPEN-LOOP</span></div>
                <div className="flex justify-between"><span>SAFETY:</span> <span className="text-green-400">ON</span></div>
            </div>
        </div>

        {/* --- COL 2: JOG PAD (5 Cols) --- */}
        <div className="col-span-5 bg-slate-50 rounded border border-slate-300 shadow-inner flex flex-col items-center justify-center p-2 relative overflow-hidden">
            {/* Grid Background */}
            <div className="absolute inset-0 opacity-[0.05]" style={{backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '10px 10px'}}></div>

            <div className="z-10 flex flex-col items-center gap-2 scale-90"> {/* scale-90 เพื่อย่อส่วน Jog ทั้งหมดลงนิดนึง */}
                <DirectionPad selected={selectedDir} onSelect={handleSelectDirection} />
                
                <div className="text-center">
                    <span className="text-[10px] text-slate-500 font-bold">SELECTED</span>
                    <div className="text-lg font-black text-slate-800 tracking-tighter uppercase leading-none">
                        {selectedDir}
                    </div>
                </div>
            </div>
        </div>

        {/* --- COL 3: EXECUTE (4 Cols) --- */}
        <div className="col-span-4 bg-white rounded border border-slate-300 shadow-sm p-3 flex flex-col justify-between">
             <div className="border-b border-slate-100 pb-1 mb-1">
                <h3 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-2">
                    <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    Action
                </h3>
            </div>

            <div className="flex-1 flex flex-col justify-center gap-2">
                {/* Info Box */}
                <div className="bg-blue-50 border-l-2 border-blue-500 p-2 rounded-r text-xs text-blue-900">
                    <div className="flex justify-between items-center">
                        <span className="font-bold">Target:</span>
                        <span className="font-mono bg-white px-1 rounded">{selectedDir}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                        <span className="font-bold">Dist:</span>
                        <span className="font-mono bg-white px-1 rounded">{distance}m</span>
                    </div>
                </div>

                {/* THE BUTTON: ลด Padding ลง */}
                <button
                    onClick={handleExecute}
                    className={`group w-full relative flex flex-col items-center justify-center gap-1 text-white font-bold py-4 px-4 rounded shadow hover:shadow-lg transition-all active:scale-[0.98] border-b-4 active:border-b-0 active:translate-y-1 ${getStartBtnColor()}`}
                >
                     <svg className="w-6 h-6 group-hover:animate-pulse" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="tracking-widest text-lg">START</span>
                </button>
            </div>

            <div className="text-[9px] text-center text-slate-400 font-mono mt-1">
                Confirm &rarr; Execute
            </div>
        </div>

      </div>
    </div>
  );
};

export default MobileBaseTab;