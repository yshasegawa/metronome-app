import { useMetronome, type Subdivision } from './hooks/useMetronome';
import { BeatDisplay } from './components/BeatDisplay';
import { TimerPanel } from './components/TimerPanel';
import { AutoBpmPanel } from './components/AutoBpmPanel';
import './index.css';

const SUBDIVISION_OPTIONS: { value: Subdivision; label: string; sub: string }[] = [
  { value: 'quarter',   label: '♩',  sub: '4分音符' },
  { value: 'eighth',    label: '♪♪', sub: '8分音符' },
  { value: 'sixteenth', label: '♬♬', sub: '16分音符' },
  { value: 'triplet',   label: '♪³', sub: '三連符' },
];

function App() {
  const {
    isPlaying,
    bpm,
    currentBeat,
    beatsPerMeasure,
    timer,
    autoBpm,
    subdivision,
    play,
    stop,
    setBpm,
    setSubdivision,
    tapTempo,
    updateTimer,
    resetTimer,
    updateAutoBpm,
  } = useMetronome();

  const toggle = () => (isPlaying ? stop() : play());

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-[#0f0f13] flex flex-col items-center py-10 px-4">
      <h1 className="text-2xl font-bold text-slate-200 tracking-widest uppercase mb-8">
        Metronome
      </h1>

      {/* BPM Display */}
      <div className="mb-6 text-center">
        <div
          className={`
            text-9xl font-black tabular-nums transition-all duration-100 select-none leading-none
            ${isPlaying ? 'text-slate-100' : 'text-slate-400'}
          `}
        >
          {bpm}
        </div>
        <div className="text-slate-500 text-sm font-medium tracking-widest uppercase mt-1">
          BPM
        </div>
      </div>

      {/* Beat Display */}
      <div className="mb-6">
        <BeatDisplay
          currentBeat={currentBeat}
          beatsPerMeasure={beatsPerMeasure}
          isPlaying={isPlaying}
        />
      </div>

      {/* Subdivision selector */}
      <div className="w-full max-w-md mb-6">
        <p className="text-slate-500 text-xs uppercase tracking-widest text-center mb-2">音符の種類</p>
        <div className="grid grid-cols-4 gap-2">
          {SUBDIVISION_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSubdivision(opt.value)}
              className={`
                flex flex-col items-center py-2.5 px-1 rounded-xl border transition-all
                ${subdivision === opt.value
                  ? 'bg-violet-600/30 border-violet-500 text-violet-300'
                  : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                }
              `}
            >
              <span className="text-xl leading-none mb-1">{opt.label}</span>
              <span className="text-xs">{opt.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* BPM Controls */}
      <div className="w-full max-w-md mb-6 space-y-3">
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={40}
            max={240}
            value={bpm}
            onChange={e => setBpm(Number(e.target.value))}
            className="flex-1 h-2 accent-violet-500 cursor-pointer"
          />
          <input
            type="number"
            min={40}
            max={240}
            value={bpm}
            onChange={e => setBpm(Number(e.target.value))}
            className="w-20 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-center text-slate-100 font-mono font-bold text-lg focus:outline-none focus:border-violet-500"
          />
        </div>

        {/* Quick BPM presets */}
        <div className="flex gap-2 flex-wrap justify-center">
          {[60, 80, 100, 120, 140, 160].map(preset => (
            <button
              key={preset}
              onClick={() => setBpm(preset)}
              className={`
                px-3 py-1 rounded-lg text-sm font-medium transition-colors
                ${bpm === preset
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }
              `}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Play / Stop + Tap */}
      <div className="flex items-center gap-4 mb-10">
        <button
          onClick={tapTempo}
          className="px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm border border-slate-600 hover:border-slate-500 transition-all active:scale-95"
        >
          タップ
        </button>

        <button
          onClick={toggle}
          className={`
            w-20 h-20 rounded-full font-bold text-lg transition-all duration-150 active:scale-95 shadow-lg
            ${isPlaying
              ? 'bg-slate-700 hover:bg-slate-600 text-slate-200 border-2 border-slate-500'
              : 'bg-violet-600 hover:bg-violet-500 text-white border-2 border-violet-400 shadow-violet-900/50'
            }
          `}
        >
          {isPlaying ? '停止' : '再生'}
        </button>

        <div className="w-[88px]" />
      </div>

      {/* Timer & Auto BPM panels */}
      <div className="w-full max-w-md grid grid-cols-1 gap-4">
        <TimerPanel
          timer={timer}
          isPlaying={isPlaying}
          onUpdate={updateTimer}
          onReset={resetTimer}
        />
        <AutoBpmPanel
          autoBpm={autoBpm}
          currentBpm={bpm}
          isPlaying={isPlaying}
          onUpdate={updateAutoBpm}
        />
      </div>
    </div>
  );
}

export default App;
