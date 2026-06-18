import { WebBluetoothMallangiDevice } from "./webBluetooth";
import type { MallangiTransport } from "./types";

let instance: MallangiTransport | null = null;

export function getTransport(): MallangiTransport {
  if (instance) return instance;
  instance = new WebBluetoothMallangiDevice();
  return instance;
}

export type { MallangiTransport, SensorSample, DeviceStatus, ConnectionState } from "./types";
export {
  Hardness,
  SessionMode,
  type HardnessValue,
  type SessionModeValue,
} from "./uuids";
