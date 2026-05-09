import type { RepCycle } from "./repCount";

export interface SessionScore {
  total: number; // 0~100
  rhythmScore: number; // 0~100, 인접 사이클 간격의 일관성
  holdScore: number; // 0~100, 목표 유지시간 대비 정확도
  intensityScore: number; // 0~100, 피크 강도의 일관성
}

export interface ScoreTarget {
  targetHoldMs: number; // 목표 유지 시간 (예: 3000)
  targetIntervalMs: number; // 목표 반복 간격 (예: 2000)
}

export const DEFAULT_TARGET: ScoreTarget = {
  targetHoldMs: 3000,
  targetIntervalMs: 2000,
};

// 0~100 점수. 사이클이 2개 미만이면 부분 점수만 가능.
export function scoreSession(
  cycles: RepCycle[],
  target: ScoreTarget = DEFAULT_TARGET
): SessionScore {
  if (cycles.length === 0) {
    return { total: 0, rhythmScore: 0, holdScore: 0, intensityScore: 0 };
  }

  // 1) holdScore: 목표 대비 오차의 평균 → 점수화
  const holdErrors = cycles.map((c) =>
    Math.abs(c.holdMs - target.targetHoldMs)
  );
  const meanHoldErr = mean(holdErrors);
  // 1초 오차당 30점 차감
  const holdScore = clamp(100 - meanHoldErr / 1000 * 30, 0, 100);

  // 2) rhythmScore: 사이클 간 간격의 일관성 (변동계수 기반)
  let rhythmScore = 100;
  if (cycles.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < cycles.length; i++) {
      intervals.push(cycles[i].startMs - cycles[i - 1].startMs);
    }
    const mu = mean(intervals);
    const sd = stddev(intervals, mu);
    const cv = mu > 0 ? sd / mu : 1; // coefficient of variation
    // CV 0 → 100점, CV 0.5 → 0점 (선형)
    rhythmScore = clamp(100 - cv * 200, 0, 100);
  }

  // 3) intensityScore: 피크 강도의 일관성 (역시 CV 기반)
  const peaks = cycles.map((c) => c.peakValue);
  const muP = mean(peaks);
  const sdP = stddev(peaks, muP);
  const cvP = muP > 0 ? sdP / muP : 1;
  const intensityScore = clamp(100 - cvP * 200, 0, 100);

  // 총점: 가중 평균 (유지 50%, 리듬 30%, 강도 20%)
  const total = Math.round(
    holdScore * 0.5 + rhythmScore * 0.3 + intensityScore * 0.2
  );

  return {
    total,
    rhythmScore: Math.round(rhythmScore),
    holdScore: Math.round(holdScore),
    intensityScore: Math.round(intensityScore),
  };
}

// 점수 → 다음 세션 추천 난이도. 단순 규칙 기반 (추후 개인화 알고리즘 교체 가능).
export function suggestNextHardness(
  currentHardness: 0 | 1 | 2,
  score: SessionScore
): 0 | 1 | 2 {
  if (score.total >= 85 && currentHardness < 2) {
    return (currentHardness + 1) as 0 | 1 | 2;
  }
  if (score.total < 50 && currentHardness > 0) {
    return (currentHardness - 1) as 0 | 1 | 2;
  }
  return currentHardness;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[], mu: number): number {
  if (xs.length === 0) return 0;
  const v = xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length;
  return Math.sqrt(v);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
