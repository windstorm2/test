# worker

Cloudflare Worker 코드입니다.

- `worker.js`: v6.3 (2026-11-24). v6.2에서 브이월드 대지권 서비스 이름을 `ldragsList`에서 `ldaregList`로 고치고 버전 표기를 올렸습니다. **Cloudflare에 배포해야 반영됩니다.**
- 배포되어 있는 v6.2 원본: `backup/202611222155/worker_v202611211710.js`, 수정 전 사본: `backup/202611241658/worker_v6.2_before.js`
- 이 폴더의 파일을 고쳐도 Cloudflare에 자동으로 배포되지 않습니다. 대시보드(Workers & Pages → `homepension` → Edit code)나 wrangler로 따로 배포합니다. 배포한 뒤 `/api/health`의 `version`을 확인합니다.
- 인증키는 코드에 넣지 않고 Worker Secret으로 등록합니다: `DATA_GO_KR_KEY`, `JUSO_CONFM_KEY`, `VWORLD_KEY`, `BRANCH_TOKEN`
