interface BeatDisplayProps {
  currentBeat: number;
  beatsPerMeasure: number;
  isPlaying: boolean;
}

export function BeatDisplay({ currentBeat, beatsPerMeasure, isPlaying }: BeatDisplayProps) {
  return (
    <div className="flex gap-3 justify-center">
      {Array.from({ length: beatsPerMeasure }).map((_, i) => {
        const isActive = isPlaying && currentBeat === i;
        const isAccent = i === 0;
        return (
          <div
            key={i}
            className={`
              w-12 h-12 rounded-full border-2 transition-all duration-75
              ${isActive
                ? isAccent
                  ? 'bg-violet-400 border-violet-300 shadow-[0_0_20px_rgba(167,139,250,0.8)] scale-110'
                  : 'bg-slate-300 border-slate-200 shadow-[0_0_12px_rgba(226,232,240,0.5)] scale-105'
                : isAccent
                  ? 'bg-violet-900/40 border-violet-600/60'
                  : 'bg-slate-800/60 border-slate-600/60'
              }
            `}
          />
        );
      })}
    </div>
  );
}
