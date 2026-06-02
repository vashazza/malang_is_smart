import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getTransport, Hardness, type HardnessValue } from "../ble";
import type { ConnectionState } from "../ble/types";
import { getStoredHardness, setStoredHardness } from "../db/prefs";

export default function Home() {
  const [conn, setConn] = useState<ConnectionState>({ kind: "disconnected" });
  const [hardness, setHardness] = useState<HardnessValue>(() => getStoredHardness());
  const transport = getTransport();

  useEffect(() => transport.onConnectionChange(setConn), [transport]);

  // 연결되면 저장된 경도를 기기에 한 번 동기화 (Home 진입 시점에 이미 연결된 경우)
  useEffect(() => {
    if (conn.kind === "connected") {
      transport.setHardness(hardness).catch(console.error);
    }
  }, [conn.kind, hardness, transport]);

  const handleConnect = async () => {
    try {
      await transport.connect();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDisconnect = () => transport.disconnect();

  const handlePickHardness = (h: HardnessValue) => {
    setHardness(h);
    setStoredHardness(h);
    transport.setHardness(h).catch(console.error);
  };

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
        <h2 className="text-sm font-semibold text-slate-700 mb-2">경도</h2>
        <div className="grid grid-cols-3 gap-2">
          <HardnessButton
            label="쉬움"
            hint="가볍게"
            selected={hardness === Hardness.EASY}
            onClick={() => handlePickHardness(Hardness.EASY)}
          />
          <HardnessButton
            label="보통"
            hint="기본"
            selected={hardness === Hardness.NORMAL}
            onClick={() => handlePickHardness(Hardness.NORMAL)}
          />
          <HardnessButton
            label="어려움"
            hint="단단하게"
            selected={hardness === Hardness.HARD}
            onClick={() => handlePickHardness(Hardness.HARD)}
          />
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

function HardnessButton({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`py-3 rounded-lg border text-center transition-colors ${
        selected
          ? "bg-indigo-600 border-indigo-600 text-white"
          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
      }`}
    >
      <div className="font-medium">{label}</div>
      <div
        className={`text-xs mt-0.5 ${
          selected ? "text-indigo-100" : "text-slate-400"
        }`}
      >
        {hint}
      </div>
    </button>
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
