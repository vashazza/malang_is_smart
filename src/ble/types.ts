import type { HardnessValue, SessionModeValue } from "./uuids";

export interface SensorSample {
  seq: number;
  t: number; // ms, 앱 수신 시각 (performance.now())
  pressures: [number, number, number, number, number]; // p1..p5 raw (0~4095)
  accel: [number, number, number]; // ax, ay, az (-127~127)
  flags: number; // bit0=세션중, bit1=쥐는중, bit2-3=경도단계
}

export interface DeviceStatus {
  battery: number;
  hardness: HardnessValue;
  state: 0 | 1 | 2 | 3;
  errorCode: number;
}

export type ConnectionState =
  | { kind: "disconnected" }
  | { kind: "connecting" }
  | { kind: "connected"; deviceName: string }
  | { kind: "error"; message: string };

// 앱이 BLE 레이어와 대화할 때 쓰는 인터페이스.
export interface MallangiTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onSample(handler: (s: SensorSample) => void): () => void;
  onStatus(handler: (s: DeviceStatus) => void): () => void;
  onConnectionChange(handler: (c: ConnectionState) => void): () => void;
  startSession(mode: SessionModeValue): Promise<void>;
  stopSession(): Promise<void>;
  setHardness(level: HardnessValue): Promise<void>;
  calibrateZero(): Promise<void>;
  getConnectionState(): ConnectionState;
}

// 16바이트 SENSOR_STREAM 패킷 → SensorSample 디코더
export function decodeSensorPacket(buf: DataView, t: number): SensorSample {
  return {
    seq: buf.getUint16(0, true),
    t,
    pressures: [
      buf.getUint16(2, true),
      buf.getUint16(4, true),
      buf.getUint16(6, true),
      buf.getUint16(8, true),
      buf.getUint16(10, true),
    ],
    accel: [buf.getInt8(12), buf.getInt8(13), buf.getInt8(14)],
    flags: buf.getUint8(15),
  };
}
