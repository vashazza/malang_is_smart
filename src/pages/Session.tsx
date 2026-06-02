import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { getTransport, SessionMode } from "../ble";
import type { SensorSample } from "../ble/types";
import type { SessionModeValue } from "../ble/uuids";
import { RepDetector, type RepCycle } from "../signal/repCount";
import { scoreSession, suggestNextHardness } from "../signal/score";
import { analyzePerFinger, classifyPattern } from "../signal/perFinger";
import { FINGERS, type FingerArray } from "../signal/fingers";
import { getPacing, PREP_S } from "../signal/pacing";
import { getStoredHardness } from "../db/prefs";
import { db, downsample } from "../db";

const MODE_FROM_QUERY: Record<string, SessionModeValue> = {
  grip: SessionMode.GRIP,
  rhythm: SessionMode.RHYTHM,
  pinch: SessionMode.PINCH,
};

// 차트에 표시할 포인트: { t, p0, p1, p2, p3, p4 }
type ChartPoint = { t: number } & Record<`p${0 | 1 | 2 | 3 | 4}`, number>;

export default function Session() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = MODE_FROM_QUERY[params.get("mode") ?? "grip"] ?? SessionMode.GRIP;

  const transport = useMemo(() => getTransport(), []);
  const [running, setRunning] = useState(false);
  const [reps, setReps] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [chart, setChart] = useState<ChartPoint[]>([]);
  // 현재 순간의 손가락별 활성도 (시각적 피드백용)
  const [liveFingers, setLiveFingers] = useState<FingerArray<number>>([
    0, 0, 0, 0, 0,
  ]);

  const startTimeRef = useRef<number | null>(null);
  const detectorRef = useRef(new RepDetector());
  const cyclesRef = useRef<RepCycle[]>([]);
  const allSamplesRef = useRef<SensorSample[]>([]);
  const recentRef = useRef<ChartPoint[]>([]);
  const liveRef = useRef<FingerArray<number>>([0, 0, 0, 0, 0]);

  // 샘플 구독
  useEffect(() => {
    return transport.onSample((s) => {
      if (!running) return;
      allSamplesRef.current.push(s);

      const point: ChartPoint = {
        t: s.t,
        p0: s.pressures[0],
        p1: s.pressures[1],
        p2: s.pressures[2],
        p3: s.pressures[3],
        p4: s.pressures[4],
      };
      recentRef.current.push(point);
      // 최근 4초 (50Hz × 4 = 200 포인트)
      if (recentRef.current.length > 200) recentRef.current.shift();

      liveRef.current = [...s.pressures] as FingerArray<number>;

      const cycle = detectorRef.current.push(s);
      if (cycle) {
        cyclesRef.current.push(cycle);
        setReps(cyclesRef.current.length);
      }
    });
  }, [transport, running]);

  // 차트 갱신은 10Hz (50Hz로 setState하면 React 버벅임)
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setChart([...recentRef.current]);
      setLiveFingers([...liveRef.current] as FingerArray<number>);
      if (startTimeRef.current !== null) {
        setElapsedMs(performance.now() - startTimeRef.current);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [running]);

  const handleStart = async () => {
    if (transport.getConnectionState().kind !== "connected") {
      try {
        await transport.connect();
      } catch {
        alert("기기 연결 실패. 홈에서 먼저 연결해주세요.");
        return;
      }
    }
    detectorRef.current.reset();
    cyclesRef.current = [];
    allSamplesRef.current = [];
    recentRef.current = [];
    liveRef.current = [0, 0, 0, 0, 0];
    setReps(0);
    setElapsedMs(0);
    setChart([]);
    setLiveFingers([0, 0, 0, 0, 0]);
    startTimeRef.current = performance.now();
    await transport.startSession(mode);
    setRunning(true);
  };

  const handleStop = async () => {
    setRunning(false);
    await transport.stopSession();

    const cycles = cyclesRef.current;
    const score = scoreSession(cycles);
    const perFinger = analyzePerFinger(cycles);
    const classification = classifyPattern(perFinger);

    const samples = allSamplesRef.current;
    const avgWaveform = samples.map(
      (s) => s.pressures.reduce((a, b) => a + b, 0) / s.pressures.length
    );
    const fingerWaveforms: FingerArray<number[]> = [
      downsample(samples.map((s) => s.pressures[0]), 300),
      downsample(samples.map((s) => s.pressures[1]), 300),
      downsample(samples.map((s) => s.pressures[2]), 300),
      downsample(samples.map((s) => s.pressures[3]), 300),
      downsample(samples.map((s) => s.pressures[4]), 300),
    ];
    const startedAt = Date.now() - elapsedMs;
    const currentHardness = getStoredHardness();
    const nextHardness = suggestNextHardness(currentHardness, score);

    const id = await db.sessions.add({
      startedAt,
      endedAt: Date.now(),
      mode,
      hardness: currentHardness,
      repCount: cycles.length,
      totalDurationMs: elapsedMs,
      score,
      waveform: downsample(avgWaveform, 300),
      fingerWaveforms,
      cycles,
      perFinger,
      pattern: classification.pattern,
      patternConfidence: classification.confidence,
      nextHardness,
    });
    navigate(`/result/${id}`);
  };

  return (
    <div className="space-y-4">
      {running && <Cue elapsedMs={elapsedMs} mode={mode} />}

      <div className="grid grid-cols-2 gap-3">
        <Stat label="반복 횟수" value={`${reps}회`} />
        <Stat label="경과 시간" value={formatTime(elapsedMs)} />
      </div>

      {/* 5채널 실시간 파형 */}
      <div className="rounded-xl bg-white border p-2 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart}>
            <XAxis dataKey="t" hide />
            <YAxis domain={[0, 4095]} hide />
            {FINGERS.map((f) => (
              <Line
                key={f.key}
                type="monotone"
                dataKey={`p${f.idx}`}
                stroke={f.color}
                dot={false}
                isAnimationActive={false}
                strokeWidth={1.5}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 5개 손가락 라이브 게이지 */}
      <div className="rounded-xl bg-white border p-3">
        <div className="text-xs text-slate-500 mb-2">손가락별 압력</div>
        <div className="grid grid-cols-5 gap-2">
          {FINGERS.map((f) => (
            <FingerGauge
              key={f.key}
              label={f.short}
              color={f.color}
              value={liveFingers[f.idx]}
            />
          ))}
        </div>
      </div>

      <div>
        {!running ? (
          <button
            onClick={handleStart}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold"
          >
            세션 시작
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="w-full py-3 rounded-xl bg-red-500 text-white font-semibold"
          >
            세션 종료
          </button>
        )}
      </div>

      <p className="text-xs text-slate-400 text-center">
        모드: {modeLabel(mode)} · {running ? "측정 중" : "대기"}
      </p>
    </div>
  );
}

// 세션 중 "쥐세요 / 펴세요" 페이서. 사용자가 따라하면 자연스럽게 점수 target에 맞춰짐.
//   준비 PREP_S초 카운트다운 → (쥐기 → 풀기) 반복.
//   모드별 쥐기·풀기 길이는 signal/pacing.ts 에서 단일 정의 (mock 합성기도 동일 사용).
function Cue({
  elapsedMs,
  mode,
}: {
  elapsedMs: number;
  mode: SessionModeValue;
}) {
  const { gripS, restS } = getPacing(mode);
  const t = elapsedMs / 1000;

  // 채움색 = 흘러간 시간, 잔여색 = 남은 시간. 좌→우로 자연스럽게 채워짐.
  type Phase = {
    kind: "prep" | "grip" | "rest";
    label: string;
    emoji: string;
    textClass: string;
    filledHex: string;
    remainingHex: string;
    remaining: number;
    total: number;
  };

  let phase: Phase;
  if (t < PREP_S) {
    phase = {
      kind: "prep",
      label: "준비",
      emoji: "⏳",
      textClass: "text-slate-700",
      filledHex: "#cbd5e1", // slate-300
      remainingHex: "#e2e8f0", // slate-200
      remaining: PREP_S - t,
      total: PREP_S,
    };
  } else {
    const inCycle = (t - PREP_S) % (gripS + restS);
    if (inCycle < gripS) {
      phase = {
        kind: "grip",
        label: "쥐세요",
        emoji: "✊",
        textClass: "text-white",
        filledHex: "#4338ca", // indigo-700
        remainingHex: "#818cf8", // indigo-400
        remaining: gripS - inCycle,
        total: gripS,
      };
    } else {
      phase = {
        kind: "rest",
        label: "펴세요",
        emoji: "🖐️",
        textClass: "text-white",
        filledHex: "#059669", // emerald-600
        remainingHex: "#6ee7b7", // emerald-300
        remaining: gripS + restS - inCycle,
        total: restS,
      };
    }
  }

  const progressPct = Math.min(
    100,
    Math.max(0, (1 - phase.remaining / phase.total) * 100),
  );

  return (
    <div
      className={`rounded-xl p-4 text-center ${phase.textClass}`}
      style={{
        background: `linear-gradient(to right, ${phase.filledHex} 0%, ${phase.filledHex} ${progressPct}%, ${phase.remainingHex} ${progressPct}%, ${phase.remainingHex} 100%)`,
      }}
    >
      <div className="text-4xl mb-1" aria-hidden>
        {phase.emoji}
      </div>
      <div className="text-2xl font-bold tracking-wide">{phase.label}</div>
      <div className="text-sm opacity-80 mt-0.5">
        {Math.ceil(phase.remaining).toString()}초
      </div>
    </div>
  );
}

function FingerGauge({
  label,
  color,
  value,
}: {
  label: string;
  color: string;
  value: number;
}) {
  const pct = Math.max(0, Math.min(100, (value / 4095) * 100));
  return (
    <div className="text-center">
      <div className="h-20 w-full bg-slate-100 rounded-md overflow-hidden flex items-end">
        <div
          className="w-full transition-all duration-100"
          style={{ height: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="text-xs mt-1" style={{ color }}>
        {label}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white border p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

function modeLabel(m: SessionModeValue): string {
  return m === SessionMode.GRIP ? "쥐기" : m === SessionMode.RHYTHM ? "리듬" : "핀치";
}
