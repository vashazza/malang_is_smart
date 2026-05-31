import {
  Hardness,
  SAMPLE_PERIOD_MS,
  SessionMode,
  type HardnessValue,
  type SessionModeValue,
} from "./uuids";
import type {
  ConnectionState,
  DeviceStatus,
  MallangiTransport,
  SensorSample,
} from "./types";

// 가짜 기기. 50Hz로 사람이 말랑이를 쥐는 것처럼 보이는 압력 파형을 생성.
// 하드웨어 완성 전까지 앱 UI/신호처리/DB를 모두 진짜처럼 개발 가능.
export class MockMallangiDevice implements MallangiTransport {
  private connection: ConnectionState = { kind: "disconnected" };
  private status: DeviceStatus = {
    battery: 87,
    hardness: Hardness.NORMAL,
    state: 0,
    errorCode: 0,
  };
  private sampleHandlers = new Set<(s: SensorSample) => void>();
  private statusHandlers = new Set<(s: DeviceStatus) => void>();
  private connHandlers = new Set<(c: ConnectionState) => void>();

  private timer: number | null = null;
  private seq = 0;
  private startTime = 0;
  private mode: SessionModeValue = SessionMode.GRIP;
  private inSession = false;

  async connect(): Promise<void> {
    this.setConn({ kind: "connecting" });
    await delay(400);
    this.setConn({ kind: "connected", deviceName: "MALLANGI-MOCK" });
    this.emitStatus();
  }

  async disconnect(): Promise<void> {
    this.stopTimer();
    this.inSession = false;
    this.setConn({ kind: "disconnected" });
  }

  onSample(h: (s: SensorSample) => void): () => void {
    this.sampleHandlers.add(h);
    return () => this.sampleHandlers.delete(h);
  }

  onStatus(h: (s: DeviceStatus) => void): () => void {
    this.statusHandlers.add(h);
    return () => this.statusHandlers.delete(h);
  }

  onConnectionChange(h: (c: ConnectionState) => void): () => void {
    this.connHandlers.add(h);
    h(this.connection);
    return () => this.connHandlers.delete(h);
  }

  async startSession(mode: SessionModeValue): Promise<void> {
    this.mode = mode;
    this.seq = 0;
    this.startTime = performance.now();
    this.inSession = true;
    this.status = { ...this.status, state: 1 };
    this.emitStatus();
    this.startTimer();
  }

  async stopSession(): Promise<void> {
    this.stopTimer();
    this.inSession = false;
    this.status = { ...this.status, state: 0 };
    this.emitStatus();
  }

  async setHardness(level: HardnessValue): Promise<void> {
    this.status = { ...this.status, hardness: level };
    this.emitStatus();
  }

  async calibrateZero(): Promise<void> {
    await delay(200);
  }

  getConnectionState(): ConnectionState {
    return this.connection;
  }

  // ---- 내부 ----
  private setConn(c: ConnectionState) {
    this.connection = c;
    this.connHandlers.forEach((h) => h(c));
  }

  private emitStatus() {
    this.statusHandlers.forEach((h) => h(this.status));
  }

  private startTimer() {
    this.stopTimer();
    this.timer = window.setInterval(() => this.tick(), SAMPLE_PERIOD_MS);
  }

  private stopTimer() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick() {
    const now = performance.now();
    const t = (now - this.startTime) / 1000; // 초

    // 모드별 가짜 파형 생성
    const pressures = synthesizePressures(this.mode, t, this.status.hardness);
    const accel: [number, number, number] = [
      Math.round(Math.sin(t * 1.7) * 4),
      Math.round(Math.cos(t * 1.3) * 3),
      Math.round(60 + Math.sin(t * 0.5) * 2), // 중력 ~60
    ];
    const gripping = pressures[1] + pressures[2] > 1500 ? 1 : 0;
    const flags =
      (this.inSession ? 1 : 0) |
      (gripping << 1) |
      (this.status.hardness << 2);

    const sample: SensorSample = {
      seq: this.seq++ & 0xffff,
      t: now,
      pressures,
      accel,
      flags,
    };
    this.sampleHandlers.forEach((h) => h(sample));
  }
}

// 사용자가 ~1.5초 주기로 쥐었다 폈다 하는 듯한 파형 (잡음 포함).
// 사람 손은 매번 정확히 같지 않으므로 매 반복마다 세기·타이밍·손가락 비중을
// 자연스럽게 흔들어 데모가 "기계적"으로 보이지 않게 한다.
// 경도가 높을수록 같은 동작에서 더 큰 ADC 값이 나오도록 모델링.
function synthesizePressures(
  mode: SessionModeValue,
  t: number,
  hardness: HardnessValue
): [number, number, number, number, number] {
  const hardGain = 1 + hardness * 0.35; // 0:1.0, 1:1.35, 2:1.7
  const basePeriod = mode === SessionMode.RHYTHM ? 0.8 : 1.5;

  // 반복 인덱스 기준 의사난수 → 같은 반복 내에선 안정, 반복마다 다름
  // (rep을 길이로 누적해서 계산해야 period가 흔들려도 인덱스가 맞아떨어짐)
  const repIdx = Math.floor(t / basePeriod);
  const repAmp = 0.65 + hash01(repIdx * 1.13) * 0.45;          // 0.65~1.10 (가끔 약하게/세게)
  const repPeriod = basePeriod * (0.85 + hash01(repIdx * 2.7) * 0.3); // ±15% 타이밍 흔들림
  const repHoldEnd = 0.55 + hash01(repIdx * 3.9) * 0.25;       // 유지 구간 길이 변화
  const repStart = repIdx * basePeriod;
  const phase = Math.min(1, (t - repStart) / repPeriod);

  // 포락선: 상승(0~0.5) → 유지(0.5~repHoldEnd) → 풀기(~1.0)
  let envelope: number;
  if (phase < 0.5) envelope = phase / 0.5;
  else if (phase < repHoldEnd) envelope = 1;
  else envelope = Math.max(0, 1 - (phase - repHoldEnd) / Math.max(0.1, 1 - repHoldEnd));

  const baseDrift = 200 + Math.sin(t * 0.13) * 35; // 천천히 출렁이는 베이스라인
  const peak = 2200 * hardGain * repAmp;

  const finger = (offset: number, weight: number) => {
    // 손가락별 비중도 매 반복마다 살짝 흔들림 (특정 손가락만 약하게 잡는 등)
    const weightJitter = 1 + (hash01(repIdx * 5.7 + offset) - 0.5) * 0.3; // ±15%
    const noise = (Math.random() - 0.5) * 180;
    return Math.max(
      0,
      Math.min(
        4095,
        Math.round(
          baseDrift
          + envelope * peak * weight * weightJitter
          + Math.sin(t * 6 + offset) * 30
          + noise
        )
      )
    );
  };

  if (mode === SessionMode.PINCH) {
    // 핀치: 엄지(p1)+검지(p2)만 활성, 나머지는 약함 (소지 거의 0)
    return [finger(0, 1.0), finger(1, 0.9), finger(2, 0.15), finger(3, 0.08), finger(4, 0.04)];
  }
  // GRIP, RHYTHM: 다섯 손가락 모두 활성, 검지/중지가 가장 강, 소지는 확연히 약함
  return [finger(0, 0.7), finger(1, 1.0), finger(2, 0.95), finger(3, 0.6), finger(4, 0.3)];
}

// 결정론적 의사난수: 같은 입력엔 같은 출력 (반복 내 안정, 반복 간 다양).
function hash01(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
