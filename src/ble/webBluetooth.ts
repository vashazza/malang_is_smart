import {
  BLE_CHAR_CONTROL,
  BLE_CHAR_SENSOR_STREAM,
  BLE_CHAR_STATUS,
  BLE_SERVICE_UUID,
  ControlCmd,
  DEVICE_NAME_PREFIX,
  type HardnessValue,
  type SessionModeValue,
} from "./uuids";
import {
  decodeSensorPacket,
  type ConnectionState,
  type DeviceStatus,
  type MallangiTransport,
  type SensorSample,
} from "./types";

// 실제 ESP32와 통신할 Web Bluetooth 어댑터.
// 하드웨어 펌웨어 완성 후 enable. 그 전엔 MockMallangiDevice를 씀.
//
// 동작 검증 체크리스트:
//   - chrome://flags 에서 "Experimental Web Platform features" ON 권장
//   - HTTPS 또는 localhost 에서만 동작
//   - 사용자 제스처(클릭) 안에서 connect() 호출해야 함
export class WebBluetoothMallangiDevice implements MallangiTransport {
  private server: BluetoothRemoteGATTServer | null = null;
  private streamChar: BluetoothRemoteGATTCharacteristic | null = null;
  private controlChar: BluetoothRemoteGATTCharacteristic | null = null;
  private statusChar: BluetoothRemoteGATTCharacteristic | null = null;

  private connection: ConnectionState = { kind: "disconnected" };
  private sampleHandlers = new Set<(s: SensorSample) => void>();
  private statusHandlers = new Set<(s: DeviceStatus) => void>();
  private connHandlers = new Set<(c: ConnectionState) => void>();

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "bluetooth" in navigator;
  }

  async connect(): Promise<void> {
    if (!WebBluetoothMallangiDevice.isSupported()) {
      throw new Error(
        "이 브라우저는 Web Bluetooth를 지원하지 않습니다. Chrome/Edge(데스크톱·안드로이드)를 사용하세요."
      );
    }
    this.setConn({ kind: "connecting" });
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: DEVICE_NAME_PREFIX }],
        optionalServices: [BLE_SERVICE_UUID],
      });
      device.addEventListener("gattserverdisconnected", () => {
        this.setConn({ kind: "disconnected" });
      });

      const server = await device.gatt!.connect();
      this.server = server;
      const service = await server.getPrimaryService(BLE_SERVICE_UUID);

      this.streamChar = await service.getCharacteristic(BLE_CHAR_SENSOR_STREAM);
      this.controlChar = await service.getCharacteristic(BLE_CHAR_CONTROL);
      this.statusChar = await service.getCharacteristic(BLE_CHAR_STATUS);

      this.streamChar.addEventListener(
        "characteristicvaluechanged",
        this.handleStreamPacket
      );
      await this.streamChar.startNotifications();

      this.statusChar.addEventListener(
        "characteristicvaluechanged",
        this.handleStatusPacket
      );
      await this.statusChar.startNotifications();

      this.setConn({
        kind: "connected",
        deviceName: device.name ?? "MALLANGI",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setConn({ kind: "error", message });
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.server?.disconnect();
    } finally {
      this.server = null;
      this.streamChar = null;
      this.controlChar = null;
      this.statusChar = null;
      this.setConn({ kind: "disconnected" });
    }
  }

  onSample(h: (s: SensorSample) => void): () => void {
    this.sampleHandlers.add(h);
    return () => this.sampleHandlers.delete(h);
  }
  onStatus(h: (s: DeviceStatus) => void): () => void {
    this.statusHandlers.add(h);
    return () => this.statusHandlers.delete(h);
  }
  onConnectionChange(h: (c: ConnectionState) => void): () => void {
    this.connHandlers.add(h);
    h(this.connection);
    return () => this.connHandlers.delete(h);
  }

  async startSession(mode: SessionModeValue): Promise<void> {
    await this.controlChar?.writeValueWithResponse(
      new Uint8Array([ControlCmd.START_SESSION, mode])
    );
  }
  async stopSession(): Promise<void> {
    await this.controlChar?.writeValueWithResponse(
      new Uint8Array([ControlCmd.STOP_SESSION])
    );
  }
  async setHardness(level: HardnessValue): Promise<void> {
    await this.controlChar?.writeValueWithResponse(
      new Uint8Array([ControlCmd.SET_HARDNESS, level])
    );
  }
  async calibrateZero(): Promise<void> {
    await this.controlChar?.writeValueWithResponse(
      new Uint8Array([ControlCmd.CALIBRATE_ZERO])
    );
  }
  getConnectionState(): ConnectionState {
    return this.connection;
  }

  // ---- 내부 ----
  private setConn(c: ConnectionState) {
    this.connection = c;
    this.connHandlers.forEach((h) => h(c));
  }

  private handleStreamPacket = (ev: Event) => {
    const target = ev.target as BluetoothRemoteGATTCharacteristic;
    const dv = target.value;
    if (!dv || dv.byteLength < 16) return;
    const sample = decodeSensorPacket(dv, performance.now());
    this.sampleHandlers.forEach((h) => h(sample));
  };

  private handleStatusPacket = (ev: Event) => {
    const target = ev.target as BluetoothRemoteGATTCharacteristic;
    const dv = target.value;
    if (!dv || dv.byteLength < 4) return;
    const status: DeviceStatus = {
      battery: dv.getUint8(0),
      hardness: dv.getUint8(1) as HardnessValue,
      state: dv.getUint8(2) as DeviceStatus["state"],
      errorCode: dv.getUint8(3),
    };
    this.statusHandlers.forEach((h) => h(status));
  };
}
