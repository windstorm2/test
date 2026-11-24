# 폴더 구조

최종 수정: 2026-11-22 23:05

## 현재 구조

```
test/
├─ README.md            저장소 안내
├─ index.html           메인 화면 (통합 상담·신청 보조도구 v6.1의 화면 부분)
├─ css/
│  └─ main.css          화면용 모양과 인쇄용 모양
├─ js/                  화면 동작과 계산 로직 (아래 순서대로 불러옴)
│  ├─ common.js         설정값, 전역 상태 객체 S, 공통 도우미 함수
│  ├─ api.js            지점 접속 토큰, Worker API 호출
│  ├─ customer.js       Step 1 고객 기본 정보
│  ├─ building.js       Step 2 주소 검색, 건축물·토지·대지권
│  ├─ price.js          공시가격 조회, Step 3 주택가격 산정
│  ├─ pension.js        Step 4 예상연금
│  ├─ application.js    Step 6 신청서, 맞춤형 필요서류
│  ├─ collateral.js     Step 5 담보방식 추천 (v6.1)
│  └─ main.js           화면 이벤트 연결과 시작 코드
├─ docs/                프로젝트 문서
│  ├─ HANDOFF.md            인수인계 기록 (가장 먼저 읽음)
│  ├─ PROJECT_OVERVIEW.md   프로젝트 개요
│  ├─ REQUIREMENTS.md       요건정의 (적용 로직 전체)
│  ├─ DIRECTORY.md          이 문서
│  └─ CHANGELOG.md          변경 이력
├─ forms/               출력 서식 (아직 비어 있음)
├─ worker/              Cloudflare Worker 코드 (worker.js v6.5)
└─ backup/              백업
   ├─ 202611222155/     2026-11-22 21:55 시점의 기존 파일 전체
   ├─ 202611230850/     v6.1 변경 전 코드
   ├─ 202611231021/     2026-11-23 10:21 시점의 v6.1 코드 (문구 수정 전)
   ├─ 202611231740/     2026-11-23 17:40 시점의 코드 (임대차 규칙, 대지권 추정 제거 전)
   ├─ 202611241658/     Worker v6.2 원본 사본 (v6.3 수정 전)
   ├─ 202611241722/     Worker v6.3 사본, js/building.js (v6.4 수정 전)
   └─ 202611241734/     Worker v6.4 사본, js/building.js (v6.5 수정 전)
```

Git은 빈 폴더를 저장하지 못하므로 `forms/`, `worker/`, `backup/`에는 안내용 `README.md`를 하나씩 두었습니다.

## js 파일

| 파일 | 내용 | 들어 있는 것 |
|---|---|---|
| `js/common.js` | 설정값, 전역 상태 객체 S, 공통 도우미 함수 | 설정값 선언 8개(`API_BASE`, `AREA_TOL`, `S`, `$`, `won`, `digits`, `qs`, `fmtDay`), `showToast`, `banner`, `addBanner`, `fill`, `setPill` |
| `js/api.js` | 0. API 통신 및 토큰 체크 | `token`, `api`, `checkToken` |
| `js/customer.js` | 1. 고객 기본 정보 | `ymd6To8`, `targetLumpAmt`, `recalcInchulBalance`, `validYmd6` |
| `js/building.js` | 2. 주소 검색, 건축물·토지·대지권 요약 | `searchAddrUI`, `resetUnit`, `mapPurpsToHouseType`, `formatStandardHouseAddr`, `computeBestLandRight`, `landRightWhy`, `syncBuildingToApplication`, `normDongKey`, `getBuildingMaxFloor`, `shortStrct`, `buildCompactSummary`, `renderBldBanner`, `startLandFetch`, `pickAddr`, `guessFloor`, `loadUnit` |
| `js/price.js` | 공시가격 조회, 3. 주택가격 산정 기준 | `calcTargetRatio`, `buildPageOrder`, `startPriceFetch`, `bldPriceSummary`, `isApt`, `sisePrice`, `ratio`, `hsprcConv`, `siseNear`, `bestSise`, `buildPriceOptions`, `applyPrice`, `priceNotes`, `baseLabel` |
| `js/pension.js` | 4. 예상연금 조회 | `renderPension`, `applyPensionToApplication`, `updateLumpGuideBadge` |
| `js/application.js` | 5. 신청서 주소 동기화, 맞춤형 필요서류 생성 | `syncAddr`, `isPreferentialNow`, `updateDocList`, `copyDocListText`, `autoFitPage`, `resetAll` |
| `js/main.js` | 화면 이벤트 연결과 시작 코드 | 함수 선언 없음. 최상위 실행문 28개 |

## 분할 방식

- `backup/202611222155/index.html`(v6.0, 한 파일 약 8.8만 자)을 화면(`index.html`), 모양(`css/main.css`), 동작(`js/` 8개)으로 나눴습니다. 기능은 바꾸지 않았습니다.
- 함수 선언은 주제별 파일에 두었습니다. 페이지를 열 때 바로 실행되는 코드(이벤트 연결, 초기값 설정)는 원본 순서 그대로 `js/main.js`에 모았습니다. 한 파일일 때는 뒤에 선언한 함수도 앞에서 쓸 수 있었지만, 파일을 나누면 아직 불러오지 않은 파일의 함수는 쓸 수 없기 때문입니다.
- 빌드 도구와 모듈(import/export)은 쓰지 않습니다. 모든 함수와 변수는 원본과 같이 전역입니다.

## 고칠 때의 규칙

- `index.html`의 script 줄 순서를 바꾸지 않습니다. `common.js`가 맨 앞, `main.js`가 맨 뒤입니다.
- 새 함수는 해당 주제 파일에 넣습니다. 새 파일을 만들면 `index.html`에서 `main.js` 앞에 script 줄을 추가합니다.
- 페이지를 열 때 바로 실행되는 코드는 `main.js`에만 둡니다.

## 분할 검증 (2026-11-22)

확인한 것

- 함수 50개, 최상위 실행문 36개, 주석 22개가 원본과 글자 단위로 같습니다.
- `index.html`은 style과 script 부분을 뺀 나머지가 원본과 같습니다. `css/main.css`는 원본 style 내용과 같습니다.
- 가상 화면 환경(Node)에서 원본과 분할본을 각각 실행해 동작 기록을 비교했고 같았습니다. 페이지 열기, 이벤트 처리 35개 실행, 함수 50개 호출을 접속 토큰이 없는 경우와 있는 경우로 나눠 비교했습니다.

확인하지 못한 것

- 실제 브라우저에서의 화면 모양과 조회 동작(주소 검색, 시세, 연금 산출, 인쇄)

## 앞으로 채울 폴더

| 폴더 | 들어갈 내용 |
|---|---|
| `forms/` | 개인정보 동의서, 확약서, 약정서, 등기서류, 설명서. 공통 데이터를 읽어 자동으로 채움 |
| `worker/worker.js` | Worker 코드(v6.5). Cloudflare 배포는 별도로 해야 함 |

## 백업 규칙

- 위치: `backup/연월일시분/` (예: `backup/202611222155/`). 시각은 한국 시간입니다.
- 기존 파일을 크게 바꾸거나 옮기기 전에 그 시점의 파일을 폴더째 넣습니다.
- 백업 폴더 안의 파일은 고치지 않습니다.

## backup/202611222155/ 의 파일

| 파일 | 내용 |
|---|---|
| `index.html` | 통합 상담·신청 보조도구 v6.0 (메인) |
| `worker_v202611211710.js` | Cloudflare Worker API v6.2 |
| `주택연금 담보제공방식 추천 도구_v202611211710.html` | 담보방식 비교·추천 도구 |
| `주택연금 담보방식 비교 및 추천안_v202611211710.md` | 담보방식 비교, 위험 분석, 추천안 |
| `주택연금 담보제공방식 추천 도구 적용 로직 및 알고리즘 명세서_v202611211710.md` | 추천 로직 명세 |
| `index2.html` | 등기서류(위임장, 확인서면) 자동 작성 시제품 |
| `README.md` | 이전 README |

## v6.1 추가 (2026-11-23)

- `js/collateral.js` : Step 5 담보방식 추천. `colEval(inp)`(계산만, 화면을 건드리지 않음), `colInputs()`, `colRender(r)`, `colRefresh()`, `colInit()`, 상수 `COL_Q`(선호 문항), `COL_LIFE`(기대여명 표)
- script 순서: common → api → customer → building → price → pension → application → collateral → main
- `js/main.js` 끝에서 `colInit()`을, `js/application.js`의 `updateDocList()` 첫머리에서 `colRefresh()`를 부릅니다
- `S.userBase` : 상담자가 가격 기준을 직접 골랐는지 표시. `js/main.js`에서 켜고 `js/building.js`의 `resetUnit()`에서 끕니다
- `backup/202611230850/` : v6.1 변경 전 코드 10개 파일
- `backup/202611231021/` : 최종 선택 경고 문구를 고치기 전 코드 (`index.html`, `css/main.css`, `js/` 9개)
