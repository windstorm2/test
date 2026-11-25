// 브이월드 중계 함수 (Vercel Serverless, Node). Cloudflare Worker가 브이월드를 직접 부르면 HTTP 520으로 막혀서,
// Cloudflare 밖(서울 리전)에서 대신 호출한다. 인증키는 Vercel 환경변수에만 두고 응답·오류 어디에도 내보내지 않는다.
//
// 호출: GET /api/vworld?endpoint=ldaregList&pnu=...&format=json&numOfRows=500&pageNo=1
// 머리글: X-Relay-Secret: <RELAY_SECRET>   (Worker만 아는 값)
// 환경변수: VWORLD_KEY, RELAY_SECRET, VWORLD_DOMAIN(선택, 기본 https://windstorm2.github.io/home_pension/)

const ALLOWED = new Set([
  'ldaregList', 'ladfrlList', 'getIndvdLandPriceAttr', 'getLandCharacteristics',
  'getApartHousingPriceAttr', 'getIndvdHousingPriceAttr',
]);
const PASS = new Set(['pnu', 'format', 'numOfRows', 'pageNo', 'stdrYear']);
const BASE = 'https://api.vworld.kr/ned/data';

module.exports = async function handler(req, res) {
  const send = (code, body, type) => {
    res.statusCode = code;
    res.setHeader('Content-Type', type || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  try {
    const secret = process.env.RELAY_SECRET;
    const key = process.env.VWORLD_KEY;
    if (!secret || !key) return send(500, { error: 'RELAY_SECRET 또는 VWORLD_KEY 환경변수가 없습니다.' });
    if (req.headers['x-relay-secret'] !== secret) return send(401, { error: 'unauthorized' });

    const q = new URL(req.url, 'http://x').searchParams;
    const endpoint = q.get('endpoint') || '';
    if (!ALLOWED.has(endpoint)) return send(400, { error: '허용되지 않은 서비스입니다.' });

    const p = new URLSearchParams({ key, domain: process.env.VWORLD_DOMAIN || 'https://windstorm2.github.io/home_pension/' });
    for (const k of PASS) if (q.get(k) != null) p.set(k, q.get(k));

    const r = await fetch(`${BASE}/${endpoint}?${p}`, {
      headers: { Accept: '*/*', 'User-Agent': 'Mozilla/5.0 homepension-relay' },
    });
    const text = String(await r.text()).split(key).join('***');
    // 브이월드의 상태 코드와 본문을 그대로 돌려준다(Worker가 사유를 화면에 보이기 위해)
    return send(r.status, text, r.headers.get('content-type') || 'text/plain; charset=utf-8');
  } catch (e) {
    const key = process.env.VWORLD_KEY || '';
    return send(502, { error: String((e && e.message) || e).split(key).join('***') });
  }
};
