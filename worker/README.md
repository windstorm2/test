# worker

Cloudflare Worker 코드입니다.

- `worker.js`: v6.7 (2026-11-25). v6.7은 브이월드 호출에 브라우저와 같은 Referer·Origin·User-Agent를 보냅니다(Worker에서만 520이 나서). 이전 v6.6 내용: v6.6은 브이월드 호출에 `domain`(발급 때 등록한 URL)을 붙입니다. 이것이 없으면 INCORRECT_KEY가 납니다. 이전 v6.5 내용: v6.5는 대지권등록목록 호출이 실패하면 조건(JSON 500건 → JSON 100건 → XML 100건)을 바꿔 재시도하고 실패 사유를 화면에 보이게 했습니다. 이전 v6.4 내용: v6.3에서 브이월드 대지권 서비스 이름을 `ldragsList`에서 `ldaregList`로 고쳤고, v6.4에서 대지권 목록을 `totalCount`까지 끝까지 읽고 동·호의 앞자리 0을 무시하며 `/api/land` 응답에 진단 정보 `ldareg`를 넣었습니다. **Cloudflare에 배포해야 반영됩니다.**
- 배포되어 있는 v6.2 원본: `backup/202611222155/worker_v202611211710.js`, v6.2 수정 전 사본: `backup/202611241658/worker_v6.2_before.js`, v6.3 사본: `backup/202611241722/worker_v6.3_before.js`, v6.4 사본: `backup/202611241734/worker_v6.4_before.js`
- 이 폴더의 파일을 고쳐도 Cloudflare에 자동으로 배포되지 않습니다. 대시보드(Workers & Pages → `homepension` → Edit code)나 wrangler로 따로 배포합니다. 배포한 뒤 `/api/health`의 `version`을 확인합니다.
- 인증키는 코드에 넣지 않고 Worker Secret으로 등록합니다: `DATA_GO_KR_KEY`, `JUSO_CONFM_KEY`, `VWORLD_KEY`, `BRANCH_TOKEN`
