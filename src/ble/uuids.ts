// docs/ble_protocol.md 와 1:1 매칭. 변경 시 양쪽 모두 갱신.
export const BLE_SERVICE_UUID = "6f9c0001-b5a3-4e1f-9d2a-5c7e8f0d1b2a";
export const BLE_CHAR_SENSOR_STREAM = "6f9c0002-b5a3-4e1f-9d2a-5c7e8f0d1b2a";
export const BLE_CHAR_CONTROL = "6f9c0003-b5a3-4e1f-9d2a-5c7e8f0d1b2a";
export const BLE_CHAR_STATUS = "6f9c0004-b5a3-4e1f-9d2a-5c7e8f0d1b2a";
export const BLE_CHAR_DEVICE_INFO = "6f9c0005-b5a3-4e1f-9d2a-5c7e8f0d1b2a";

export const DEVICE_NAME_PREFIX = "MALLANGI";
export const SAMPLE_RATE_HZ = 50;
export const SAMPLE_PERIOD_MS = 1000 / SAMPLE_RATE_HZ;

export const ControlCmd = {
  START_SESSION: 0x01,
  STOP_SESSION: 0x02,
  SET_HARDNESS: 0x03,
  CALIBRATE_ZERO: 0x04,
  PING: 0x05,
} as const;

export const SessionMode = {
  GRIP: 0,
  RHYTHM: 1,
  PINCH: 2,
} as const;
export type SessionModeValue = (typeof SessionMode)[keyof typeof SessionMode];

export const Hardness = {
  EASY: 0,
  NORMAL: 1,
  HARD: 2,
} as const;
export type HardnessValue = (typeof Hardness)[keyof typeof Hardness];
