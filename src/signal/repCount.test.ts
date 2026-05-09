import { describe, it, expect } from "vitest";
import { detectReps } from "./repCount";
import type { SensorSample } from "../ble/types";

// 합성 파형: 50Hz, n사이클 쥐기. 각 사이클 = 0.4초 상승 + holdSec 유지 + 0.4초 하강.
function synth(n: number, holdSec: number, peak = 2400, base = 200) {
  const fs = 50;
  const samples: SensorSample[] = [];
  let seq = 0;
  let t = 0;
  for (let i = 0; i < n; i++) {
    const total = 0.4 + holdSec + 0.4 + 0.5; // 사이클 + 0.5초 휴식
    const cycleSamples = Math.round(total * fs);
    for (let k = 0; k < cycleSamples; k++) {
      const localT = k / fs;
      let v: number;
      if (localT < 0.4) v = base + (peak - base) * (localT / 0.4);
      else if (localT < 0.4 + holdSec) v = peak;
      else if (localT < 0.4 + holdSec + 0.4)
        v = peak - (peak - base) * ((localT - 0.4 - holdSec) / 0.4);
      else v = base;
      samples.push({
        seq: seq++ & 0xffff,
        t: t * 1000,
        pressures: [v, v, v, v, v],
        accel: [0, 0, 60],
        flags: 0,
      });
      t += 1 / fs;
    }
  }
  return samples;
}

describe("detectReps", () => {
  it("3회 쥐기를 정확히 검출한다", () => {
    const samples = synth(3, 1.0);
    const cycles = detectReps(samples);
    expect(cycles.length).toBe(3);
  });

  it("임계치 미만 신호는 무시한다", () => {
    // peak가 enterThreshold(1200) 미만이면 사이클로 잡히지 않아야 함
    const samples = synth(3, 1.0, 1100);
    const cycles = detectReps(samples);
    expect(cycles.length).toBe(0);
  });

  it("피크 값이 합리적 범위로 잡힌다", () => {
    const samples = synth(2, 1.0, 2400);
    const cycles = detectReps(samples);
    expect(cycles.length).toBe(2);
    for (const c of cycles) {
      expect(c.peakValue).toBeGreaterThan(2300);
      expect(c.peakValue).toBeLessThanOrEqual(2401);
    }
  });

  it("유지 시간이 합리적으로 측정된다", () => {
    const samples = synth(1, 1.0);
    const cycles = detectReps(samples);
    expect(cycles.length).toBe(1);
    // 임계치 통과 시점 기준이라 정확히 1초는 아님. 0.7~1.4초 정도.
    expect(cycles[0].holdMs).toBeGreaterThan(700);
    expect(cycles[0].holdMs).toBeLessThan(1600);
  });
});
