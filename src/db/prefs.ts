import { Hardness, type HardnessValue } from "../ble/uuids";

// 사용자가 홈에서 고른 경도. 페이지 이동·새로고침에 살아남도록 localStorage 에 저장.
// 기기(ESP32 또는 mock)에는 transport.setHardness() 로 따로 동기화.

const KEY = "mallangi.hardness";

export function getStoredHardness(): HardnessValue {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "0") return Hardness.EASY;
    if (v === "2") return Hardness.HARD;
  } catch {
    // localStorage 막힌 환경 (사파리 사생활 모드 등)
  }
  return Hardness.NORMAL;
}

export function setStoredHardness(h: HardnessValue): void {
  try {
    window.localStorage.setItem(KEY, String(h));
  } catch {
    // 위와 동일, 그냥 메모리에서만 동작
  }
}
