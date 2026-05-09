# Firmware

ESP32-S3 펌웨어. 앱(`smart-mallangi`)과 BLE로 통신.

## 폴더 구조

```
firmware/
├── README.md
└── mallangi_ble_test/
    └── mallangi_ble_test.ino   # BLE 연결 검증용 최소 펌웨어 (Velostat/펌프 X)
```

> Arduino IDE 규약: `.ino` 파일은 **같은 이름의 폴더 안에** 들어 있어야 함.

## 사용 방법 (Arduino IDE 2.x)

1. **보드 패키지**: `도구 > 보드 > 보드 매니저` → "esp32" 검색 → **esp32 by Espressif Systems** 설치
2. **보드 선택**: `Adafruit Feather ESP32-S3 No PSRAM`
3. **포트**: ESP32-S3를 USB-C로 연결 후 `/dev/cu.usbmodem*` 선택 (macOS) 또는 `COMx` (Windows)
4. **스케치 열기**: `파일 > 열기` → `firmware/mallangi_ble_test/mallangi_ble_test.ino`
5. **업로드** (`Cmd+U`): 빌드 + 굽기. 처음엔 1~3분 걸림
6. **시리얼 모니터** (`Cmd+Shift+M`, baud 115200): `[BLE] advertising as MALLANGI` 확인

## 다음 단계

`mallangi_ble_test`로 앱 연결까지 검증 끝나면, 같은 폴더 옆에
`mallangi_full/mallangi_full.ino` 만들고 Velostat 5채널 + MPU-6050 + ABP2 + 펌프/밸브
PWM 제어를 추가한다.

## BLE 규약

`docs/ble_protocol.md` 가 단일 진실. 펌웨어와 `src/ble/uuids.ts`는 항상 이 문서를 따른다.
