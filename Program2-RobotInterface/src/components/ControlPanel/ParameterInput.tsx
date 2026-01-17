import React from 'react';

interface ParameterInputProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
}

const ParameterInput: React.FC<ParameterInputProps> = ({ 
  label, value, onChange, unit, step = 0.1, min = 0 
}) => {
  return (
    <div className="flex flex-col gap-1 w-full">
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
        {label}
      </label>
      <div className="relative flex items-center">
        <input
          type="number"
          step={step}
          min={min}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          // แก้ไขตรงนี้:
          // 1. pr-10: เว้นที่ว่างด้านขวาไม่ให้ตัวเลขทับหน่วย
          // 2. [&::-webkit...]: ซ่อนปุ่ม Spinners
          className="w-full pl-3 pr-10 py-2 bg-white border border-slate-300 rounded-md text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm [&::-webkit-inner-spin-button]:appearance-none hover:[&::-webkit-inner-spin-button]:appearance-none"
        />
        {unit && (
          <div className="absolute right-3 text-sm text-slate-400 font-medium pointer-events-none bg-white pl-1">
            {unit}
          </div>
        )}
      </div>
    </div>
  );
};

export default ParameterInput;