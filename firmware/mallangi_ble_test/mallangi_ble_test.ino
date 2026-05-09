// ============================================================
//  스마트 말랑이 — BLE 연결 테스트 펌웨어 (v0.1-bletest)
//  Adafruit ESP32-S3 Feather (5885) 기준
//
//  목적: 센서/펌프 다 빼고, "MALLANGI" 이름으로 BLE 광고 +
//        50Hz 더미 데이터 notify 만 검증한다.
//
//  앱(smart-mallangi)이 .env.local 의 VITE_USE_MOCK_BLE=false
//  설정 + Chrome/Edge 에서 정상 연결되는지 확인하는 용도.
//
//  센서 결선이 끝나면 별도 .ino (mallangi_full.ino) 로 교체.
// ============================================================
#include <Arduino.h>
#include <math.h>
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

BLECharacteristic *chStream = nullptr;
BLECharacteristic *chStatus = nullptr;
uint16_t g_seq = 0;
bool     g_connected = false;

class ControlCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *c) override {
    String v = c->getValue();
    if (v.length() == 0) return;
    Serial.printf("[CTRL] cmd=0x%02X len=%u\n", (uint8_t)v[0], (unsigned)v.length());
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
  Serial.println("\n=== MALLANGI firmware (BLE-only test) ===");

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
  chInfo->setValue("mallangi-fw-0.1-bletest");

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
  nextMs = now + 20; // 50 Hz

  // 5채널 더미 sin 파형 (실제 Velostat 결선 후엔 analogRead로 교체)
  float t = now / 1000.0f;
  uint16_t p[5];
  for (int k = 0; k < 5; ++k) {
    float v = 1500.0f + 1200.0f * sinf(2.0f * 3.1416f * 0.5f * t + k * 0.6f);
    if (v < 0) v = 0;
    if (v > 4095) v = 4095;
    p[k] = (uint16_t)v;
  }

  // 16바이트 패킷 (리틀엔디안)
  uint8_t buf[16];
  buf[0] = g_seq & 0xFF;
  buf[1] = (g_seq >> 8) & 0xFF;
  for (int k = 0; k < 5; ++k) {
    buf[2 + k * 2]     = p[k] & 0xFF;
    buf[2 + k * 2 + 1] = (p[k] >> 8) & 0xFF;
  }
  buf[12] = 0;       // ax
  buf[13] = 0;       // ay
  buf[14] = 64;      // az ≈ 1g
  buf[15] = 0x01;    // flags: bit0=세션중
  g_seq++;

  if (chStream) {
    chStream->setValue(buf, 16);
    chStream->notify();
  }

  // 1초마다 시리얼에 살아있다 표시
  static uint32_t lastLog = 0;
  if (now - lastLog > 1000) {
    lastLog = now;
    Serial.printf("[STREAM] seq=%u  conn=%d\n", g_seq, g_connected ? 1 : 0);
  }
}
