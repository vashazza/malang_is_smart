import { useLiveQuery } from "dexie-react-hooks";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { db } from "../db";

// 최근 14일간의 세션 점수 추이를 일별 집계.
export default function Stats() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);

  if (!sessions) return <div className="text-slate-500">불러오는 중…</div>;
  if (sessions.length === 0) {
    return (
      <div className="text-center text-slate-500 mt-12">
        통계를 보려면 세션을 먼저 진행해주세요.
      </div>
    );
  }

  const daily = aggregateByDay(sessions, 14);
  const total = sessions.length;
  const avg = Math.round(
    sessions.reduce((a, s) => a + s.score.total, 0) / sessions.length
  );

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-2">
        <Stat label="총 세션" value={`${total}회`} />
        <Stat label="평균 점수" value={`${avg}`} />
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          일별 평균 점수 (최근 14일)
        </h2>
        <div className="rounded-xl border bg-white p-2 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="avgScore"
                stroke="#4f46e5"
                strokeWidth={2}
                dot
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">
          일별 세션 횟수
        </h2>
        <div className="rounded-xl border bg-white p-2 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#818cf8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
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

interface DayBin {
  label: string;
  count: number;
  avgScore: number;
}

function aggregateByDay(
  sessions: { startedAt: number; score: { total: number } }[],
  days: number
): DayBin[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const bins: DayBin[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today.getTime() - i * 86400000);
    const next = day.getTime() + 86400000;
    const dayS = sessions.filter(
      (s) => s.startedAt >= day.getTime() && s.startedAt < next
    );
    bins.push({
      label: `${day.getMonth() + 1}/${day.getDate()}`,
      count: dayS.length,
      avgScore:
        dayS.length === 0
          ? 0
          : Math.round(
              dayS.reduce((a, s) => a + s.score.total, 0) / dayS.length
            ),
    });
  }
  return bins;
}
