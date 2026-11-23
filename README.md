# 주택연금 상담 및 신청 도구 (개발용 저장소)

고령의 주택연금 상담 고객에게 빠르고 정확하게 안내하기 위한 상담 직원용 보조도구입니다.
입력정보 → 설명자료 생성 → 계약서류 자동 완성 및 출력을 목표로 합니다.

- 이 저장소(`test`)는 **개발용**입니다. 모든 수정은 여기서만 합니다.
- 운영용은 `home_pension` 저장소이며, 검증이 끝난 결과만 옮깁니다.

## 현재 상태 (2026-11-23)

- 현재 버전은 **v6.1**입니다. v6.0을 화면(`index.html`), 모양(`css/`), 동작(`js/`)으로 나눈 뒤, 시세 자동 선택 규칙과 Step 5 담보방식 추천(`js/collateral.js`)을 더했습니다. 계산 시험과 가상 화면 시험만 거쳤고, 접속 토큰이 필요한 조회와 인쇄 모양을 포함한 실제 브라우저 확인은 아직 남아 있습니다.
- 처음 이어받는다면 [docs/HANDOFF.md](docs/HANDOFF.md)를 가장 먼저 읽습니다.
- 개발용 화면: https://windstorm2.github.io/test/
- 나누기 전 원본과 아직 통합하지 않은 기존 도구는 `backup/202611222155/`에 있습니다.

| 기존 도구 | 열기 |
|---|---|
| 통합 상담·신청 보조도구 v6.0 (나누기 전 원본) | [열기](https://windstorm2.github.io/test/backup/202611222155/index.html) |
| 담보제공방식 추천 도구 | [열기](https://windstorm2.github.io/test/backup/202611222155/%E1%84%8C%E1%85%AE%E1%84%90%E1%85%A2%E1%86%A8%E1%84%8B%E1%85%A7%E1%86%AB%E1%84%80%E1%85%B3%E1%86%B7%20%E1%84%83%E1%85%A1%E1%86%B7%E1%84%87%E1%85%A9%E1%84%8C%E1%85%A6%E1%84%80%E1%85%A9%E1%86%BC%E1%84%87%E1%85%A1%E1%86%BC%E1%84%89%E1%85%B5%E1%86%A8%20%E1%84%8E%E1%85%AE%E1%84%8E%E1%85%A5%E1%86%AB%20%E1%84%83%E1%85%A9%E1%84%80%E1%85%AE_v202611211710.html) |
| 등기서류(위임장·확인서면) 시제품 | [열기](https://windstorm2.github.io/test/backup/202611222155/index2.html) |

## 문서

| 문서 | 내용 |
|---|---|
| [docs/HANDOFF.md](docs/HANDOFF.md) | 인수인계 기록 (가장 먼저 읽음) |
| [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | 프로젝트 개요, 원칙, 단계별 현황, 작업 순서 |
| [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) | 요건정의(적용 로직 전체) |
| [docs/DIRECTORY.md](docs/DIRECTORY.md) | 폴더 구조, 파일별 역할, 코드를 고칠 때의 규칙 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 변경 이력 |

## 다른 환경(AI 서비스 포함)에서 이어서 작업할 때

1. 위 문서를 표의 순서대로 읽습니다.
2. 코드나 로직을 고치면 같은 커밋에서 `docs/CHANGELOG.md`와 관련 문서를 함께 고칩니다.
3. 기존 파일을 크게 바꾸기 전에는 `backup/연월일시분/` 폴더에 사본을 둡니다.
4. 인증키와 고객 정보는 코드에 넣지 않습니다. 이 저장소는 공개 상태입니다.
5. `js/` 파일은 `index.html`에 적힌 순서대로 불러와야 합니다. 규칙은 `docs/DIRECTORY.md`에 있습니다.
