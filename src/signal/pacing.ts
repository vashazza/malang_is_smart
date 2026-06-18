import { SessionMode, type SessionModeValue } from "../ble/uuids";

// 세션 페이서 — 화면의 "쥐세요/펴세요" 가이드가 쓰는 박자 정의.
// 쥐기 모드의 gripS=3.0 은 score.ts 의 targetHoldMs=3000ms 와 일치시켜
// 사용자가 가이드 따라하면 holdScore 가 만점에 근접하도록 설계.

export const PREP_S = 3; // "준비" 카운트다운 길이 (초)

export interface ModePacing {
  gripS: number; // "쥐세요" 지속 시간
  restS: number; // "펴세요" 지속 시간
}

export function getPacing(mode: SessionModeValue): ModePacing {
  if (mode === SessionMode.RHYTHM) return { gripS: 0.5, restS: 0.5 };
  if (mode === SessionMode.PINCH) return { gripS: 2.0, restS: 1.5 };
  return { gripS: 3.0, restS: 2.0 }; // GRIP
}
