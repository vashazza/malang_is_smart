import { describe, it, expect } from "vitest";
import { detectReps } from "./repCount";
import { analyzePerFinger, classifyPattern } from "./perFinger";
import type { SensorSample } from "../ble/types";
import type { FingerArray } from "./fingers";

// 합성 파형 헬퍼: n사이클, 손가락별 가중치 weights ∈ [0,1]^5
function synth(
  n: number,
  weights: FingerArray<number>,
  holdSec = 1.0,
  peak = 2400,
  base = 200
): SensorSample[] {
  const fs = 50;
  const samples: SensorSample[] = [];
  let seq = 0;
  let t = 0;
  for (let i = 0; i < n; i++) {
    const total = 0.4 + holdSec + 0.4 + 0.5;
    const cycleSamples = Math.round(total * fs);
    for (let k = 0; k < cycleSamples; k++) {
      const localT = k / fs;
      let env: number;
      if (localT < 0.4) env = localT / 0.4;
      else if (localT < 0.4 + holdSec) env = 1;
      else if (localT < 0.4 + holdSec + 0.4)
        env = 1 - (localT - 0.4 - holdSec) / 0.4;
      else env = 0;
      const pressures = weights.map((w) =>
        Math.round(base + (peak - base) * env * w)
      ) as FingerArray<number>;
      samples.push({
        seq: seq++ & 0xffff,
        t: t * 1000,
        pressures,
        accel: [0, 0, 60],
        flags: 0,
      });
      t += 1 / fs;
    }
  }
  return samples;
}

describe("analyzePerFinger", () => {
  it("균등한 풀그립은 contribution이 ~0.2씩", () => {
    const samples = synth(3, [1, 1, 1, 1, 1]);
    const cycles = detectReps(samples);
    const stats = analyzePerFinger(cycles);
    for (const c of stats.contribution) {
      expect(c).toBeGreaterThan(0.18);
      expect(c).toBeLessThan(0.22);
    }
    expect(stats.activeFingerCount).toBe(5);
  });

  it("엄지+검지만 강한 패턴은 두 손가락 contribution이 우세", () => {
    const samples = synth(3, [1, 1, 0.1, 0.1, 0.1]);
    const cycles = detectReps(samples);
    const stats = analyzePerFinger(cycles);
    const thumbIndexShare = stats.contribution[0] + stats.contribution[1];
    expect(thumbIndexShare).toBeGreaterThan(0.7);
  });

  it("한 손가락이 약한 풀그립에서 약점 손가락을 식별한다", () => {
    // 약지(idx=3)가 다른 손가락보다 절반 정도만 활성
    const samples = synth(4, [1, 1, 1, 0.45, 1]);
    const cycles = detectReps(samples);
    const stats = analyzePerFinger(cycles);
    expect(stats.weakestActiveFinger).toBe(3);
    expect(stats.activeFingerCount).toBeGreaterThanOrEqual(4);
  });

  it("사이클이 0개면 안전하게 빈 결과 반환", () => {
    const stats = analyzePerFinger([]);
    expect(stats.activeFingerCount).toBe(0);
    expect(stats.weakestActiveFinger).toBeNull();
  });
});

describe("classifyPattern", () => {
  it("균등한 풀그립을 full_grip으로 분류", () => {
    const samples = synth(3, [1, 1, 1, 1, 1]);
    const stats = analyzePerFinger(detectReps(samples));
    const c = classifyPattern(stats);
    expect(c.pattern).toBe("full_grip");
  });

  it("엄지+검지 핀치를 pinch로 분류", () => {
    const samples = synth(3, [1, 1, 0.1, 0.1, 0.1]);
    const stats = analyzePerFinger(detectReps(samples));
    const c = classifyPattern(stats);
    expect(c.pattern).toBe("pinch");
  });

  it("3손가락만 활성이면 partial_grip", () => {
    const samples = synth(3, [1, 1, 1, 0.1, 0.1]);
    const stats = analyzePerFinger(detectReps(samples));
    const c = classifyPattern(stats);
    expect(c.pattern).toBe("partial_grip");
  });

  it("아무 신호도 없으면 weak", () => {
    const c = classifyPattern(analyzePerFinger([]));
    expect(c.pattern).toBe("weak");
  });
});
