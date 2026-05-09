import type { FingerArray } from "./fingers";
import type { RepCycle } from "./repCount";

// 사이클 들을 모아 손가락별 통계를 낸 결과.
export interface PerFingerStats {
  // 모든 사이클 평균 피크 (raw ADC)
  avgPeak: FingerArray<number>;
  // 손가락별 평균 유지시간 (ms)
  avgHoldMs: FingerArray<number>;
  // 사이클의 총 손가락 압력 중 차지한 비율 (0~1, 합=1.0)
  contribution: FingerArray<number>;
  // 활성 비율: avgPeak / 전 손가락 중 최대값. 0~1.
  // 1에 가까우면 그 손가락이 가장 활발, 0에 가까우면 거의 안 씀.
  relativeActivity: FingerArray<number>;
  // 가장 약하게 작동한 손가락 (relativeActivity 최소). 그립인데 한 손가락만 약하면
  // 재활 타겟이 됨. activeFingerCount가 충분할 때만 의미 있음.
  weakestActiveFinger: number | null;
  // 활성 손가락 수: relativeActivity > 0.4 인 손가락 개수
  activeFingerCount: number;
}

// 운동 패턴 분류 결과.
export type GripPattern =
  | "full_grip" // 5손가락 모두 활발
  | "partial_grip" // 3~4 손가락
  | "pinch" // 엄지+검지 위주, 나머지 약함
  | "weak"; // 거의 활동 없음 / 사이클 부족

export interface PatternClassification {
  pattern: GripPattern;
  confidence: number; // 0~1
  // 사람에게 보여줄 설명
  description: string;
}

const NUM_FINGERS = 5;
const ACTIVE_THRESHOLD = 0.4; // 최대 손가락 대비 40% 이상이면 "활성"

export function analyzePerFinger(cycles: RepCycle[]): PerFingerStats {
  const empty: FingerArray<number> = [0, 0, 0, 0, 0];
  if (cycles.length === 0) {
    return {
      avgPeak: [...empty] as FingerArray<number>,
      avgHoldMs: [...empty] as FingerArray<number>,
      contribution: [0.2, 0.2, 0.2, 0.2, 0.2],
      relativeActivity: [...empty] as FingerArray<number>,
      weakestActiveFinger: null,
      activeFingerCount: 0,
    };
  }

  const sumPeak: number[] = [0, 0, 0, 0, 0];
  const sumHold: number[] = [0, 0, 0, 0, 0];
  for (const c of cycles) {
    for (let i = 0; i < NUM_FINGERS; i++) {
      sumPeak[i] += c.perFingerPeak[i];
      sumHold[i] += c.perFingerHoldMs[i];
    }
  }
  const avgPeak = sumPeak.map((s) => s / cycles.length) as FingerArray<number>;
  const avgHoldMs = sumHold.map((s) => s / cycles.length) as FingerArray<number>;

  const peakSum = avgPeak.reduce((a, b) => a + b, 0);
  const contribution = (
    peakSum > 0
      ? avgPeak.map((v) => v / peakSum)
      : [0.2, 0.2, 0.2, 0.2, 0.2]
  ) as FingerArray<number>;

  const peakMax = Math.max(...avgPeak);
  const relativeActivity = (
    peakMax > 0 ? avgPeak.map((v) => v / peakMax) : empty
  ) as FingerArray<number>;

  const activeIdx: number[] = [];
  relativeActivity.forEach((v, i) => {
    if (v >= ACTIVE_THRESHOLD) activeIdx.push(i);
  });

  let weakestActiveFinger: number | null = null;
  if (activeIdx.length >= 3) {
    // 활성 손가락이 충분할 때만, 그 중 가장 낮은 손가락을 약점으로.
    let minVal = Infinity;
    for (const i of activeIdx) {
      if (relativeActivity[i] < minVal) {
        minVal = relativeActivity[i];
        weakestActiveFinger = i;
      }
    }
  }

  return {
    avgPeak,
    avgHoldMs,
    contribution,
    relativeActivity,
    weakestActiveFinger,
    activeFingerCount: activeIdx.length,
  };
}

export function classifyPattern(stats: PerFingerStats): PatternClassification {
  const { activeFingerCount, contribution, relativeActivity } = stats;

  if (activeFingerCount === 0) {
    return {
      pattern: "weak",
      confidence: 1,
      description: "압력이 충분히 감지되지 않았습니다.",
    };
  }

  // 핀치 신호: 엄지(0) + 검지(1) 합의 비중이 높고, 나머지는 약함
  const thumbIndexShare = contribution[0] + contribution[1];
  const othersWeak =
    relativeActivity[2] < 0.4 &&
    relativeActivity[3] < 0.4 &&
    relativeActivity[4] < 0.4;

  if (thumbIndexShare >= 0.6 && othersWeak && relativeActivity[0] >= 0.5 && relativeActivity[1] >= 0.5) {
    return {
      pattern: "pinch",
      confidence: Math.min(1, thumbIndexShare),
      description: "엄지-검지 위주의 핀치 동작입니다.",
    };
  }

  if (activeFingerCount === 5) {
    // 모두 활성. 분포가 비교적 균등하면 full_grip.
    const min = Math.min(...relativeActivity);
    return {
      pattern: "full_grip",
      confidence: min, // 가장 약한 손가락의 상대 활성도
      description: "다섯 손가락 모두 사용한 풀 그립입니다.",
    };
  }

  return {
    pattern: "partial_grip",
    confidence: activeFingerCount / 5,
    description: `${activeFingerCount}개 손가락만 활성화된 부분 그립입니다.`,
  };
}

export function patternLabel(p: GripPattern): string {
  switch (p) {
    case "full_grip":
      return "풀 그립";
    case "partial_grip":
      return "부분 그립";
    case "pinch":
      return "핀치";
    case "weak":
      return "감지 부족";
  }
}
