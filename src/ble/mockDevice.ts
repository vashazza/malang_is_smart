import {
  Hardness,
  SAMPLE_PERIOD_MS,
  SessionMode,
  type HardnessValue,
  type SessionModeValue,
} from "./uuids";
import { getPacing, PREP_S } from "../signal/pacing";
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
    this.setConn({ kind: "connected", deviceName: "MALLANGI" });
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

// 사용자가 쥐었다 폈다 하는 듯한 파형 (잡음 포함).
// 큰 박자는 signal/pacing.ts 의 페이서(=화면의 "쥐세요/펴세요" 가이드)에 맞추되,
// 매 반복마다 시작 시점·유지 시간·세기를 자연스럽게 흔들어서 점수가 만점에 박히지 않도록 한다.
// (목표: GRIP 데모에서 60~70 점대.)
function synthesizePressures(
  mode: SessionModeValue,
  t: number,
  hardness: HardnessValue
): [number, number, number, number, number] {
  const hardGain = 1 + hardness * 0.35; // 0:1.0, 1:1.35, 2:1.7
  const { gripS, restS } = getPacing(mode);
  const cycleS = gripS + restS;

  // "준비" 카운트다운 동안은 사용자가 아직 누르지 않은 상태 → 노이즈만.
  if (t < PREP_S) {
    return composeFingers(mode, t, 0, /*peak*/ 0, /*activeIdx*/ 0);
  }

  // 현재 t 시점에서 진행 중일 수 있는 후보 rep 들 (시작 jitter 때문에 슬롯 경계에서 겹칠 수 있음)
  const slotIdx = Math.floor((t - PREP_S) / cycleS);
  let envelope = 0;
  let activeIdx = slotIdx;
  for (const idx of [slotIdx - 1, slotIdx, slotIdx + 1]) {
    if (idx < 0) continue;
    const e = repEnvelopeAt(idx, t, cycleS, gripS);
    if (e > envelope) {
      envelope = e;
      activeIdx = idx;
    }
  }

  // 현재 활성 rep 의 진폭 (0.7~1.3 → 강도 일관성을 일부러 떨어뜨림)
  const repAmp = 0.7 + hash01(activeIdx * 1.13) * 0.6;
  // 사람이 잡고 있는 동안 손에 힘이 일정하지 않음 → peak 자체를 시간으로 출렁이게.
  const peak = 2200 * hardGain * repAmp * gripTremor(t);
  return composeFingers(mode, t, envelope, peak, activeIdx);
}

// 잡는 강도의 자연스러운 떨림.
// 느린 출렁임 (잡는 힘이 일정하지 못함) + 중간 떨림 + 빠른 미세 떨림 + 비대칭 스파이크.
// 결과 범위 대략 0.75~1.30. envelope=1 인 플라토 구간이 평탄하지 않고 위아래로 흔들려 보인다.
function gripTremor(t: number): number {
  const slow = Math.sin(t * 3.7) * 0.14;            // ±14% 느린 출렁임
  const mid = Math.sin(t * 7.3 + 1.0) * 0.09;       // ±9% 중간
  const fast = Math.sin(t * 13.1 + 2.5) * 0.05;     // ±5% 미세 떨림
  // 가끔 더 세게 쥐는 순간(positive spike). |sin|^4 → 평소엔 0 근처, 짧게 양의 봉우리.
  const surge = Math.pow(Math.max(0, Math.sin(t * 4.2 + 0.7)), 4) * 0.18;
  return 1 + slow + mid + fast + surge;
}

// 사이클 idx 의 rep 이 시점 t 에서 만들어내는 envelope 값 (0~1).
// 시작 시점과 hold 길이가 idx 기반 의사난수로 흔들림.
function repEnvelopeAt(idx: number, t: number, cycleS: number, gripS: number): number {
  const slotStart = PREP_S + idx * cycleS;
  // 슬롯 안에서 시작 시점 ±20% 흔들림 → 사람의 박자 불규칙성 흉내.
  // 단, 첫 rep(idx=0)이 음수 jitter 로 PREP 경계(t=PREP_S) 안쪽으로 들어가면
  // PREP 동안 envelope이 강제로 0 으로 막혀 t=PREP_S 순간 rise 중간값부터 튀어오름 →
  // 첫 rep 만 jitter 없이 정확히 cue "쥐세요" 시점에 맞춤. 사용자가 첫 박자엔 집중하니 자연스러움.
  const startJitter = idx === 0 ? 0 : (hash01(idx * 7.1) - 0.5) * 0.4 * cycleS;
  const repStart = slotStart + startJitter;
  // hold 길이 0.45~0.85 × gripS (사용자가 매번 3초 풀로 못 잡음)
  const repHold = gripS * (0.45 + hash01(idx * 5.1) * 0.4);
  const rise = gripS * 0.1;
  const fall = gripS * 0.1;
  const rt = t - repStart;
  if (rt < 0) return 0;
  if (rt < rise) return rt / rise;
  if (rt < rise + repHold) return 1;
  if (rt < rise + repHold + fall) return 1 - (rt - rise - repHold) / fall;
  return 0;
}

// envelope · peak · 손가락 비중 · 노이즈 합성. synthesizePressures 의 끝부분을 분리.
function composeFingers(
  mode: SessionModeValue,
  t: number,
  envelope: number,
  peak: number,
  activeIdx: number,
): [number, number, number, number, number] {
  const baseDrift = 200 + Math.sin(t * 0.13) * 35; // 천천히 출렁이는 베이스라인

  const finger = (offset: number, weight: number) => {
    // 손가락별 비중도 매 반복마다 살짝 흔들림 (특정 손가락만 약하게 잡는 등)
    const weightJitter = 1 + (hash01(activeIdx * 5.7 + offset) - 0.5) * 0.3; // ±15%
    const noise = (Math.random() - 0.5) * 260;
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
