import { describe, it, expect } from "vitest";
import { scoreSession, suggestNextHardness } from "./score";
import type { RepCycle } from "./repCount";

function cycle(start: number, hold: number, peak = 2400): RepCycle {
  return {
    startMs: start,
    endMs: start + hold + 400,
    peakMs: start + 200,
    peakValue: peak,
    holdMs: hold,
    perFingerPeak: [peak, peak, peak, peak, peak],
    perFingerHoldMs: [hold, hold, hold, hold, hold],
  };
}

describe("scoreSession", () => {
  it("완벽한 수행은 높은 점수를 받는다", () => {
    const cycles = [
      cycle(0, 3000),
      cycle(2000, 3000),
      cycle(4000, 3000),
      cycle(6000, 3000),
    ];
    const s = scoreSession(cycles);
    expect(s.total).toBeGreaterThan(85);
    expect(s.holdScore).toBeGreaterThan(90);
    expect(s.rhythmScore).toBeGreaterThan(90);
  });

  it("유지시간이 목표에서 멀면 점수가 낮아진다", () => {
    const cycles = [
      cycle(0, 500),
      cycle(2000, 500),
      cycle(4000, 500),
    ];
    const s = scoreSession(cycles);
    expect(s.holdScore).toBeLessThan(50);
  });

  it("간격이 들쭉날쭉하면 리듬 점수가 낮아진다", () => {
    const cycles = [
      cycle(0, 3000),
      cycle(500, 3000), // 매우 짧은 간격
      cycle(5000, 3000), // 매우 긴 간격
      cycle(5800, 3000),
    ];
    const s = scoreSession(cycles);
    expect(s.rhythmScore).toBeLessThan(50);
  });

  it("사이클이 없으면 0점", () => {
    const s = scoreSession([]);
    expect(s.total).toBe(0);
  });
});

describe("suggestNextHardness", () => {
  it("85점 이상이면 한 단계 올린다", () => {
    expect(
      suggestNextHardness(0, {
        total: 90,
        rhythmScore: 90,
        holdScore: 90,
        intensityScore: 90,
      })
    ).toBe(1);
  });

  it("50점 미만이면 한 단계 내린다", () => {
    expect(
      suggestNextHardness(2, {
        total: 40,
        rhythmScore: 40,
        holdScore: 40,
        intensityScore: 40,
      })
    ).toBe(1);
  });

  it("최고 단계에서 더 올리지 않는다", () => {
    expect(
      suggestNextHardness(2, {
        total: 95,
        rhythmScore: 95,
        holdScore: 95,
        intensityScore: 95,
      })
    ).toBe(2);
  });
});
