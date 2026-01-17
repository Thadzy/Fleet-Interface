import React from 'react';

export type Direction = 'FORWARD' | 'BACKWARD' | 'LEFT' | 'RIGHT';

interface DirectionPadProps {
  onSelect: (dir: Direction) => void; // เปลี่ยนชื่อจาก onMove เป็น onSelect ให้สื่อความหมายชัดขึ้น
  selected: Direction;                // รับค่าว่าตัวไหนกำลังถูกเลือก
  disabled?: boolean;
}

const DirectionPad: React.FC<DirectionPadProps> = ({ onSelect, selected, disabled }) => {
  // ฟังก์ชันเลือกสีปุ่ม: ถ้าถูกเลือกจะเป็นสีน้ำเงินเข้ม (Active), ถ้าไม่เลือกจะเป็นสีขาว
  const getBtnStyle = (dir: Direction) => {
    const base = "flex items-center justify-center w-16 h-16 rounded-lg border-2 transition-all shadow-sm font-bold ";
    if (selected === dir) {
      return base + "bg-blue-600 border-blue-700 text-white ring-2 ring-blue-300 ring-offset-2 scale-105 z-10"; // Highlight Style
    }
    return base + "bg-white border-slate-300 text-slate-400 hover:border-blue-400 hover:text-blue-500 active:bg-slate-50"; // Normal Style
  };

  return (
    <div className="flex flex-col items-center gap-2 p-5 bg-slate-100 rounded-xl border border-slate-200 shadow-inner w-fit select-none">
      {/* Row 1: Forward */}
      <button
        onClick={() => onSelect('FORWARD')}
        disabled={disabled}
        className={getBtnStyle('FORWARD')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
      </button>

      {/* Row 2: Left, Backward, Right */}
      <div className="flex gap-2">
        <button onClick={() => onSelect('LEFT')} disabled={disabled} className={getBtnStyle('LEFT')}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>

        <button onClick={() => onSelect('BACKWARD')} disabled={disabled} className={getBtnStyle('BACKWARD')}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>

        <button onClick={() => onSelect('RIGHT')} disabled={disabled} className={getBtnStyle('RIGHT')}>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>
      
      <div className="text-[10px] font-mono text-slate-400 mt-2">
        SELECTED: <span className="text-blue-600 font-bold">{selected}</span>
      </div>
    </div>
  );
};

export default DirectionPad;