import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { db } from "../db";
import { Hardness } from "../ble";
import { FINGERS } from "../signal/fingers";
import { patternLabel, type GripPattern } from "../signal/perFinger";

export default function Result() {
  const { id } = useParams();
  const numId = Number(id);
  const session = useLiveQuery(() => db.sessions.get(numId), [numId]);

  // 운동한 고유 날짜 수 (같은 날 여러 세션은 1일로 카운트)
  const allStartedAt = useLiveQuery(
    () => db.sessions.toArray().then((all) => all.map((s) => s.startedAt)),
    [],
  );
  const dayCount = useMemo(() => {
    if (!allStartedAt) return 0;
    const days = new Set(allStartedAt.map((ts) => new Date(ts).toDateString()));
    return days.size;
  }, [allStartedAt]);

  // 결과 페이지 진입 시 한 번만 띄움. 4초 후 자동 닫힘 + 탭하면 즉시 닫힘.
  const [showCheer, setShowCheer] = useState(true);
  useEffect(() => {
    if (!showCheer) return;
    const t = window.setTimeout(() => setShowCheer(false), 4000);
    return () => window.clearTimeout(t);
  }, [showCheer]);

  if (!session) return <div className="text-slate-500">불러오는 중…</div>;

  // v1으로 저장된 옛날 세션 호환
  const perFinger = session.perFinger;
  const hasFingerData = !!perFinger && perFinger.avgPeak.some((v) => v > 0);

  // 5채널 파형을 시간축에 함께 표시
  const fingerChartData = (session.fingerWaveforms?.[0] ?? []).map((_, i) => {
    const point: { i: number } & Record<string, number> = { i };
    FINGERS.forEach((f) => {
      point[`p${f.idx}`] = session.fingerWaveforms?.[f.idx]?.[i] ?? 0;
    });
    return point;
  });

  const fingerBarData = hasFingerData
    ? FINGERS.map((f) => ({
        name: f.short,
        peak: Math.round(perFinger.avgPeak[f.idx]),
        contribution: Math.round(perFinger.contribution[f.idx] * 100),
        color: f.color,
        idx: f.idx,
      }))
    : [];

  return (
    <div className="space-y-4">
      {showCheer && dayCount > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={() => setShowCheer(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl px-8 py-7 text-center max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-6xl mb-3" aria-hidden>
              👏
            </div>
            <div className="text-xl font-bold text-slate-900">
              {dayCount}일째 운동했어요!
            </div>
            <div className="text-sm text-slate-500 mt-1">잘했어요</div>
            <button
              onClick={() => setShowCheer(false)}
              className="mt-4 text-xs text-slate-400"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      <section className="rounded-xl bg-indigo-50 p-4 text-center">
        <div className="text-sm text-indigo-700 mb-1">총점</div>
        <div className="text-5xl font-bold text-indigo-900">
          {session.score.total}
        </div>
        <div className="text-xs text-indigo-600 mt-1">/ 100</div>
      </section>

      {hasFingerData && (
        <section className="rounded-xl bg-white border p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-slate-500">감지된 운동 패턴</div>
            <div className="text-xs text-slate-400">
              신뢰도 {(session.patternConfidence * 100).toFixed(0)}%
            </div>
          </div>
          <PatternBadge pattern={session.pattern} />
          {perFinger.weakestActiveFinger !== null && (
            <div className="text-xs text-slate-600 mt-2">
              <span className="font-semibold">약한 손가락: </span>
              <span style={{ color: FINGERS[perFinger.weakestActiveFinger].color }}>
                {FINGERS[perFinger.weakestActiveFinger].name}
              </span>
              <span className="text-slate-400">
                {" "}
                (활성 {(perFinger.relativeActivity[perFinger.weakestActiveFinger] * 100).toFixed(0)}%)
              </span>
            </div>
          )}
        </section>
      )}

      <section className="grid grid-cols-3 gap-2">
        <SubScore label="유지" value={session.score.holdScore} />
        <SubScore label="리듬" value={session.score.rhythmScore} />
        <SubScore label="강도" value={session.score.intensityScore} />
      </section>

      {hasFingerData && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 mb-2">
            손가락별 평균 피크
          </h2>
          <div className="rounded-xl border bg-white p-2 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fingerBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 4095]} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: unknown) => `${value} ADC`} />
                <Bar dataKey="peak">
                  {fingerBarData.map((d) => (
                    <Cell key={d.idx} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-slate-500 mt-1 text-center">
            기여도(%):{" "}
            {fingerBarData
              .map((d) => `${d.name} ${d.contribution}%`)
              .join(" · ")}
          </div>
        </section>
      )}

      {fingerChartData.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-700 mb-2">
            5채널 파형
          </h2>
          <div className="rounded-xl border bg-white p-2 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fingerChartData}>
                <XAxis dataKey="i" hide />
                <YAxis domain={[0, 4095]} hide />
                {FINGERS.map((f) => (
                  <Line
                    key={f.key}
                    type="monotone"
                    dataKey={`p${f.idx}`}
                    stroke={f.color}
                    dot={false}
                    strokeWidth={1.5}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <FingerLegend />
        </section>
      )}

      <section className="rounded-xl bg-white border p-3 text-sm space-y-1">
        <Row k="반복 횟수" v={`${session.repCount}회`} />
        <Row k="총 시간" v={formatDuration(session.totalDurationMs)} />
        <Row k="이번 경도" v={hardnessLabel(session.hardness)} />
        <Row
          k="다음 추천 경도"
          v={hardnessLabel(session.nextHardness)}
          highlight={session.nextHardness !== session.hardness}
        />
      </section>

      <Link
        to="/"
        className="block w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold text-center"
      >
        홈으로
      </Link>
    </div>
  );
}

function PatternBadge({ pattern }: { pattern: GripPattern }) {
  const color =
    pattern === "full_grip"
      ? "bg-green-100 text-green-700"
      : pattern === "pinch"
      ? "bg-blue-100 text-blue-700"
      : pattern === "partial_grip"
      ? "bg-yellow-100 text-yellow-700"
      : "bg-slate-100 text-slate-500";
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${color}`}
    >
      {patternLabel(pattern)}
    </span>
  );
}

function FingerLegend() {
  return (
    <div className="flex justify-center gap-3 mt-1 flex-wrap">
      {FINGERS.map((f) => (
        <span key={f.key} className="text-xs flex items-center gap-1">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: f.color }}
          />
          {f.name}
        </span>
      ))}
    </div>
  );
}

function SubScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white border p-2 text-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900">{value}</div>
    </div>
  );
}

function Row({
  k,
  v,
  highlight,
}: {
  k: string;
  v: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{k}</span>
      <span className={highlight ? "font-semibold text-indigo-700" : ""}>{v}</span>
    </div>
  );
}

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}분 ${s % 60}초`;
}

function hardnessLabel(h: number) {
  return h === Hardness.EASY ? "쉬움" : h === Hardness.NORMAL ? "보통" : "어려움";
}
