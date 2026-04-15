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

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-violet-600' : 'bg-slate-600'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );
}

export function TimerPanel({ timer, isPlaying, onUpdate, onReset }: TimerPanelProps) {
  return (
    <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
      {/* ヘッダー行 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-slate-300 font-semibold text-sm tracking-widest uppercase">練習タイマー</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <span className="text-slate-400 text-sm">有効</span>
            <Toggle checked={timer.enabled} onChange={() => onUpdate({ enabled: !timer.enabled })} />
          </label>
        </div>
      </div>

      {/* カウントダウン表示 */}
      <div
        className={`
          text-4xl font-mono font-bold text-center tabular-nums
          ${timer.isFinished ? 'text-amber-400' : timer.enabled ? 'text-slate-100' : 'text-slate-500'}
        `}
      >
        {timer.isFinished ? '終了' : formatTime(timer.remainingSeconds)}
      </div>

      {/* ループ回数 */}
      {timer.loop && timer.lapCount > 0 && (
        <p className="text-violet-400 text-xs text-center mt-1">
          {timer.lapCount} 周目完了
        </p>
      )}

      <div className="space-y-3 mt-4">
        {/* 練習時間スライダー */}
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

        {/* ループトグル */}
        <div className="flex items-center justify-between py-1">
          <div>
            <span className="text-slate-300 text-sm">ループ</span>
            <p className="text-slate-500 text-xs">終了後に自動で再スタート</p>
          </div>
          <Toggle checked={timer.loop} onChange={() => onUpdate({ loop: !timer.loop })} />
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
