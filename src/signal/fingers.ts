// 5채널 손가락 메타데이터. 인덱스는 SensorSample.pressures와 1:1.
// 펌웨어/하드웨어 배선과 반드시 일치시킬 것 (ble_protocol.md 참조).
export const FINGERS = [
  { idx: 0, key: "thumb",  name: "엄지", short: "엄", color: "#ef4444" },
  { idx: 1, key: "index",  name: "검지", short: "검", color: "#f97316" },
  { idx: 2, key: "middle", name: "중지", short: "중", color: "#eab308" },
  { idx: 3, key: "ring",   name: "약지", short: "약", color: "#22c55e" },
  { idx: 4, key: "pinky",  name: "소지", short: "소", color: "#3b82f6" },
] as const;

export type FingerKey = (typeof FINGERS)[number]["key"];
export type FingerArray<T> = [T, T, T, T, T];
