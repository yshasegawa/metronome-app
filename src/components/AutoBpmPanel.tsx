import type { AutoBpmState } from '../hooks/useMetronome';

interface AutoBpmPanelProps {
  autoBpm: AutoBpmState;
  currentBpm: number;
  isPlaying: boolean;
  onUpdate: (updates: Partial<AutoBpmState>) => void;
}

export function AutoBpmPanel({ autoBpm, currentBpm, isPlaying, onUpdate }: AutoBpmPanelProps) {
  return (
    <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-slate-300 font-semibold text-sm tracking-widest uppercase">BPM自動増加</h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-slate-400 text-sm">有効</span>
          <button
            role="switch"
            aria-checked={autoBpm.enabled}
            onClick={() => onUpdate({ enabled: !autoBpm.enabled })}
            className={`
              relative w-11 h-6 rounded-full transition-colors duration-200
              ${autoBpm.enabled ? 'bg-violet-600' : 'bg-slate-600'}
            `}
          >
            <span
              className={`
                absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200
                ${autoBpm.enabled ? 'translate-x-5' : 'translate-x-0'}
              `}
            />
          </button>
        </label>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-slate-400 text-xs block mb-1">
            増加間隔（秒）
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={5}
              max={120}
              step={5}
              value={autoBpm.intervalSeconds}
              onChange={e => onUpdate({ intervalSeconds: Number(e.target.value) })}
              className="flex-1 accent-violet-500"
            />
            <input
              type="number"
              min={5}
              max={120}
              step={5}
              value={autoBpm.intervalSeconds}
              onChange={e => onUpdate({ intervalSeconds: Number(e.target.value) })}
              className="w-16 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-center text-slate-100 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-slate-400 text-xs block mb-1">
            増加量（BPM）
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={10}
              value={autoBpm.incrementAmount}
              onChange={e => onUpdate({ incrementAmount: Number(e.target.value) })}
              className="flex-1 accent-violet-500"
            />
            <input
              type="number"
              min={1}
              max={10}
              value={autoBpm.incrementAmount}
              onChange={e => onUpdate({ incrementAmount: Number(e.target.value) })}
              className="w-16 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-center text-slate-100 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-slate-400 text-xs block mb-1">
            最大BPM（現在: {currentBpm}）
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={40}
              max={240}
              value={autoBpm.maxBpm}
              onChange={e => onUpdate({ maxBpm: Number(e.target.value) })}
              className="flex-1 accent-violet-500"
            />
            <input
              type="number"
              min={40}
              max={240}
              value={autoBpm.maxBpm}
              onChange={e => onUpdate({ maxBpm: Number(e.target.value) })}
              className="w-16 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-center text-slate-100 text-sm"
            />
          </div>
        </div>

        {isPlaying && autoBpm.enabled && (
          <p className="text-violet-400 text-xs text-center">
            {autoBpm.intervalSeconds}秒ごとに +{autoBpm.incrementAmount} BPM（上限 {autoBpm.maxBpm}）
          </p>
        )}
      </div>
    </div>
  );
}
