import { useRef, useState, useCallback, useEffect } from 'react';

const SCHEDULE_AHEAD = 0.1; // seconds to schedule ahead
const SCHEDULE_AHEAD_HIDDEN = 0.6; // バックグラウンド時はティックが遅延しても途切れないよう長めに先読み
const LOOKAHEAD = 25; // ms interval for scheduler

// メインスレッドの setInterval はバックグラウンドで間引かれるため、
// スケジューラのティックは Web Worker（間引き対象外）で刻む
const TICK_WORKER_CODE = `
let timer = null;
onmessage = (e) => {
  if (e.data === 'start') {
    if (!timer) timer = setInterval(() => postMessage(0), ${LOOKAHEAD});
  } else {
    clearInterval(timer);
    timer = null;
  }
};
`;

// BPM は 0（テンポなし・タイマーのみ）または 40〜240 のみ許可。中間値は近い方に丸める
function snapBpm(value: number): number {
  if (value >= 40) return Math.min(240, value);
  return value < 20 ? 0 : 40;
}

// iOS でスリープ復帰後の resume() が完了しないことがあるため、タイムアウト付きで待つ
function resumeWithTimeout(ctx: AudioContext, ms = 300): Promise<void> {
  return Promise.race([
    ctx.resume().catch(() => {}),
    new Promise<void>(resolve => setTimeout(resolve, ms)),
  ]);
}

export type Subdivision = 'quarter' | 'eighth' | 'sixteenth' | 'triplet';

export const SUBDIVISION_COUNT: Record<Subdivision, number> = {
  quarter: 1,
  eighth: 2,
  sixteenth: 4,
  triplet: 3,
};

export interface TimerState {
  enabled: boolean;
  loop: boolean;
  durationMinutes: number;
  remainingSeconds: number;
  isFinished: boolean;
  lapCount: number;
}

export interface AutoBpmState {
  enabled: boolean;
  intervalSeconds: number;
  incrementAmount: number;
  maxBpm: number;
}

const STORAGE_KEY = 'metronome-settings';

interface PersistedSettings {
  bpm: number;
  subdivision: Subdivision;
  timer: Pick<TimerState, 'enabled' | 'loop' | 'durationMinutes'>;
  autoBpm: AutoBpmState;
}

function loadSettings(): Partial<PersistedSettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function useMetronome() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextBeatTimeRef = useRef(0);
  const currentTickRef = useRef(0); // counts individual ticks (beat * subdivCount + subdivIndex)
  const tickWorkerRef = useRef<Worker | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const streamAudioRef = useRef<HTMLAudioElement | null>(null);
  const isPlayingRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const savedRef = useRef(loadSettings());

  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpmState] = useState(() => snapBpm(savedRef.current.bpm ?? 120));
  const [currentBeat, setCurrentBeat] = useState(0);
  const [subdivision, setSubdivisionState] = useState<Subdivision>(
    () => savedRef.current.subdivision ?? 'quarter'
  );
  const beatsPerMeasure = 4;

  // Timer state
  const [timer, setTimer] = useState<TimerState>(() => {
    const saved = savedRef.current.timer;
    const durationMinutes = saved?.durationMinutes ?? 5;
    return {
      enabled: saved?.enabled ?? false,
      loop: saved?.loop ?? false,
      durationMinutes,
      remainingSeconds: durationMinutes * 60,
      isFinished: false,
      lapCount: 0,
    };
  });
  const timerRef = useRef(timer);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto BPM state
  const [autoBpm, setAutoBpm] = useState<AutoBpmState>(() => ({
    enabled: false,
    intervalSeconds: 30,
    incrementAmount: 5,
    maxBpm: 200,
    ...savedRef.current.autoBpm,
  }));
  const autoBpmRef = useRef(autoBpm);
  const autoBpmTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const bpmRef = useRef(bpm);
  const subdivisionRef = useRef(subdivision);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { subdivisionRef.current = subdivision; }, [subdivision]);
  useEffect(() => { timerRef.current = timer; }, [timer]);
  useEffect(() => { autoBpmRef.current = autoBpm; }, [autoBpm]);

  // 設定を localStorage に保存（リロード後も復元される）
  useEffect(() => {
    const settings: PersistedSettings = {
      bpm,
      subdivision,
      timer: {
        enabled: timer.enabled,
        loop: timer.loop,
        durationMinutes: timer.durationMinutes,
      },
      autoBpm,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ストレージ不可の環境では無視
    }
  }, [bpm, subdivision, timer.enabled, timer.loop, timer.durationMinutes, autoBpm]);

  // 全クリック音は master ゲイン → MediaStream → <audio> 要素経由で出力する。
  // iOS は Web Audio の直接出力をバックグラウンドで停止するが、
  // メディア要素の再生は継続するため、この経路なら音が鳴り続ける
  const setupAudioGraph = useCallback((ctx: AudioContext) => {
    const master = ctx.createGain();
    const streamDest = ctx.createMediaStreamDestination();
    master.connect(streamDest);
    if (!streamAudioRef.current) {
      streamAudioRef.current = new Audio();
      streamAudioRef.current.setAttribute('playsinline', '');
    }
    streamAudioRef.current.srcObject = streamDest.stream;
    masterGainRef.current = master;
  }, []);

  // tickType: 'accent' | 'beat' | 'subdiv'
  const scheduleClick = useCallback((tickType: 'accent' | 'beat' | 'subdiv', time: number) => {
    const ctx = audioCtxRef.current;
    const master = masterGainRef.current;
    if (!ctx || !master) return;

    const config = {
      accent: { freqStart: 2800, freqEnd: 1600, duration: 0.055, gain: 1.4 },
      beat:   { freqStart: 2200, freqEnd: 1200, duration: 0.04,  gain: 1.1 },
      subdiv: { freqStart: 1800, freqEnd: 1000, duration: 0.025, gain: 0.6 },
    }[tickType];

    // ノイズバースト（打撃感）
    const bufferSize = ctx.sampleRate * 0.015;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseSource.connect(noiseGain);
    noiseGain.connect(master);
    const noiseLevel = tickType === 'subdiv' ? 0.15 : 0.3;
    noiseGain.gain.setValueAtTime(noiseLevel, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.015);
    noiseSource.start(time);
    noiseSource.stop(time + 0.015);

    // ピッチダウンするオシレーター（木琴的な打撃音）
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(master);

    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(config.freqStart, time);
    oscillator.frequency.exponentialRampToValueAtTime(config.freqEnd, time + config.duration);

    gainNode.gain.setValueAtTime(0, time);
    gainNode.gain.linearRampToValueAtTime(config.gain, time + 0.002);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + config.duration);

    oscillator.start(time);
    oscillator.stop(time + config.duration);
  }, []);

  const scheduler = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;

    // BPM 0 はテンポを刻まない（タイマーのみ動作）。再開時に備えて基準時刻を進めておく
    if (bpmRef.current <= 0) {
      nextBeatTimeRef.current = ctx.currentTime + 0.05;
      return;
    }

    const scheduleAhead = document.hidden ? SCHEDULE_AHEAD_HIDDEN : SCHEDULE_AHEAD;
    while (nextBeatTimeRef.current < ctx.currentTime + scheduleAhead) {
      const subdivCount = SUBDIVISION_COUNT[subdivisionRef.current];
      const totalTicks = beatsPerMeasure * subdivCount;
      const tick = currentTickRef.current % totalTicks;
      const beatIndex = Math.floor(tick / subdivCount);
      const subdivIndex = tick % subdivCount;

      const tickType: 'accent' | 'beat' | 'subdiv' =
        subdivIndex !== 0 ? 'subdiv' :
        beatIndex === 0 ? 'accent' : 'beat';

      scheduleClick(tickType, nextBeatTimeRef.current);

      // Update visual beat on the downbeat of each beat
      if (subdivIndex === 0) {
        const beat = beatIndex;
        const scheduleTime = nextBeatTimeRef.current;
        const delay = Math.max(0, (scheduleTime - ctx.currentTime) * 1000);
        setTimeout(() => {
          if (isPlayingRef.current) setCurrentBeat(beat);
        }, delay);
      }

      const secondsPerTick = 60.0 / bpmRef.current / subdivCount;
      nextBeatTimeRef.current += secondsPerTick;
      currentTickRef.current = (currentTickRef.current + 1) % totalTicks;
    }
  }, [scheduleClick, beatsPerMeasure]);

  const playTimerBeep = useCallback(() => {
    const ctx = audioCtxRef.current;
    const master = masterGainRef.current;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(master);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now + i * 0.3);
      gain.gain.setValueAtTime(0, now + i * 0.3);
      gain.gain.linearRampToValueAtTime(0.7, now + i * 0.3 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.3 + 0.2);
      osc.start(now + i * 0.3);
      osc.stop(now + i * 0.3 + 0.2);
    }
  }, []);

  const startTimer = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setTimer(prev => {
        if (!prev.enabled || prev.isFinished) return prev;
        const newRemaining = prev.remainingSeconds - 1;
        if (newRemaining <= 0) {
          playTimerBeep();
          if (prev.loop) {
            // ループ: リセットして再スタート
            return {
              ...prev,
              remainingSeconds: prev.durationMinutes * 60,
              lapCount: prev.lapCount + 1,
            };
          } else {
            return { ...prev, remainingSeconds: 0, isFinished: true };
          }
        }
        return { ...prev, remainingSeconds: newRemaining };
      });
    }, 1000);
  }, [playTimerBeep]);

  const startAutoBpm = useCallback(() => {
    if (autoBpmTimerRef.current) clearInterval(autoBpmTimerRef.current);
    autoBpmTimerRef.current = setInterval(() => {
      const auto = autoBpmRef.current;
      if (!auto.enabled) return;
      setBpmState(prev => Math.min(prev + auto.incrementAmount, auto.maxBpm));
    }, autoBpmRef.current.intervalSeconds * 1000);
  }, []);

  const acquireWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
    } catch {
      // 権限なし・非対応環境では無視
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, []);

  // ページが再表示されたとき（バックグラウンドから復帰）に再取得
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlayingRef.current) {
        acquireWakeLock();
        // バックグラウンド中に停止された場合に備えて再開
        if (audioCtxRef.current && audioCtxRef.current.state !== 'running') {
          audioCtxRef.current.resume().catch(() => {});
        }
        if (streamAudioRef.current?.paused) {
          streamAudioRef.current.play().catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [acquireWakeLock]);

  const getTickWorker = useCallback(() => {
    if (!tickWorkerRef.current) {
      const blob = new Blob([TICK_WORKER_CODE], { type: 'application/javascript' });
      tickWorkerRef.current = new Worker(URL.createObjectURL(blob));
    }
    return tickWorkerRef.current;
  }, []);

  // MediaSession ハンドラから最新の play/stop を呼ぶための参照
  const playFnRef = useRef<() => void>(() => {});
  const stopFnRef = useRef<() => void>(() => {});

  const play = useCallback(async () => {
    // Safari: バックグラウンドやサイレントスイッチONでも再生を続ける宣言
    const audioSession = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (audioSession) audioSession.type = 'playback';

    // 先に再生状態を反映（オーディオの立ち上げ中でもUIが即座に応答するように）
    isPlayingRef.current = true;
    setIsPlaying(true);

    // スリープ後は既存コンテキストが「running」を装ったまま音が出ない
    // （ゾンビ化する）ことがあり、状態からは判別できないため、再生のたびに作り直す
    try { audioCtxRef.current?.close().catch(() => {}); } catch { /* ignore */ }
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    setupAudioGraph(ctx);
    if (ctx.state !== 'running') await resumeWithTimeout(ctx);

    // 出力用メディア要素の再生を開始。play() 自体がハングすることもあるため
    // タイムアウトを設け、間に合わなければ直接出力にフォールバック
    const el = streamAudioRef.current;
    const master = masterGainRef.current;
    if (el && master) {
      const ok = await Promise.race([
        el.play().then(() => true, () => false),
        new Promise<boolean>(resolve => setTimeout(() => resolve(false), 400)),
      ]);
      if (!ok) {
        el.pause(); // 遅れて再生が始まって二重出力になるのを防ぐ
        master.disconnect();
        master.connect(ctx.destination);
      }
    }

    // 立ち上げ中に停止された場合はここで打ち切る
    if (!isPlayingRef.current) return;

    currentTickRef.current = 0;
    nextBeatTimeRef.current = ctx.currentTime + 0.05;
    const worker = getTickWorker();
    worker.onmessage = scheduler;
    worker.postMessage('start');
    setCurrentBeat(bpmRef.current > 0 ? 0 : -1);
    if (timerRef.current.enabled && !timerRef.current.isFinished) startTimer();
    if (autoBpmRef.current.enabled) startAutoBpm();
    acquireWakeLock();

    // ロック画面・コントロールセンターの再生/停止に対応
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'Metronome' });
      navigator.mediaSession.playbackState = 'playing';
      try {
        navigator.mediaSession.setActionHandler('play', () => playFnRef.current());
        navigator.mediaSession.setActionHandler('pause', () => stopFnRef.current());
      } catch { /* 非対応アクションは無視 */ }
    }
  }, [getTickWorker, setupAudioGraph, scheduler, startTimer, startAutoBpm, acquireWakeLock]);

  const stop = useCallback(() => {
    isPlayingRef.current = false;
    tickWorkerRef.current?.postMessage('stop');
    streamAudioRef.current?.pause();
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    if (autoBpmTimerRef.current) { clearInterval(autoBpmTimerRef.current); autoBpmTimerRef.current = null; }
    setIsPlaying(false);
    setCurrentBeat(-1);
    releaseWakeLock();
  }, [releaseWakeLock]);

  useEffect(() => {
    playFnRef.current = play;
    stopFnRef.current = stop;
  }, [play, stop]);

  const setBpm = useCallback((value: number) => {
    setBpmState(snapBpm(value));
  }, []);

  const adjustBpm = useCallback((delta: number) => {
    // 0 から増やす場合は最小テンポの 40 に復帰させる
    setBpmState(prev => (prev === 0 && delta > 0 ? 40 : snapBpm(prev + delta)));
  }, []);

  const setSubdivision = useCallback((value: Subdivision) => {
    setSubdivisionState(value);
    // Reset tick counter so subdivisions align with next beat
    currentTickRef.current = 0;
  }, []);

  const tapTimesRef = useRef<number[]>([]);
  const tapTempo = useCallback(() => {
    const now = performance.now();
    tapTimesRef.current.push(now);
    tapTimesRef.current = tapTimesRef.current.filter(t => now - t < 3000);
    if (tapTimesRef.current.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < tapTimesRef.current.length; i++) {
        intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setBpm(Math.round(60000 / avg));
    }
  }, [setBpm]);

  const updateTimer = useCallback((updates: Partial<TimerState>) => {
    setTimer(prev => {
      const next = { ...prev, ...updates };
      if ('durationMinutes' in updates) {
        next.remainingSeconds = (updates.durationMinutes ?? prev.durationMinutes) * 60;
        next.isFinished = false;
      }
      return next;
    });
  }, []);

  const resetTimer = useCallback(() => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    setTimer(prev => ({ ...prev, remainingSeconds: prev.durationMinutes * 60, isFinished: false }));
    if (isPlayingRef.current && timerRef.current.enabled) startTimer();
  }, [startTimer]);

  const updateAutoBpm = useCallback((updates: Partial<AutoBpmState>) => {
    setAutoBpm(prev => ({ ...prev, ...updates }));
  }, []);

  useEffect(() => {
    if (isPlaying && autoBpm.enabled) {
      if (autoBpmTimerRef.current) clearInterval(autoBpmTimerRef.current);
      startAutoBpm();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBpm.intervalSeconds, autoBpm.enabled]);

  useEffect(() => {
    if (isPlaying && timer.enabled && !timer.isFinished && !timerIntervalRef.current) {
      startTimer();
    } else if (!timer.enabled && timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.enabled]);

  return {
    isPlaying,
    bpm,
    currentBeat,
    beatsPerMeasure,
    subdivision,
    timer,
    autoBpm,
    play,
    stop,
    setBpm,
    adjustBpm,
    setSubdivision,
    tapTempo,
    updateTimer,
    resetTimer,
    updateAutoBpm,
  };
}
