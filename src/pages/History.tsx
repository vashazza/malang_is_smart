import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { SessionMode } from "../ble";
import type { SessionModeValue } from "../ble/uuids";

export default function History() {
  const sessions = useLiveQuery(
    () => db.sessions.orderBy("startedAt").reverse().toArray(),
    []
  );

  if (!sessions) return <div className="text-slate-500">불러오는 중…</div>;
  if (sessions.length === 0) {
    return (
      <div className="text-center text-slate-500 mt-12">
        <p>아직 세션 기록이 없습니다.</p>
        <Link to="/" className="text-indigo-600 underline text-sm mt-2 inline-block">
          홈에서 세션 시작
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <Link
          key={s.id}
          to={`/result/${s.id}`}
          className="block rounded-xl border bg-white p-3"
        >
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm font-medium">
                {modeLabel(s.mode)} · {s.repCount}회
              </div>
              <div className="text-xs text-slate-500">
                {formatDate(s.startedAt)}
              </div>
            </div>
            <div
              className={`text-2xl font-bold ${scoreColor(s.score.total)}`}
            >
              {s.score.total}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function modeLabel(m: SessionModeValue) {
  return m === SessionMode.GRIP ? "쥐기" : m === SessionMode.RHYTHM ? "리듬" : "핀치";
}

function formatDate(ms: number) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

function scoreColor(score: number) {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  return "text-red-500";
}
