import { MockMallangiDevice } from "./mockDevice";
import { WebBluetoothMallangiDevice } from "./webBluetooth";
import type { MallangiTransport } from "./types";

// 토글: 하드웨어 연결 시 false로 바꾸면 진짜 BLE 사용.
// 운영 시엔 환경변수(import.meta.env.VITE_USE_MOCK_BLE)로 전환 권장.
const USE_MOCK = (import.meta.env.VITE_USE_MOCK_BLE ?? "true") !== "false";

let instance: MallangiTransport | null = null;

export function getTransport(): MallangiTransport {
  if (instance) return instance;
  instance = USE_MOCK
    ? new MockMallangiDevice()
    : new WebBluetoothMallangiDevice();
  return instance;
}

export type { MallangiTransport, SensorSample, DeviceStatus, ConnectionState } from "./types";
export {
  Hardness,
  SessionMode,
  type HardnessValue,
  type SessionModeValue,
} from "./uuids";
