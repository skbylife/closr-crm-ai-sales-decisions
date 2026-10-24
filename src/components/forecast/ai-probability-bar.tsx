'use client';

interface AIProbabilityBarProps {
  salesProbability: number;
  aiProbability: number;
  showLabels?: boolean;
}

export function AIProbabilityBar({ salesProbability, aiProbability, showLabels = true }: AIProbabilityBarProps) {
  const gap = Math.abs(aiProbability - salesProbability);
  const isHighGap = gap > 20;

  return (
    <div className="space-y-1.5 w-full">
      {/* Sales probability */}
      <div className="flex items-center gap-2">
        {showLabels && <span className="text-[11px] text-secondary w-10 text-right shrink-0">销售</span>}
        <div className="flex-1 h-3 rounded-full bg-sidebar overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${salesProbability}%` }}
          />
        </div>
        <span className="text-[11px] font-medium text-foreground w-9 text-right shrink-0">{salesProbability}%</span>
      </div>
      {/* AI probability */}
      <div className="flex items-center gap-2">
        {showLabels && <span className="w-10 shrink-0 text-right text-[11px] text-accent">智能</span>}
        <div className="flex-1 h-3 rounded-full bg-sidebar overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isHighGap ? 'bg-danger' : 'bg-accent'
            }`}
            style={{ width: `${aiProbability}%` }}
          />
        </div>
        <span className={`text-[11px] font-medium w-9 text-right shrink-0 ${isHighGap ? 'text-danger' : 'text-accent'}`}>
          {aiProbability}%
        </span>
      </div>
      {/* Gap indicator */}
      {isHighGap && (
        <div className="flex items-center gap-1 ml-12">
          <span className="text-[10px] text-danger font-medium">
            Gap {gap}%
          </span>
        </div>
      )}
    </div>
  );
}
