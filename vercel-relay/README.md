# 브이월드 중계 서버 (Vercel)

Cloudflare Worker가 브이월드를 직접 부르면 HTTP 520으로 막혀서(2026-11-25 확인), Cloudflare 밖의 Vercel(서울 리전)이 대신 호출합니다.
브라우저에서 직접 부르는 방법도 CORS로 막혀 있습니다. 인증키는 Vercel에만 두고, Worker는 비밀값(`RELAY_SECRET`)으로만 이 서버를 부릅니다.

## 배포 순서
1. vercel.com 가입(GitHub 계정으로 로그인) → Add New → Project → `windstorm2/test` 저장소 Import.
2. **Root Directory**를 `vercel-relay`로 지정합니다. Framework Preset은 Other로 둡니다.
3. Environment Variables에 3개를 넣고 Deploy합니다.
   - `VWORLD_KEY` = 브이월드 인증키(재발급한 새 키)
   - `RELAY_SECRET` = 임의의 긴 문자열(예: 영문·숫자 32자 이상). 직접 만들어 메모해 둡니다.
   - `VWORLD_DOMAIN` = 키 발급 때 등록한 URL (선택, 기본값 `https://windstorm2.github.io/home_pension/`)
4. 배포되면 주소가 나옵니다(예: `https://xxxx.vercel.app`). 중계 주소는 `https://xxxx.vercel.app/api/vworld` 입니다.
5. Cloudflare → `homepension` Worker → Settings → Variables and Secrets에 추가합니다.
   - `VWORLD_RELAY_URL` = `https://xxxx.vercel.app/api/vworld` (텍스트)
   - `VWORLD_RELAY_SECRET` = 위 `RELAY_SECRET`과 같은 값 (**Secret**으로)
6. Worker v6.8 코드를 Deploy합니다.

## 시험
- Worker `/api/health`에 `"vworldRelay": true`가 보여야 합니다.
- 남천동 101동 102호를 조회하면 대지권 비율이 나옵니다.
- 실패하면 F12 → Network의 `land` 응답 `ldareg.tries`를 보세요(키는 가려져 있음).

## 보안
- `X-Relay-Secret`이 맞아야만 동작합니다. 허용 서비스 목록(`ALLOWED`)과 전달 변수(`PASS`)만 통과시킵니다.
- 호출자가 보낸 `key`는 무시하고, 응답과 오류 문구에서 인증키는 `***`로 가립니다.
