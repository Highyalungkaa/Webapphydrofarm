import React from 'react';

const cropColors = [
  'bg-sky-500', 'bg-amber-500', 'bg-violet-500', 'bg-teal-500',
  'bg-pink-500', 'bg-indigo-500', 'bg-lime-500', 'bg-orange-500',
];

export interface PlotCropSegment {
  name: string;
  count: number;
  cropIndex: number;
}

export const PlotCapacityBar: React.FC<{
  capacity: number;
  previousUsed: number;
  crops: PlotCropSegment[];
}> = ({ capacity, previousUsed, crops }) => {
  const total = Math.max(0, capacity);
  const previous = Math.min(total, Math.max(0, previousUsed));
  const cropTotal = crops.reduce((sum, crop) => sum + Math.max(0, crop.count), 0);
  const free = Math.max(0, total - previous - cropTotal);
  const percent = (count: number) => total > 0 ? `${Math.min(100, (count / total) * 100)}%` : '0%';

  return (
    <div className="space-y-2">
      <div
        role="img"
        aria-label={`ความจุ ${total} ต้น รอบเดิม ${previous} ต้น ${crops.map((crop) => `${crop.name} ${crop.count} ต้น`).join(' ')} ว่าง ${free} ต้น`}
        className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200"
      >
        {previous > 0 && <div className="h-full shrink-0 bg-slate-500" style={{ width: percent(previous) }} title={`รอบเดิม ${previous} ต้น`} />}
        {crops.filter((crop) => crop.count > 0).map((crop) => (
          <div key={crop.cropIndex} className={`h-full shrink-0 ${cropColors[crop.cropIndex % cropColors.length]}`}
            style={{ width: percent(crop.count) }} title={`${crop.name} ${crop.count} ต้น`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-600">
        {previous > 0 && <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-slate-500" />รอบเดิม {previous.toLocaleString()} ต้น</span>}
        {crops.filter((crop) => crop.count > 0).map((crop) => (
          <span key={crop.cropIndex} className="inline-flex items-center gap-1">
            <span className={`h-2.5 w-2.5 rounded-sm ${cropColors[crop.cropIndex % cropColors.length]}`} />
            {crop.name} {crop.count.toLocaleString()} ต้น
          </span>
        ))}
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-slate-200" />ว่าง {free.toLocaleString()} ต้น</span>
      </div>
    </div>
  );
};
