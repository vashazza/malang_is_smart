import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getTransport } from "../ble";
import type { ConnectionState } from "../ble/types";

export default function Home() {
  const [conn, setConn] = useState<ConnectionState>({ kind: "disconnected" });
  const transport = getTransport();

  useEffect(() => transport.onConnectionChange(setConn), [transport]);

  const handleConnect = async () => {
    try {
      await transport.connect();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDisconnect = () => transport.disconnect();

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-indigo-50 p-4">
        <h2 className="text-base font-semibold text-indigo-900 mb-2">
          기기 연결 상태
        </h2>
        <ConnectionPill state={conn} />
        <div className="mt-3 flex gap-2">
          {conn.kind === "connected" ? (
            <button
              onClick={handleDisconnect}
              className="flex-1 py-2 rounded-lg border border-slate-300 bg-white text-slate-700"
            >
              연결 해제
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={conn.kind === "connecting"}
              className="flex-1 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50"
            >
              {conn.kind === "connecting" ? "연결 중…" : "기기 연결"}
            </button>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">운동 시작</h2>
        <div className="space-y-2">
          <Link
            to="/session?mode=grip"
            className="block px-4 py-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
          >
            <div className="font-medium">쥐기 운동</div>
            <div className="text-xs text-slate-500">
              5초 유지 × 10회 — 다섯 손가락 모두 사용
            </div>
          </Link>
          <Link
            to="/session?mode=rhythm"
            className="block px-4 py-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
          >
            <div className="font-medium">리듬 운동</div>
            <div className="text-xs text-slate-500">
              1초 간격 빠른 반복 × 30회
            </div>
          </Link>
          <Link
            to="/session?mode=pinch"
            className="block px-4 py-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
          >
            <div className="font-medium">핀치 운동</div>
            <div className="text-xs text-slate-500">엄지-검지 정밀 집기 × 15회</div>
          </Link>
        </div>
      </section>

    </div>
  );
}

function ConnectionPill({ state }: { state: ConnectionState }) {
  if (state.kind === "connected") {
    return (
      <div className="text-sm">
        <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2" />
        연결됨 — {state.deviceName}
      </div>
    );
  }
  if (state.kind === "connecting") {
    return (
      <div className="text-sm">
        <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-2 animate-pulse" />
        연결 중…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="text-sm text-red-600">
        <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-2" />
        오류: {state.message}
      </div>
    );
  }
  return (
    <div className="text-sm text-slate-500">
      <span className="inline-block w-2 h-2 rounded-full bg-slate-400 mr-2" />
      연결되지 않음
    </div>
  );
}
