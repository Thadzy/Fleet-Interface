import React, { useState } from 'react';
import MobileBaseTab from './components/Tabs/MobileBaseTab';
import PiggybackTab from './components/Tabs/PiggybackTab';
import LogPanel from './components/LogPanel'; // Import LogPanel

function App() {
  const [activeTab, setActiveTab] = useState<'MOBILE' | 'PIGGYBACK'>('MOBILE');
  
  // 1. สร้าง State เก็บ Log
  const [logs, setLogs] = useState<string[]>([]);

  // 2. สร้างฟังก์ชันเพิ่ม Log (ใส่ Timestamp ให้ดูโปร)
  const addLog = (message: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [...prev, `[${time}] ${message}`]);
  };

  const clearLogs = () => setLogs([]);

  return (
    <div className="min-h-screen bg-slate-100 p-8 font-sans">
      <header className="max-w-5xl mx-auto mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Robot Interface: Program 2</h1>
        <div className="text-slate-500 text-sm">FIBO Technovation System</div>
      </header>

      <main className="max-w-5xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200 min-h-[400px]">
          <div className="flex border-b border-slate-200 bg-slate-50">
            <button 
              onClick={() => setActiveTab('MOBILE')}
              className={`px-6 py-3 text-sm font-bold transition-colors border-b-2 ${
                activeTab === 'MOBILE' ? 'text-blue-600 border-blue-600 bg-white' : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              Tab 1: Mobile Base
            </button>
            <button 
              onClick={() => setActiveTab('PIGGYBACK')}
              className={`px-6 py-3 text-sm font-bold transition-colors border-b-2 ${
                activeTab === 'PIGGYBACK' ? 'text-blue-600 border-blue-600 bg-white' : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              Tab 2: Piggyback
            </button>
          </div>

          <div className="p-0">
            {/* 3. ส่ง addLog ลงไปให้ Component ลูกใช้งาน */}
            {activeTab === 'MOBILE' ? (
              <MobileBaseTab onLog={addLog} />
            ) : (
              // อย่าลืมไปแก้ PiggybackTab ให้รับ Prop onLog ด้วยนะครับ (หรือใส่ dummy ไปก่อนแบบนี้)
               <PiggybackTab /> 
            )}
          </div>
        </div>

        {/* 4. แปะ LogPanel ไว้ข้างล่างสุด */}
        <LogPanel logs={logs} onClear={clearLogs} />
      </main>
    </div>
  );
}

export default App;