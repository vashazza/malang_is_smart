# 스마트 말랑이 (쥐락펴락) — 프로토타입 웹앱

2026 캡스톤 스마트말랑이 (`malang_is_smart`)

ESP32-S3 기반 손 재활 디바이스(MALLANGI)와 Web Bluetooth 로 직접 통신하는 웹앱.

## 기술 스택

- **Vite + React 19 + TypeScript** — 빠른 핫리로드, 단일 페이지 앱
- **React Router** — 페이지 네비게이션
- **Tailwind CSS** — 유틸리티 기반 스타일링
- **Recharts** — 압력 파형, 일별 추이 차트
- **Dexie (IndexedDB)** — 세션 기록 영구 저장
- **Web Bluetooth API** — ESP32 BLE와 직접 통신 (Chrome/Edge에서만 동작, iOS Safari ❌)
- **Vitest** — 신호처리 단위 테스트

## 빠른 시작

```bash
npm install      # 최초 1회만
npm run dev      # 개발 서버 (http://localhost:5173)
npx vitest run   # 신호처리 테스트
npm run build    # 프로덕션 빌드
```

브라우저에서 `http://localhost:5173` 열고 "기기 연결" → MALLANGI 선택.

## 폴더 구조

```
src/
├── ble/                # BLE 통신 레이어
│   ├── uuids.ts        # Service/Characteristic UUID, 명령 코드 (펌웨어와 합의)
│   ├── types.ts        # SensorSample, MallangiTransport 인터페이스
│   ├── webBluetooth.ts # ESP32(MALLANGI) 와 통신하는 Web Bluetooth 어댑터
│   └── index.ts        # 트랜스포트 싱글톤
├── signal/             # 신호처리 (순수 함수, UI 의존성 없음)
│   ├── repCount.ts     # 슈미트 트리거 기반 반복 검출
│   ├── score.ts        # 유지/리듬/강도 점수 계산
│   ├── pacing.ts       # "쥐세요/펴세요" 페이서 박자
│   └── *.test.ts       # 합성 파형으로 단위 테스트
├── db/                 # Dexie IndexedDB
│   ├── index.ts        # SessionRecord 스키마, 다운샘플 유틸
│   └── prefs.ts        # 사용자 경도 선택 등 localStorage 키
├── pages/
│   ├── Home.tsx        # 기기 연결 + 경도 선택 + 운동 모드
│   ├── Session.tsx     # 실시간 파형 + 페이서 + 반복 카운트
│   ├── Result.tsx      # 세션 점수 + 상세 + 축하 팝업
│   ├── History.tsx     # 세션 기록 리스트
│   └── Stats.tsx       # 일별 평균/세션 횟수 그래프
├── components/
│   └── Layout.tsx      # 하단 탭 네비게이션
├── App.tsx             # 라우터 정의
└── main.tsx            # 진입점

firmware/
├── mallangi_ble_test/  # BLE 연결 검증용 최소 펌웨어
└── mallangi_full/      # 실제 센서 펌웨어

docs/
└── ble_protocol.md     # ★ 펌웨어팀과 공유하는 BLE 통신 규약 ★
```

## 개발 흐름 (다음 할 일 체크리스트)

### Phase 1 — 앱
- [x] 프로젝트 셋업
- [x] 반복 검출, 점수화 알고리즘 + 테스트
- [x] 5개 화면 골격
- [x] DB 스키마
- [x] 경도 선택 UI
- [x] "쥐세요/펴세요" 페이서
- [ ] UI 디테일 보완 (폰트, 간격, 다크모드 등)
- [ ] 운동 모드별 목표값 차별화 (현재 모두 동일한 target)
- [ ] 세션 도중 일시정지/재개
- [ ] 사용자 캘리브레이션(영점/최대값) 화면

### Phase 2 — 펌웨어 통합
- [x] `docs/ble_protocol.md` 합의
- [x] UUID, 패킷 포맷, 명령 코드 펌웨어/앱 양쪽 반영
- [x] mallangi_ble_test 로 BLE 핸드셰이크 검증
- [x] mallangi_full 의 Velostat 5채널 결선·송신
- [ ] MPU-6050 I2C 통합
- [ ] ABP2 압력 센서 + 펌프/밸브 PWM (경도 제어)

### Phase 3 — 실 환경 보정
- [ ] 실제 압력값으로 enterThreshold/exitThreshold 재조정
- [ ] 캘리브레이션 알고리즘 추가 (사용자별 max 압력 기준)

### Phase 4 — 평가/시연
- [ ] 건강 성인 5인 사용성 시험
- [ ] 반복 검출 정확도 측정 (수기 카운트 vs 앱 카운트)
- [ ] 점수 민감도 시험 (의도적으로 다른 패턴 입력)
- [ ] 시연 시나리오 영상

## 주의사항

### Web Bluetooth 제약
- **Chrome / Edge (데스크톱·안드로이드)** 에서만 동작.
- **iOS Safari 미지원**. 시연/평가 환경 반드시 노트북 또는 안드로이드폰.
- HTTPS 또는 `localhost` 필수.
- `connect()`는 사용자 클릭 핸들러 안에서 호출해야 함 (브라우저 정책).

### 데이터 저장
- IndexedDB는 브라우저 단위 → 다른 기기/브라우저로 옮길 수 없음.
- 시연 전 Chrome 시크릿모드로 열면 기록이 다 사라짐. 일반 창 사용.
- 데이터 초기화: DevTools > Application > IndexedDB > smart-mallangi 삭제.

### 신호처리 임계치
- `src/signal/repCount.ts`의 `DEFAULT_REP_OPTIONS` 값(enterThreshold=1200 등)은
  초기값이라 실제 Velostat 캘리브레이션 후 재조정 필요.

## BLE 통신 규약

**`docs/ble_protocol.md` 가 펌웨어팀과 앱팀 사이의 단일 진실(Single Source of Truth)**
입니다. 패킷 포맷이나 UUID가 바뀌면 양쪽 모두 갱신해야 합니다.

규약 변경 → `src/ble/uuids.ts` 와 `src/ble/types.ts`의 `decodeSensorPacket()` 도 함께 수정.
