import { MockMallangiDevice } from "./mockDevice";
import { WebBluetoothMallangiDevice } from "./webBluetooth";
import type { MallangiTransport } from "./types";

// 모드 결정 우선순위 (재시작 없이 토글하기 위함):
//   1. URL 쿼리 ?mock=1 / ?mock=0  (브라우저 주소창에서 즉시 전환, 가장 강함)
//   2. localStorage["mallangi.useMock"]  ("true"|"false", 한 번 설정해두면 유지)
//   3. 환경변수 VITE_USE_MOCK_BLE       (기본값, dev 서버 재시작 필요)
//   4. 위 셋 다 없으면 true (Mock)
function resolveUseMock(): boolean {
  if (typeof window !== "undefined") {
    const param = new URLSearchParams(window.location.search).get("mock");
    if (param === "1" || param === "true") return true;
    if (param === "0" || param === "false") return false;

    try {
      const stored = window.localStorage.getItem("mallangi.useMock");
      if (stored === "true") return true;
      if (stored === "false") return false;
    } catch {
      // private mode 등으로 localStorage 막혀있으면 무시
    }
  }
  return (import.meta.env.VITE_USE_MOCK_BLE ?? "true") !== "false";
}

const USE_MOCK = resolveUseMock();

// DEBUG: 어떤 소스 때문에 어떤 모드로 결정됐는지 콘솔에 출력. 진단 끝나면 제거.
if (typeof window !== "undefined") {
  console.log(
    "[BLE] USE_MOCK =", USE_MOCK,
    "| ?mock =", new URLSearchParams(window.location.search).get("mock"),
    "| localStorage =", window.localStorage.getItem("mallangi.useMock"),
    "| env =", import.meta.env.VITE_USE_MOCK_BLE,
  );
}

let instance: MallangiTransport | null = null;

export function getTransport(): MallangiTransport {
  if (instance) return instance;
  instance = USE_MOCK
    ? new MockMallangiDevice()
    : new WebBluetoothMallangiDevice();
  console.log("[BLE] transport instance =", instance.constructor.name);
  return instance;
}

export type { MallangiTransport, SensorSample, DeviceStatus, ConnectionState } from "./types";
export {
  Hardness,
  SessionMode,
  type HardnessValue,
  type SessionModeValue,
} from "./uuids";
