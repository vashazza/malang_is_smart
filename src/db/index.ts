import Dexie, { type Table } from "dexie";
import type { SessionScore } from "../signal/score";
import type { RepCycle } from "../signal/repCount";
import type { HardnessValue, SessionModeValue } from "../ble/uuids";
import type { GripPattern, PerFingerStats } from "../signal/perFinger";
import type { FingerArray } from "../signal/fingers";

// 세션 기록.
export interface SessionRecord {
  id?: number;
  startedAt: number; // epoch ms
  endedAt: number;
  mode: SessionModeValue;
  hardness: HardnessValue;
  repCount: number;
  totalDurationMs: number;
  score: SessionScore;
  // 시각화용 다운샘플된 평균 압력 파형
  waveform: number[];
  // 손가락별 다운샘플된 파형 (5채널)
  fingerWaveforms: FingerArray<number[]>;
  cycles: RepCycle[];
  // 손가락별 분석 결과 + 패턴 분류 (핵심 산출물)
  perFinger: PerFingerStats;
  pattern: GripPattern;
  patternConfidence: number;
  // 다음 추천 난이도
  nextHardness: HardnessValue;
}

export class MallangiDB extends Dexie {
  sessions!: Table<SessionRecord, number>;

  constructor() {
    super("smart-mallangi");
    // v1: 초기 스키마 (손가락별 데이터 없음, 누군가 이미 시연했을 수 있음 → 호환을 위해 유지)
    this.version(1).stores({
      sessions: "++id, startedAt, mode, hardness",
    });
    // v2: 손가락별 데이터 + 패턴 추가. 인덱스 변경은 없으므로 store 정의만 동일하게 유지.
    this.version(2).stores({
      sessions: "++id, startedAt, mode, hardness",
    });
  }
}

export const db = new MallangiDB();

// 시각화 시 너무 많은 점은 차트 렌더 느려짐 → 다운샘플.
export function downsample(values: number[], targetLen: number): number[] {
  if (values.length <= targetLen) return values.slice();
  const out: number[] = [];
  const bin = values.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    const start = Math.floor(i * bin);
    const end = Math.floor((i + 1) * bin);
    let s = 0;
    for (let k = start; k < end; k++) s += values[k];
    out.push(s / Math.max(1, end - start));
  }
  return out;
}
