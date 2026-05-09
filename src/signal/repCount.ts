import type { SensorSample } from "../ble/types";
import type { FingerArray } from "./fingers";

// 한 사이클(쥐기 1회)의 기록.
// 사이클 검출은 5채널 평균으로 하지만, 사이클 내내 손가락별 피크/활성 시간을 함께 기록.
export interface RepCycle {
  startMs: number;
  endMs: number;
  peakMs: number;
  peakValue: number; // 5채널 평균의 피크
  holdMs: number; // 평균 신호가 임계치 이상 머문 시간

  // 손가락별 통계 (this.opts.perFingerThreshold 기준)
  perFingerPeak: FingerArray<number>;     // 사이클 동안 각 손가락의 최대 ADC
  perFingerHoldMs: FingerArray<number>;   // 각 손가락이 임계치 이상 머문 시간(ms)
}

export interface RepDetectorOptions {
  enterThreshold: number;
  exitThreshold: number;
  minHoldMs: number;
  channelReducer?: (pressures: number[]) => number;
  // 손가락별로 "이 손가락은 활성화되었다"고 볼 임계치. 보통 enter보다 살짝 낮게.
  perFingerThreshold: number;
}

export const DEFAULT_REP_OPTIONS: RepDetectorOptions = {
  enterThreshold: 1200,
  exitThreshold: 800,
  minHoldMs: 150,
  channelReducer: (p) => p.reduce((a, b) => a + b, 0) / p.length,
  perFingerThreshold: 1000,
};

export class RepDetector {
  private opts: RepDetectorOptions;
  private inGrip = false;
  private gripStart = 0;
  private peakValue = 0;
  private peakMs = 0;
  private aboveSinceMs = 0;

  // 사이클 동안 누적되는 손가락별 상태
  private fPeak: FingerArray<number> = [0, 0, 0, 0, 0];
  private fHold: FingerArray<number> = [0, 0, 0, 0, 0];
  private fAboveSince: FingerArray<number | null> = [null, null, null, null, null];

  constructor(opts: Partial<RepDetectorOptions> = {}) {
    this.opts = { ...DEFAULT_REP_OPTIONS, ...opts };
  }

  push(s: SensorSample): RepCycle | null {
    const reduce = this.opts.channelReducer!;
    const v = reduce(s.pressures);

    if (!this.inGrip && v >= this.opts.enterThreshold) {
      this.inGrip = true;
      this.gripStart = s.t;
      this.peakValue = v;
      this.peakMs = s.t;
      this.aboveSinceMs = s.t;
      this.fPeak = [0, 0, 0, 0, 0];
      this.fHold = [0, 0, 0, 0, 0];
      this.fAboveSince = [null, null, null, null, null];
      this.updatePerFinger(s);
      return null;
    }

    if (this.inGrip) {
      if (v > this.peakValue) {
        this.peakValue = v;
        this.peakMs = s.t;
      }
      this.updatePerFinger(s);

      if (v < this.opts.exitThreshold) {
        // 사이클 종료. 아직 임계치 이상으로 남은 손가락이 있다면 hold 마감.
        for (let i = 0; i < 5; i++) {
          const since = this.fAboveSince[i];
          if (since !== null) {
            this.fHold[i] += s.t - since;
            this.fAboveSince[i] = null;
          }
        }
        const holdMs = s.t - this.aboveSinceMs;
        const cycle: RepCycle = {
          startMs: this.gripStart,
          endMs: s.t,
          peakMs: this.peakMs,
          peakValue: this.peakValue,
          holdMs,
          perFingerPeak: [...this.fPeak] as FingerArray<number>,
          perFingerHoldMs: [...this.fHold] as FingerArray<number>,
        };
        this.inGrip = false;
        this.peakValue = 0;
        return holdMs >= this.opts.minHoldMs ? cycle : null;
      }
    }
    return null;
  }

  private updatePerFinger(s: SensorSample) {
    const th = this.opts.perFingerThreshold;
    for (let i = 0; i < 5; i++) {
      const v = s.pressures[i];
      if (v > this.fPeak[i]) this.fPeak[i] = v;

      const since = this.fAboveSince[i];
      if (v >= th) {
        if (since === null) this.fAboveSince[i] = s.t;
      } else {
        if (since !== null) {
          this.fHold[i] += s.t - since;
          this.fAboveSince[i] = null;
        }
      }
    }
  }

  reset() {
    this.inGrip = false;
    this.peakValue = 0;
    this.gripStart = 0;
    this.peakMs = 0;
    this.aboveSinceMs = 0;
    this.fPeak = [0, 0, 0, 0, 0];
    this.fHold = [0, 0, 0, 0, 0];
    this.fAboveSince = [null, null, null, null, null];
  }
}

export function detectReps(
  samples: SensorSample[],
  opts: Partial<RepDetectorOptions> = {}
): RepCycle[] {
  const det = new RepDetector(opts);
  const out: RepCycle[] = [];
  for (const s of samples) {
    const c = det.push(s);
    if (c) out.push(c);
  }
  return out;
}
