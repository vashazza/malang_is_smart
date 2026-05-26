// ============================================================
//  스마트 말랑이 — 실제 센서 펌웨어 (v0.2-incremental)
//  Adafruit ESP32-S3 Feather (5885) 기준
//
//  진행 상황 (하드웨어 붙이는 순서대로 더미를 진짜로 교체):
//    [x] BLE 광고 + notify  (mallangi_ble_test 와 동일)
//    [x] Velostat ch0~4 = A0~A4  ← 5채널 전부 결선됨
//    [ ] MPU-6050 (I2C, 0x68)
//    [ ] ABP2 압력 (I2C)
//    [ ] 펌프/밸브 PWM (GPIO 13, 12) + MOSFET
//
//  BLE 규약: docs/ble_protocol.md 단일 진실.
// ============================================================
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ---- docs/ble_protocol.md 와 1:1 매칭 ----
#define SVC_UUID    "6f9c0001-b5a3-4e1f-9d2a-5c7e8f0d1b2a"
#define CH_STREAM   "6f9c0002-b5a3-4e1f-9d2a-5c7e8f0d1b2a"
#define CH_CONTROL  "6f9c0003-b5a3-4e1f-9d2a-5c7e8f0d1b2a"
#define CH_STATUS   "6f9c0004-b5a3-4e1f-9d2a-5c7e8f0d1b2a"
#define CH_INFO     "6f9c0005-b5a3-4e1f-9d2a-5c7e8f0d1b2a"
#define DEVICE_NAME "MALLANGI"
#define FW_VERSION  "mallangi-fw-0.2-incremental"

// ---- 핀 매핑 (Adafruit ESP32-S3 Feather) ----
// Velostat 5채널: 결선 끝난 것만 실제 read, 나머진 0 송신.
static const int PIN_VELOSTAT[5] = { A0, A1, A2, A3, A4 };
static const bool VELOSTAT_CONNECTED[5] = {
  true,   // ch0: 엄지
  true,   // ch1: 검지
  true,   // ch2: 중지
  true,   // ch3: 약지
  true,   // ch4: 소지
};

BLECharacteristic *chStream = nullptr;
BLECharacteristic *chStatus = nullptr;
uint16_t g_seq = 0;
bool     g_connected = false;
bool     g_session   = false;  // CONTROL 0x01/0x02 로 토글

class ControlCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    String v = c->getValue();
    if (v.length() == 0) return;
    uint8_t cmd = (uint8_t)v[0];
    Serial.printf("[CTRL] cmd=0x%02X len=%u\n", cmd, (unsigned)v.length());

    switch (cmd) {
      case 0x01: g_session = true;  Serial.println("  -> START_SESSION"); break;
      case 0x02: g_session = false; Serial.println("  -> STOP_SESSION");  break;
      // 0x03 SET_HARDNESS / 0x04 CALIBRATE_ZERO / 0x05 PING:
      // 펌프·MOSFET 결선 후 구현. 지금은 로그만.
      default: break;
    }
  }
};

class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer *) override {
    g_connected = true;
    Serial.println("[BLE] connected");
  }
  void onDisconnect(BLEServer *s) override {
    g_connected = false;
    Serial.println("[BLE] disconnected -> advertising again");
    s->getAdvertising()->start();
  }
};

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== MALLANGI firmware (" FW_VERSION ") ===");

  analogReadResolution(12);  // 0~4095

  BLEDevice::init(DEVICE_NAME);
  BLEDevice::setMTU(185);

  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCB());

  BLEService *service = server->createService(SVC_UUID);

  chStream = service->createCharacteristic(
      CH_STREAM, BLECharacteristic::PROPERTY_NOTIFY);
  chStream->addDescriptor(new BLE2902());

  BLECharacteristic *chControl = service->createCharacteristic(
      CH_CONTROL, BLECharacteristic::PROPERTY_WRITE);
  chControl->setCallbacks(new ControlCB());

  chStatus = service->createCharacteristic(
      CH_STATUS,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  chStatus->addDescriptor(new BLE2902());
  uint8_t st0[4] = {100, 1, 0, 0};
  chStatus->setValue(st0, 4);

  BLECharacteristic *chInfo = service->createCharacteristic(
      CH_INFO, BLECharacteristic::PROPERTY_READ);
  chInfo->setValue(FW_VERSION);

  service->start();

  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(SVC_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
  Serial.println("[BLE] advertising as MALLANGI");
}

void loop() {
  static uint32_t nextMs = 0;
  uint32_t now = millis();
  if ((int32_t)(now - nextMs) < 0) { delay(1); return; }
  nextMs = now + 20;  // 50 Hz

  // ---- 압력 5채널 ----
  uint16_t p[5];
  for (int k = 0; k < 5; ++k) {
    p[k] = VELOSTAT_CONNECTED[k] ? (uint16_t)analogRead(PIN_VELOSTAT[k]) : 0;
  }

  // ---- IMU (MPU-6050 결선 후 교체) ----
  int8_t ax = 0, ay = 0, az = 64;  // az≈1g placeholder

  // ---- 16바이트 패킷 (리틀엔디안) ----
  uint8_t buf[16];
  buf[0] = g_seq & 0xFF;
  buf[1] = (g_seq >> 8) & 0xFF;
  for (int k = 0; k < 5; ++k) {
    buf[2 + k * 2]     = p[k] & 0xFF;
    buf[2 + k * 2 + 1] = (p[k] >> 8) & 0xFF;
  }
  buf[12] = (uint8_t)ax;
  buf[13] = (uint8_t)ay;
  buf[14] = (uint8_t)az;
  buf[15] = g_session ? 0x01 : 0x00;  // bit0 = 세션중
  g_seq++;

  if (chStream) {
    chStream->setValue(buf, 16);
    chStream->notify();
  }

  // 1초마다 시리얼에 ch0 raw 값 출력 (눌렀을 때 변하는지 즉시 확인용)
  static uint32_t lastLog = 0;
  if (now - lastLog > 1000) {
    lastLog = now;
    Serial.printf("[STREAM] seq=%u  conn=%d  session=%d  ch0=%u\n",
                  g_seq, g_connected ? 1 : 0, g_session ? 1 : 0, p[0]);
  }
}
