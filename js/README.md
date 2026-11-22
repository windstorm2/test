# js

화면 동작과 계산 로직입니다. `index.html`이 아래 순서대로 불러옵니다.

1. `common.js` : 설정값, 전역 상태 객체 S, 공통 도우미 함수
2. `api.js` : 0. API 통신 및 토큰 체크
3. `customer.js` : 1. 고객 기본 정보
4. `building.js` : 2. 주소 검색, 건축물·토지·대지권 요약
5. `price.js` : 공시가격 조회, 3. 주택가격 산정 기준
6. `pension.js` : 4. 예상연금 조회
7. `application.js` : 5. 신청서 주소 동기화, 맞춤형 필요서류 생성
8. `main.js` : 화면 이벤트 연결과 시작 코드

파일별 함수 목록과 고칠 때의 규칙은 [docs/DIRECTORY.md](../docs/DIRECTORY.md)를 보세요.

- `collateral.js` : Step 5 담보방식 추천 (v6.1). `index.html`에서 `main.js` 바로 앞에 읽습니다.
