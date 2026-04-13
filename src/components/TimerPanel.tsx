import type { TimerState } from '../hooks/useMetronome';

interface TimerPanelProps {
  timer: TimerState;
  isPlaying: boolean;
  onUpdate: (updates: Partial<TimerState>) => void;
  onReset: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function TimerPanel({ timer, isPlaying, onUpdate, onReset }: TimerPanelProps) {
  return (
    <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-slate-300 font-semibold text-sm tracking-widest uppercase">練習タイマー</h3>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-slate-400 text-sm">有効</span>
          <button
            role="switch"
            aria-checked={timer.enabled}
            onClick={() => onUpdate({ enabled: !timer.enabled })}
            className={`
              relative w-11 h-6 rounded-full transition-colors duration-200
              ${timer.enabled ? 'bg-violet-600' : 'bg-slate-600'}
            `}
          >
            <span
              className={`
                absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200
                ${timer.enabled ? 'translate-x-5' : 'translate-x-0'}
              `}
            />
          </button>
        </label>
      </div>

      <div
        className={`
          text-4xl font-mono font-bold text-center mb-4 tabular-nums
          ${timer.isFinished ? 'text-amber-400' : timer.enabled ? 'text-slate-100' : 'text-slate-500'}
        `}
      >
        {timer.isFinished ? '終了' : formatTime(timer.remainingSeconds)}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-slate-400 text-xs block mb-1">練習時間（分）</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={60}
              value={timer.durationMinutes}
              disabled={isPlaying}
              onChange={e => onUpdate({ durationMinutes: Number(e.target.value) })}
              className="flex-1 accent-violet-500 disabled:opacity-40"
            />
            <input
              type="number"
              min={1}
              max={60}
              value={timer.durationMinutes}
              disabled={isPlaying}
              onChange={e => onUpdate({ durationMinutes: Number(e.target.value) })}
              className="w-16 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-center text-slate-100 text-sm disabled:opacity-40"
            />
          </div>
        </div>

        <button
          onClick={onReset}
          className="w-full py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm transition-colors"
        >
          リセット
        </button>
      </div>
    </div>
  );
}
