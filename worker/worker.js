/**
 * 주택연금 상담 보조도구 v6.7 — Cloudflare Worker API 전용
 * Secrets:
 *  - DATA_GO_KR_KEY : 공공데이터포털 일반 인증키
 *  - JUSO_CONFM_KEY : 도로명주소 검색API 승인키
 *  - VWORLD_KEY     : 브이월드(V-World) 오픈API 인증키
 *  - BRANCH_TOKEN   : 지점 접속 토큰 (선택)
 */
const CFG = {
  HF_PENSION: 'https://apis.data.go.kr/B551408/rg-mon-pmt-amt/pmt-info',
  BLD_HUB: 'https://apis.data.go.kr/1613000/BldRgstHubService',
  JUSO: 'https://business.juso.go.kr/addrlink/addrLinkApi.do',
  HF_SISE: 'https://www.hf.go.kr/hf/hinet/sise_zipcode.jsp',
  VWORLD: 'https://api.vworld.kr/ned/data',
  // 브이월드 인증키는 발급 때 등록한 URL(도메인)과 함께 보내야 한다(없으면 INCORRECT_KEY). 2026-11-25 브라우저 시험으로 확인.
  // Cloudflare 변수 VWORLD_DOMAIN으로 바꿀 수 있다.
  VWORLD_DOMAIN: 'https://windstorm2.github.io/home_pension/',
  PREF_CAP: 250_000_000,
  INDC: [
    ['01', '정액형', null],
    ['44', '초기증액형(3년)', 4],
    ['43', '초기증액형(5년)', 6],
    ['42', '초기증액형(7년)', 8],
    ['41', '초기증액형(10년)', 11],
  ],
  INCR_METHODS: ['01', '02'],
  HUB_ROWS: 500,
  HUB_MAX_PAGES: 5,
  HUB_CACHE_SEC: 7 * 24 * 3600,
  ALLOWED_ORIGINS: ['https://windstorm2.github.io', 'http://localhost:8080', 'http://127.0.0.1:5500'],
};

const METHOD_NAME = {
  '01': '종신지급',
  '02': '종신혼합',
  '06': '대출상환',
  '07': '우대지급',
  '08': '우대혼합',
};

const fmt = n => (n == null ? '-' : Number(n).toLocaleString('ko-KR'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function corsHeaders(req) {
  const origin = req.headers.get('Origin') || '';
  const allow = CFG.ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.workers.dev') ? origin : CFG.ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Branch-Token',
    'Access-Control-Max-Age': '86400',
  };
}

const json = (o, req, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { 'content-type': 'application/json;charset=utf-8', ...corsHeaders(req) },
  });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
    const url = new URL(req.url);
    const ctx = { env, cache: !url.hostname.endsWith('workers.dev'), n: 0, domain: url.origin };

    try {
      if (url.pathname === '/api/health') {
        return json({
          ok: true,
          version: 'v6.7',
          hasDataKey: !!env.DATA_GO_KR_KEY,
          hasJusoKey: !!env.JUSO_CONFM_KEY,
          hasVworldKey: !!env.VWORLD_KEY,
          needToken: !!env.BRANCH_TOKEN,
          tokenOk: !env.BRANCH_TOKEN || req.headers.get('X-Branch-Token') === env.BRANCH_TOKEN,
          cache: ctx.cache,
        }, req);
      }
      if (!url.pathname.startsWith('/api/')) return json({ ok: true, service: 'homepension-api-v6.7' }, req);
      if (env.BRANCH_TOKEN && req.headers.get('X-Branch-Token') !== env.BRANCH_TOKEN) {
        return json({ error: 'unauthorized' }, req, 401);
      }

      const sp = url.searchParams;
      switch (url.pathname) {
        case '/api/addr':      return json(await searchAddr(sp.get('q'), ctx), req);
        case '/api/bld/dongs': return json(await bldDongs(sp, ctx), req);
        case '/api/bld/units': return json(await bldUnits(sp, ctx), req);
        case '/api/bld/unit':  return json(await bldUnitV3(sp, ctx), req);
        case '/api/bld/raw':   return json(await bldRaw(sp, ctx), req);
        case '/api/bld/price': return json(await bldPriceChunk(sp, ctx), req);
        case '/api/land':      return json(await landInfo(sp, ctx), req);
        case '/api/sise':      return json(await hfSise(sp), req);
        case '/api/pension':   return json(await pensionV5(await req.json(), ctx), req);
      }
      return json({ error: 'unknown api ' + url.pathname }, req, 404);
    } catch (e) {
      console.log(JSON.stringify({ t: new Date().toISOString(), path: url.pathname, err: e.message }));
      return json({ error: e.message }, req, 500);
    }
  },
};

/* ───── 1. 도로명주소 검색 + 동·호 자동 파싱 + 부산·양산 우선 필터 ───── */
function parseAddrQuery(raw) {
  let q = (raw || '').trim(), dong = '', ho = '';
  const m1 = q.match(/^(.*?)\s+([0-9A-Za-z가-힣]{1,5})동\s*([0-9]{1,5})호?\s*$/);
  if (m1) return { q: m1[1].trim(), dong: m1[2], ho: m1[3] };
  const m2 = q.match(/^(.*?(?:동|읍|면|리|가|로|길|\d))\s+([0-9]{1,4})-([0-9]{2,5})호?\s*$/);
  if (m2 && !/(?:로|길)$/.test(m2[1].trim())) return { q: m2[1].trim(), dong: m2[2], ho: m2[3] };
  const m3 = q.match(/^(.*?)\s+([0-9]{2,5})호\s*$/);
  if (m3) return { q: m3[1].trim(), dong: '', ho: m3[2] };
  return { q, dong, ho };
}

const REGION_RE = /^(부산|경남|경상남도|울산|대구|경북|경상북도|서울|경기|경기도|인천|광주|전남|전북|대전|충남|충북|강원|제주|세종)/;
const isLocalTarget = j => {
  const s = `${j.siNm || ''} ${j.sggNm || ''} ${j.roadAddr || ''}`;
  return /부산/.test(s) || /양산/.test(s);
};

async function searchAddr(rawQ, ctx) {
  if (!ctx.env.JUSO_CONFM_KEY) throw new Error('JUSO_CONFM_KEY 미설정');
  const parsed = parseAddrQuery(rawQ);
  const q = parsed.q;
  if (!q || q.length < 2 || /[%=<>'";\\]|--|\b(select|insert|delete|update|drop|union)\b/i.test(q)) {
    throw new Error('검색어를 확인하세요');
  }
  const hasExplicitRegion = REGION_RE.test(q);
  const p = new URLSearchParams({
    confmKey: ctx.env.JUSO_CONFM_KEY,
    keyword: q,
    currentPage: '1',
    countPerPage: '40',
    resultType: 'json',
  });
  const r = await (await fetch(`${CFG.JUSO}?${p}`)).json();
  const c = r.results.common;
  if (c.errorCode !== '0') throw new Error(`주소검색 ${c.errorCode}: ${c.errorMessage}`);
  let rawList = r.results.juso || [];

  if (!hasExplicitRegion && rawList.length > 1) {
    const localHits = rawList.filter(isLocalTarget);
    if (localHits.length > 0) rawList = localHits;
  }

  const items = rawList.slice(0, 20).map(j => ({
    roadAddr: j.roadAddr,
    roadAddrPart1: j.roadAddrPart1,
    jibunAddr: j.jibunAddr,
    bdNm: j.bdNm,
    admCd: j.admCd,
    zipNo: j.zipNo,
    bun: j.lnbrMnnm.padStart(4, '0'),
    ji: j.lnbrSlno.padStart(4, '0'),
    platGbCd: j.mtYn === '1' ? '1' : '0',
    bdKdcd: j.bdKdcd,
  }));
  return { parsed, items };
}

function makePnu(sp) {
  const admCd = (sp.get('admCd') || '').slice(0, 10);
  if (admCd.length !== 10) return '';
  const mt = sp.get('platGbCd') === '1' ? '2' : '1';
  const bun = String(sp.get('bun') || '0000').padStart(4, '0');
  const ji = String(sp.get('ji') || '0000').padStart(4, '0');
  return `${admCd}${mt}${bun}${ji}`;
}

/* 동·호 매칭 점수 산출 (점수가 높을수록 정확히 일치):
   - 10점: 동 번호와 호 번호가 모두 정확히 일치 (최우선)
   -  5점: 레코드에 동 정보가 아예 없거나 단일동 단지이면서 호 번호가 일치
   -  0점: 동 번호가 서로 다름 (예: 101동 306호 vs 103동 306호 → 절대 매칭 금지!) */
function matchUnitRank(rDongRaw, rHoRaw, wantDongRaw, wantHoRaw) {
  const z = x => String(x || '').replace(/^0+(?=\d)/, ''); // 앞자리 0 무시 ("0101" = "101")
  const rh = normHo(rHoRaw), wh = normHo(wantHoRaw);
  if (!wh || !rh) return 0;
  const rhd = z(dg(rh)), whd = z(dg(wh));
  const hoMatch = (rh === wh) || (rhd && whd && rhd === whd);
  if (!hoMatch) return 0;

  const wd = normDong(wantDongRaw), rd = normDong(rDongRaw);
  if (!wd) return 8;
  if (!rd) return 5; // 레코드에 동 필드가 비어있는 경우 후보로만 유지
  if (rd === wd) return 10;
  const wdd = z(dg(wd)), rdd = z(dg(rd));
  if (wdd && rdd) {
    if (wdd === rdd || nums(rd).map(z).includes(wdd)) return 10;
    return 0; // 동 숫자가 다르면(101동 vs 103동) 무조건 0점 탈락!
  }
  return 0;
}

/* 대지권 비율 문자열 파싱 및 정규화 ("39800분의 147.39") */
function normalizeLandRightRatio(rawRate, quotaArea, bldPlatArea, cadastreLandArea) {
  let num = null, den = null;
  const s = String(rawRate || '').trim();

  if (s) {
    // 1) "39800분의 147.39"
    const m1 = s.match(/([\d,.]+)\s*분의\s*([\d,.]+)/);
    if (m1) {
      den = Number(m1[1].replace(/,/g, '')) || null;
      num = Number(m1[2].replace(/,/g, '')) || null;
    } else {
      // 2) "147.39/39800" 또는 "39800/147.39" 또는 "147.39 : 39800"
      const m2 = s.match(/([\d,.]+)\s*[/:]\s*([\d,.]+)/);
      if (m2) {
        const a = Number(m2[1].replace(/,/g, ''));
        const b = Number(m2[2].replace(/,/g, ''));
        if (a > 0 && b > 0) {
          if (a <= b) { num = a; den = b; }
          else { den = a; num = b; }
        }
      } else if (/^\d+(\.\d+)?$/.test(s)) {
        const v = Number(s);
        if (v > 0) num = v;
      }
    }
  }

  const bestTotalLand = (bldPlatArea && Number(bldPlatArea) > 0)
    ? Number(bldPlatArea)
    : ((cadastreLandArea && Number(cadastreLandArea) > 0) ? Number(cadastreLandArea) : null);

  if (!den && bestTotalLand) {
    den = Math.round(bestTotalLand * 100) / 100;
  }

  // 만약 num이 소수 비율(예: 0.00370326)로 들어왔다면 전체 대지면적(den)을 곱해 실제 대지권 면적(147.39)으로 환산
  if (num && den && num < 1 && den > 100) {
    num = Math.round(den * num * 100) / 100;
  }

  if (!num && quotaArea != null && Number(quotaArea) > 0) {
    let q = Number(quotaArea);
    if (den && q < 1 && den > 100) q = den * q;
    num = Math.round(q * 100) / 100;
  }

  // 만약 원문에서 추출한 분모(den)가 대표필지 1개 면적이고 표제부 전체대지면적(bldPlatArea)이 더 크다면 표제부 면적으로 보정하지 않고 원문 분모 유지하되, 원문 분모가 없을 때만 bestTotalLand 사용
  let regRatioText = null;
  if (den && num) {
    regRatioText = `${den}분의 ${num}`;
  } else if (s && /분의|\//.test(s)) {
    regRatioText = s;
  } else if (num) {
    regRatioText = `${num}㎡`;
  }
  return { ratioNum: num, ratioDen: den, regRatioText };
}

/* 브이월드 요청 머리글. 브라우저로는 되는데 Worker만 520이 나서, 브라우저와 같은 Referer/Origin/User-Agent를 보낸다.
   variant 1은 사용자 지정 머리글 없이(런타임 기본값만) 보내는 대조용이다. */
function vworldHeaders(ctx, fmt, variant) {
  if (variant === 1) return {};
  const dom = ctx.env.VWORLD_DOMAIN || CFG.VWORLD_DOMAIN;
  let origin = dom;
  try { origin = new URL(dom).origin; } catch {}
  return {
    Accept: fmt === 'xml' ? 'application/xml,text/xml,*/*' : 'application/json,text/plain,*/*',
    'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.5',
    Referer: dom,
    Origin: origin,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  };
}

/* ───── 2. 브이월드(V-World) 토지대장 · 개별공시지가 · 대지권등록목록(ldaregList) 조회 (/api/land) ───── */
async function vworldCall(endpoint, params, ctx) {
  if (!ctx.env.VWORLD_KEY) return null;
  ctx.n = (ctx.n || 0) + 1;
  // 중요: 브이월드 NED API는 numOfRows가 1000을 넘거나 도메인이 안 맞으면 에러가 나므로 안전한 기본값(500) 사용
  const p = new URLSearchParams({
    key: ctx.env.VWORLD_KEY,
    format: 'json',
    numOfRows: '500',
    pageNo: '1',
    domain: ctx.env.VWORLD_DOMAIN || CFG.VWORLD_DOMAIN,
    ...params,
  });
  const res = await fetch(`${CFG.VWORLD}/${endpoint}?${p}`, { headers: vworldHeaders(ctx, 'json', 0) });
  if (!res.ok) return null;
  try { return await res.json(); } catch { return null; }
}

/* 브이월드 응답 JSON에서 배열(행 목록)을 구조에 상관없이 안전하게 꺼내는 헬퍼 */
function extractVworldRows(res) {
  if (!res || typeof res !== 'object') return [];
  for (const k of Object.keys(res)) {
    const v = res[k];
    if (v && typeof v === 'object') {
      if (Array.isArray(v.field)) return v.field;
      if (v.field && typeof v.field === 'object') return [v.field];
      for (const sk of Object.keys(v)) {
        if (Array.isArray(v[sk])) return v[sk];
      }
    }
  }
  return [];
}

/* 대지권등록목록 전용 호출: 실패해도 HTTP 상태와 본문 앞부분을 돌려줘 사유를 알 수 있게 한다 */
async function vworldRaw(endpoint, params, ctx, fmt, variant) {
  if (!ctx.env.VWORLD_KEY) return { status: 0, text: 'VWORLD_KEY 미등록' };
  ctx.n = (ctx.n || 0) + 1;
  const key = ctx.env.VWORLD_KEY;
  const dom = ctx.env.VWORLD_DOMAIN || CFG.VWORLD_DOMAIN;
  const p = new URLSearchParams({ key, format: fmt || 'json', numOfRows: '100', pageNo: '1', domain: dom, ...params });
  try {
    const res = await fetch(`${CFG.VWORLD}/${endpoint}?${p}`, { headers: vworldHeaders(ctx, fmt, variant || 0) });
    const text = await res.text();
    return { status: res.status, text: String(text).split(key).join('***') };
  } catch (e) {
    return { status: -1, text: String(e && e.message || e).split(key).join('***') };
  }
}

function ldFindTotal(res) {
  if (!res || typeof res !== 'object') return null;
  for (const k of Object.keys(res)) {
    const v = res[k];
    if (v && typeof v === 'object' && v.totalCount != null && Number(v.totalCount) >= 0) return Number(v.totalCount);
  }
  return null;
}

function ldParseXml(t) {
  const rows = [];
  const re = /<LdaregVOList>([\s\S]*?)<\/LdaregVOList>/g;
  let m;
  while ((m = re.exec(t))) {
    const o = {};
    const tre = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
    let x;
    while ((x = tre.exec(m[1]))) o[x[1]] = x[2].trim();
    rows.push(o);
  }
  const tc = t.match(/<totalCount>\s*(\d+)\s*<\/totalCount>/);
  return { rows, total: tc ? Number(tc[1]) : null };
}

/* 응답 본문 해석: JSON 또는 XML. 정상 응답이면 {ok:true, rows, total}, 아니면 {ok:false} */
function ldParse(text) {
  const t = String(text || '').replace(/^\uFEFF/, '').trim();
  let out = null;
  if (t[0] === '{' || t[0] === '[') {
    try { const j = JSON.parse(t); out = { rows: extractVworldRows(j), total: ldFindTotal(j) }; } catch { out = null; }
  } else if (/<LdaregVOList>|<totalCount>/.test(t)) {
    out = ldParseXml(t);
  }
  // 정상 응답에는 totalCount(0 포함)나 행이 있다. 둘 다 없으면 오류 응답으로 본다.
  if (out && (out.total !== null || out.rows.length)) return { ok: true, rows: out.rows, total: out.total };
  return { ok: false };
}

/* 브이월드 대지권등록목록(ldaregList) 조회. 응답: buldDongNm, buldHoNm, ldaQotaRate("분자/분모", 예 81.03/15622.1) */
async function fetchLdragsRight(pnu, dong, ho, ctx) {
  if (!ho) return null;

  const parseRow = r => {
    // 필드명이 무엇이든 대지권 비율/지분/면적 값 자동 탐지
    let rateStr = r.ldaQotaRate ?? r.ladQotaRate ?? r.ldaQotaRt ?? r.ladQotaRt ?? r.dstrbRate ?? r.qotaRate ?? '';
    if (!rateStr) {
      for (const [k, val] of Object.entries(r)) {
        if (/qota|rate|rt/i.test(k) && val && (/\d/.test(String(val)))) {
          rateStr = String(val);
          break;
        }
      }
    }
    const qAr = r.ldaQotaAr ?? r.ladQotaAr ?? r.ldar ?? null;
    const lAr = r.lndpclAr ?? r.platArea ?? null;
    return {
      rawRate: String(rateStr).trim() || null,
      quotaAr: qAr != null && Number(qAr) > 0 ? Number(qAr) : null,
      landAr: lAr != null && Number(lAr) > 0 ? Number(lAr) : null,
      rightKind: r.ldaQotaKndCodeNm ?? r.ladQotaKndCodeNm ?? r.ldaQotaSeCodeNm ?? '소유권대지권',
      jimok: r.lndcgrCodeNm ?? null,
    };
  };

  const getDong = r => r.buldDongNm ?? r.dongNm ?? r.bldgDongNm ?? r.ldadngNm ?? '';
  const getHo   = r => r.buldHoNm ?? r.hoNm ?? r.bldgHoNm ?? r.ldahoNm ?? '';

  const pickBestHit = arr => {
    let bestRank = 0, bestRows = [];
    for (const r of arr) {
      const rk = matchUnitRank(getDong(r), getHo(r), dong, ho);
      if (rk > bestRank) { bestRank = rk; bestRows = [r]; }
      else if (rk > 0 && rk === bestRank) bestRows.push(r);
    }
    if (!bestRows.length) return null;
    const parsed = bestRows.map(parseRow);
    return parsed.find(x => x.rawRate || x.quotaAr) || parsed[0];
  };

  // 진단 정보(화면에 실패 사유를 보이기 위함): 읽은 쪽·행 수, 전체 건수, 동 이름 예시, 중단 사유, 시도 기록
  const meta = ctx.ld = { pages: 0, rows: 0, total: null, matched: false, stop: '', dongs: [], tries: [], fmt: '', size: 0 };
  const addRows = arr => {
    meta.rows += arr.length;
    for (const r of arr) {
      if (meta.dongs.length >= 6) break;
      const d = String(getDong(r) || '').trim();
      if (d && d !== '0000' && !meta.dongs.includes(d)) meta.dongs.push(d);
    }
  };
  let fallbackCandidate = null;
  // 한 쪽을 훑어 동·호가 정확히 일치(rank=10)하면 결과를 돌려주고, 아니면 후보만 기억
  const scan = arr => {
    const hit = pickBestHit(arr);
    if (!hit || !(hit.rawRate || hit.quotaAr)) return null;
    if (arr.some(r => matchUnitRank(getDong(r), getHo(r), dong, ho) === 10)) { meta.matched = true; return { ...hit, source: '대지권등록부' }; }
    if (!fallbackCandidate) fallbackCandidate = { ...hit, source: '대지권등록부' };
    return null;
  };

  const fetchPage = async (pg, fmt, size, hv) => {
    const r = await vworldRaw('ldaregList', { pnu, numOfRows: String(size), pageNo: String(pg) }, ctx, fmt, hv);
    return { r, parsed: ldParse(r.text) };
  };

  // 1쪽: 조건을 바꿔 가며 성공하는 방식을 찾는다(JSON 500건 → JSON 100건 → XML 100건). 성공한 방식을 이후 쪽에도 쓴다.
  let fmt = '', size = 0, first = null, hvOk = 0;
  for (const [f, n, hv] of [['json', 500, 0], ['json', 100, 1], ['xml', 100, 0]]) {
    const { r, parsed } = await fetchPage(1, f, n, hv);
    meta.tries.push({ f, n, v: hv, s: r.status, h: parsed.ok ? 'OK' : String(r.text).replace(/\s+/g, ' ').slice(0, 90) });
    if (parsed.ok) { fmt = f; size = n; first = parsed; hvOk = hv; break; }
    if (ctx.n >= 38) break;
  }
  meta.pages = 1;
  if (!first) { meta.stop = 'error'; return null; }
  meta.fmt = fmt; meta.size = size; meta.total = first.total;
  if (!first.rows.length) { meta.stop = 'empty'; return null; }
  addRows(first.rows);
  const exact1 = scan(first.rows);
  if (exact1) return exact1;

  // 나머지 쪽: 브이월드가 요청한 건수보다 적게 돌려줘도(1쪽 크기 기준) 전체 건수(totalCount)까지 끝까지 읽는다.
  // 요청당 외부 호출 한도(50회)를 지키기 위해 호출 38회에서 멈추고, 6쪽씩 병렬로 읽는다.
  const got = first.rows.length;
  const totalPages = meta.total && got ? Math.ceil(meta.total / got) : (got >= size ? 2 : 1);
  for (let pg = 2; pg <= totalPages;) {
    const room = 38 - ctx.n;
    if (room <= 0) { meta.stop = 'budget'; break; }
    const batch = [];
    for (let k = 0; k < Math.min(6, room) && pg <= totalPages; k++, pg++) batch.push(pg);
    const rs = await Promise.all(batch.map(p2 => fetchPage(p2, fmt, size, hvOk)));
    meta.pages += batch.length;
    for (const { parsed } of rs) {
      if (!parsed.ok || !parsed.rows.length) continue;
      addRows(parsed.rows);
      const ex = scan(parsed.rows);
      if (ex) return ex;
    }
  }

  return fallbackCandidate;
}

async function landInfo(sp, ctx) {
  const pnu = makePnu(sp);
  const bldPlatArea = Number(sp.get('platArea') || 0) || null;
  if (!pnu) return { hasKey: !!ctx.env.VWORLD_KEY, pnu: null };
  if (!ctx.env.VWORLD_KEY) {
    return { hasKey: false, pnu, reason: 'VWORLD_KEY 미등록' };
  }

  const dong = (sp.get('dongNm') || '').trim();
  const ho = (sp.get('hoNm') || '').trim();
  const curYear = new Date().getFullYear();

  // 1) 토지임야대장(ladfrlList, numOfRows=10) + 2) 개별공시지가(getIndvdLandPriceAttr, numOfRows=20) + 3) 대지권등록목록(ldaregList) 병렬 호출
  const [ladRes, priceRes, ldragsHit] = await Promise.all([
    vworldCall('ladfrlList', { pnu, numOfRows: '10' }, ctx),
    vworldCall('getIndvdLandPriceAttr', { pnu, numOfRows: '20' }, ctx),
    ho ? fetchLdragsRight(pnu, dong, ho, ctx) : Promise.resolve(null),
  ]);

  let jimok = ldragsHit?.jimok || null;
  let cadastreLandArea = ldragsHit?.landAr || null;

  const ladArr = extractVworldRows(ladRes);
  if (ladArr[0]) {
    if (!jimok) jimok = ladArr[0].lndcgrCodeNm || null;
    if (!cadastreLandArea && ladArr[0].lndpclAr != null) cadastreLandArea = Number(ladArr[0].lndpclAr);
  }

  if (!jimok || !cadastreLandArea) {
    const charRes = await vworldCall('getLandCharacteristics', { pnu, stdrYear: String(curYear - 1), numOfRows: '10' }, ctx);
    const cArr = extractVworldRows(charRes);
    if (cArr[0]) {
      if (!jimok) jimok = cArr[0].lndcgrCodeNm || null;
      if (!cadastreLandArea && cArr[0].lndpclAr != null) cadastreLandArea = Number(cArr[0].lndpclAr);
    }
  }

  // 개별공시지가 최신 연도 추출
  let landPricePerM2 = null, landPriceYear = null;
  const pArr = extractVworldRows(priceRes);
  if (pArr.length) {
    pArr.sort((a, b) => String(b.stdrYear || '').localeCompare(String(a.stdrYear || '')));
    const bestP = pArr.find(x => Number(x.pblntfPclnd) > 0) || pArr[0];
    if (bestP && Number(bestP.pblntfPclnd) > 0) {
      landPricePerM2 = Number(bestP.pblntfPclnd);
      landPriceYear = bestP.stdrYear;
    }
  }

  // 4) 공동주택속성(getApartHousingPriceAttr) 조회: 공시가격 추출 및 대지권 2순위 보강
  let landRightArea = ldragsHit?.quotaAr || null;
  let rawRate = ldragsHit?.rawRate || null;
  let rightSource = ldragsHit ? '대지권등록부' : null;
  let aptPubPrice = null, aptPubYear = null;

  if (ho) {
    for (const yr of [curYear, curYear - 1]) {
      const aptRes = await vworldCall('getApartHousingPriceAttr', { pnu, stdrYear: String(yr), numOfRows: '500' }, ctx);
      const aArr = extractVworldRows(aptRes);
      if (!aArr.length) continue;

      let bestRank = 0, hit = null;
      for (const r of aArr) {
        const rk = matchUnitRank(r.dongNm ?? r.bldgDongNm ?? r.buldDongNm, r.hoNm ?? r.bldgHoNm ?? r.buldHoNm, dong, ho);
        if (rk > bestRank) { bestRank = rk; hit = r; }
      }

      if (hit) {
        if (Number(hit.pblntfPc) > 0 && !aptPubPrice) {
          aptPubPrice = Number(hit.pblntfPc);
          aptPubYear = yr;
        }
        if (!rawRate && (hit.ldaQotaRate || hit.ladQotaRate)) {
          rawRate = String(hit.ldaQotaRate ?? hit.ladQotaRate).trim();
          rightSource = '공동주택속성';
        }
        if (!landRightArea && (hit.ldaQotaAr != null || hit.ladQotaAr != null || hit.ldar != null)) {
          landRightArea = Number(hit.ldaQotaAr ?? hit.ladQotaAr ?? hit.ldar);
          if (!rightSource) rightSource = '공동주택속성';
        }
        break;
      }
    }
  }

  const effectiveTotalLandArea = (ho && bldPlatArea && bldPlatArea > 0) ? bldPlatArea : (cadastreLandArea || bldPlatArea);
  const normRight = normalizeLandRightRatio(rawRate, landRightArea, bldPlatArea, cadastreLandArea);
  if (!landRightArea && normRight.ratioNum) landRightArea = normRight.ratioNum;

  return {
    hasKey: true,
    pnu,
    jimok,
    landArea: effectiveTotalLandArea || normRight.ratioDen || null,
    cadastreLandArea,
    landPricePerM2,
    landPriceYear,
    landPriceTotal: (effectiveTotalLandArea && landPricePerM2) ? Math.round(effectiveTotalLandArea * landPricePerM2) : null,
    landRightArea,
    landRightRatio: normRight.regRatioText,
    ratioNum: normRight.ratioNum,
    ratioDen: normRight.ratioDen,
    rightKind: ldragsHit?.rightKind || (ho ? '소유권대지권' : null),
    rightSource,
    ldareg: ctx.ld || null,
    aptPubPrice,
    aptPubYear,
  };
}

/* ───── 3. 건축HUB 건축물대장 ───── */
async function hubFetch(u, op, ctx) {
  const ck = new Request(u);
  if (ctx.cache) {
    const hit = await caches.default.match(ck).catch(() => null);
    if (hit) { try { return await hit.json(); } catch {} }
  }
  let last = '';
  for (let i = 0; i < 4; i++) {
    if (i) await sleep(450 * i);
    ctx.n = (ctx.n || 0) + 1;
    if (ctx.n > 46) throw new Error('외부 호출 한도(50회) 근접');
    let res, text;
    try {
      res = await fetch(u, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 homepension-branch-tool' } });
      text = await res.text();
    } catch (e) { last = '접속 실패: ' + e.message; continue; }
    let r = null; try { r = JSON.parse(text); } catch {}
    const h = r?.response?.header;
    if (h?.resultCode === '00') {
      if (ctx.cache) {
        await caches.default.put(ck, new Response(JSON.stringify(r), {
          headers: { 'content-type': 'application/json', 'cache-control': 'max-age=' + CFG.HUB_CACHE_SEC },
        })).catch(() => {});
      }
      return r;
    }
    if (h?.resultCode === '03') return { response: { body: { totalCount: 0 } } };
    if (h) throw new Error(`건축HUB ${op} ${h.resultCode} ${h.resultMsg ?? ''}`);
    const g = r?.OpenAPI_ServiceResponse?.cmmMsgHeader;
    const m = text.match(/<(?:resultMsg|returnAuthMsg|errMsg)>([^<]*)</);
    last = `HTTP ${res.status}: ${g ? `${g.errMsg}(${g.returnReasonCode})` : (m ? m[1] : (text.slice(0, 80) || '빈 응답'))}`;
  }
  throw new Error(`건축HUB ${op} ${last}`);
}

async function hub(op, params, ctx, opt = {}) {
  if (!ctx.env.DATA_GO_KR_KEY) throw new Error('DATA_GO_KR_KEY 미설정');
  const items = [];
  for (let page = 1; page <= (opt.maxPages || CFG.HUB_MAX_PAGES); page++) {
    const u = `${CFG.BLD_HUB}/${op}?${new URLSearchParams({
      serviceKey: ctx.env.DATA_GO_KR_KEY,
      _type: 'json',
      numOfRows: String(opt.rows || CFG.HUB_ROWS),
      pageNo: String(page),
      ...params,
    })}`;
    const r = await hubFetch(u, op, ctx);
    const raw = r.response?.body?.items?.item ?? [];
    const it = Array.isArray(raw) ? raw : [raw];
    items.push(...it);
    if (!it.length || items.length >= Number(r.response?.body?.totalCount || 0)) break;
    if (opt.stopWhen && opt.stopWhen(items)) break;
  }
  return items;
}

const lot = sp => ({
  sigunguCd: sp.get('admCd').slice(0, 5),
  bjdongCd: sp.get('admCd').slice(5, 10),
  platGbCd: sp.get('platGbCd') || '0',
  bun: sp.get('bun'),
  ji: sp.get('ji') || '0000',
});
const norm = s => String(s || '').replace(/\s/g, '').toUpperCase();
const HL = { 에이치: 'H', 더블유: 'W', 에이: 'A', 에프: 'F', 에스: 'S', 아이: 'I', 제이: 'J', 케이: 'K', 브이: 'V', 엑스: 'X', 와이: 'Y', 제트: 'Z', 비: 'B', 시: 'C', 씨: 'C', 디: 'D', 이: 'E', 지: 'G', 엘: 'L', 엠: 'M', 엔: 'N', 오: 'O', 피: 'P', 큐: 'Q', 알: 'R', 티: 'T', 유: 'U' };
const LH = Object.fromEntries(Object.entries(HL).map(([k, v]) => [v, k]));
const latin = s => s.replace(/[가-힣]+/g, m => HL[m] ?? m);
const hangul = s => s.replace(/[A-Z]/g, c => LH[c] || c);
const normDong = s => latin(norm(s).replace(/^제/, '').replace(/동$/, ''));
const normHo = s => latin(norm(s).replace(/^제/, '').replace(/호$/, ''));
const dg = s => String(s || '').replace(/\D/g, '');
const nums = s => String(s || '').split(/[^0-9]+/).filter(Boolean);
const isExpos = r => String(r.exposPubuseGbCd ?? '') === '1' || /전유/.test(r.exposPubuseGbCdNm || '');
const isMain = r => r.mainAtchGbCd == null || r.mainAtchGbCd === '' || String(r.mainAtchGbCd) === '0' || /^주/.test(r.mainAtchGbCdNm || '');
const hoNum = h => Number(dg(h)) || 0;
const guessFloor = ho => { const d = dg(ho); if (!d) return null; if (d.length <= 1) return 1; if (d.length <= 3) return Number(d[0]); return Number(d.slice(0, -2)); };

function pairScore(r, dong, ho) {
  const rd = normDong(r.dongNm), rh = normHo(r.hoNm), wd = normDong(dong), wh = normHo(ho);
  const wdd = dg(wd), rhd = dg(rh), whd = dg(wh);
  const dongOk = !wd || !rd || rd === wd || (!!wdd && (nums(rd).includes(wdd) || dg(rd) === wdd));
  if (!wh) return dongOk ? 3 : 0;
  if (rh === wh) return dongOk ? 3 : 0;
  if (rhd === whd && dongOk) return 2;
  if (wdd && rhd === wdd + whd && (dongOk || !rd)) return 2;
  if (rd && whd === dg(rd) + rhd) return 2;
  if (wdd && !rd && rhd.startsWith(wdd) && rhd.endsWith(whd)) return 1;
  return 0;
}

async function exposRows(op, sp, dong, ho, ctx) {
  const pick = rows => {
    let best = 0, hit = [];
    for (const r of rows) {
      const s = pairScore(r, dong, ho);
      if (s > best) { best = s; hit = [r]; } else if (s && s === best) hit.push(r);
    }
    return hit;
  };
  const nd = dong ? normDong(dong) : '';
  const dongVars = dong ? [...new Set([dong, dong.replace(/동$/, ''), nd, nd + '동', hangul(nd), hangul(nd) + '동'].filter(Boolean))] : [];
  const tries = [];
  if (dong && ho) tries.push([dong, ho]);
  for (const d of dongVars) tries.push([d, '']);
  if (ho) tries.push(['', ho]);
  tries.push(['', '']);
  const seen = new Set();
  for (const [d, h] of tries) {
    const k = d + '|' + h; if (seen.has(k)) continue; seen.add(k);
    const p = { ...lot(sp) }; if (d) p.dongNm = d; if (h) p.hoNm = h;
    const hit = pick(await hub(op, p, ctx, { maxPages: d || h ? 2 : 3 }));
    if (hit.length) return hit;
  }
  return [];
}

async function bldRaw(sp, ctx) {
  const dong = sp.get('dongNm') || '';
  let rows = await hub('getBrExposPubuseAreaInfo', { ...lot(sp), ...(dong ? { dongNm: dong } : {}) }, ctx, { rows: 300, maxPages: 1 });
  if (!rows.length && dong) rows = await hub('getBrExposPubuseAreaInfo', lot(sp), ctx, { rows: 300, maxPages: 1 });
  const dongs = [...new Set(rows.map(r => norm(r.dongNm) || '(없음)'))].slice(0, 15);
  const hos = [...new Set(rows.filter(isExpos).map(r => norm(r.hoNm)).filter(Boolean))].sort((a, b) => hoNum(a) - hoNum(b)).slice(0, 40);
  return { total: rows.length, dongs, hos };
}

async function bldDongs(sp, ctx) {
  const rows = await hub('getBrTitleInfo', lot(sp), ctx, { rows: 300, maxPages: 2 });
  const dongs = [...new Set(rows.map(r => norm(r.dongNm)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
  const dongFlrs = {}, dongHhlds = {}, dongTotAreas = {};
  let useAprDay = '', maxPlatArea = 0;

  for (const r of rows) {
    const dn = normDong(r.dongNm);
    const gf = Number(r.grndFlrCnt || 0);
    const hh = Number(r.hhldCnt || 0) || Number(r.hoCnt || 0) || Number(r.fmlyCnt || 0);
    const pa = Number(r.platArea || 0);
    const ta = Number(r.totArea || 0);
    if (pa > maxPlatArea) maxPlatArea = pa;
    if (dn && gf > 0 && (!dongFlrs[dn] || gf > dongFlrs[dn])) dongFlrs[dn] = gf;
    if (dn && hh > 0 && (!dongHhlds[dn] || hh > dongHhlds[dn])) dongHhlds[dn] = hh;
    if (dn && ta > 0 && isMain(r) && (!dongTotAreas[dn] || ta > dongTotAreas[dn])) dongTotAreas[dn] = ta;
    const ua = String(r.useAprDay || '').trim();
    if (/^\d{8}$/.test(ua) && isMain(r) && (!useAprDay || ua < useAprDay)) useAprDay = ua;
  }

  const m = rows.find(r => isMain(r)) || rows[0] || {};
  if (!useAprDay && /^\d{8}$/.test(String(m.useAprDay || '').trim())) {
    useAprDay = String(m.useAprDay).trim();
  }

  const sumByDong = Object.values(dongHhlds).reduce((s, v) => s + v, 0);
  const singleHhld = Number(m.hhldCnt || 0) || Number(m.hoCnt || 0) || Number(m.fmlyCnt || 0) || null;
  const totalHhld = sumByDong > 0 ? sumByDong : singleHhld;
  const sumTotArea = Object.values(dongTotAreas).reduce((s, v) => s + v, 0);

  if (dongs.length > 1) {
    try {
      const recap = await hub('getBrRecapTitleInfo', lot(sp), ctx, { rows: 10, maxPages: 1 });
      if (recap[0] && Number(recap[0].platArea) > maxPlatArea) maxPlatArea = Number(recap[0].platArea);
    } catch {}
  }

  return {
    dongs,
    dongFlrs,
    dongHhlds,
    useAprDay: useAprDay || null,
    totalHhld,
    bldNm: m.bldNm || '',
    purps: m.mainPurpsCdNm || '',
    etcPurps: m.etcPurps || '',
    strct: m.strctCdNm || '',
    regstr: m.regstrGbCdNm || '',
    hhldCnt: totalHhld ?? (m.hhldCnt ?? null),
    grndFlr: m.grndFlrCnt ? Number(m.grndFlrCnt) : null,
    platArea: maxPlatArea > 0 ? maxPlatArea : (m.platArea ? Number(m.platArea) : null),
    totArea: sumTotArea > 0 ? Math.round(sumTotArea * 100) / 100 : (m.totArea ? Number(m.totArea) : null),
    collective: /집합/.test(m.regstrGbCdNm || '') || dongs.length > 0,
  };
}

async function bldUnits(sp, ctx) {
  const dong = sp.get('dongNm') || '';
  const rows = (await exposRows('getBrExposInfo', sp, dong, '', ctx)).filter(r => isExpos(r) && isMain(r));
  const map = new Map();
  for (const r of rows) {
    const k = normHo(r.hoNm); if (!k) continue;
    const fl = r.flrNo != null && r.flrNo !== '' ? Number(r.flrNo) : null, under = /지하/.test(r.flrGbCdNm || '');
    if (!map.has(k)) map.set(k, { hoNm: r.hoNm, dongNm: r.dongNm, pks: [], flrNo: fl, under, purps: r.mainPurpsCdNm || '' });
    const u = map.get(k);
    if (!u.pks.includes(r.mgmBldrgstPk)) u.pks.push(r.mgmBldrgstPk);
    if (u.flrNo == null && fl != null) u.flrNo = fl;
  }
  const units = [...map.values()].map(u => ({ ...u, dup: u.pks.length > 1, flr: u.flrNo ?? guessFloor(u.hoNm), flrSrc: u.flrNo != null ? '대장' : '추정' }));
  const ground = units.filter(u => !u.under && u.flr != null).map(u => u.flr), minFlr = ground.length ? Math.min(...ground) : 1;
  units.forEach(u => (u.lowest = !u.under && (u.flr === 1 || u.flr === minFlr)));
  return units.sort((a, b) => (a.flr ?? 0) - (b.flr ?? 0) || hoNum(a.hoNm) - hoNum(b.hoNm));
}

async function bldUnit(sp, ctx) {
  const dong = sp.get('dongNm') || '', ho = sp.get('hoNm') || '', pks = (sp.get('pks') || '').split(',').filter(Boolean);
  const rows = (await exposRows('getBrExposPubuseAreaInfo', sp, dong, ho, ctx)).filter(r => isExpos(r) && isMain(r));
  if (!rows.length) return { area: null, purps: '', matched: 0 };
  let mine = pks.length ? rows.filter(r => r.mgmBldrgstPk === pks[0]) : [];
  if (!mine.length) { const pk0 = rows[0].mgmBldrgstPk; mine = rows.filter(r => r.mgmBldrgstPk === pk0); }
  const area = mine.reduce((s, a) => s + Number(a.area || 0), 0), fl = mine.find(a => a.flrNo != null && a.flrNo !== '');
  return {
    area: Math.round(area * 100) / 100,
    purps: [...new Set(mine.map(a => a.mainPurpsCdNm).filter(Boolean))].join(','),
    etcPurps: mine[0].etcPurps || '',
    flrNo: fl ? Number(fl.flrNo) : null,
    under: fl ? /지하/.test(fl.flrGbCdNm || '') : false,
    pk: mine[0].mgmBldrgstPk,
    pks: [...new Set(rows.map(r => String(r.mgmBldrgstPk)).filter(Boolean))],
    matched: mine.length,
    dupPk: new Set(rows.map(r => r.mgmBldrgstPk)).size,
  };
}

async function bldUnitV2(sp, ctx) {
  const dong = (sp.get('dongNm') || '').trim(), ho = (sp.get('hoNm') || '').trim();
  const base = lot(sp);
  const H = { A: '에이', B: '비', C: '씨', D: '디', E: '이', F: '에프', G: '지' }, L = Object.fromEntries(Object.entries(H).map(([k, v]) => [v, k]));
  const core = s => s.replace(/^제/, '').replace(/\s/g, '').replace(/(동|호)$/, '');

  if (ho) {
    const dv = (() => {
      if (!dong) return [''];
      const c = core(dong), s = new Set([c + '동', c, '제' + c + '동']);
      const u = c.toUpperCase();
      if (H[u]) { s.add(H[u] + '동'); s.add(H[u]); }
      if (L[c]) { s.add(L[c] + '동'); s.add(L[c]); }
      return [...s];
    })();
    const hc = core(ho), hv = [hc + '호', hc];
    const tried = [];
    for (const d of dv) for (const h of hv) {
      const p = { serviceKey: ctx.env.DATA_GO_KR_KEY, _type: 'json', numOfRows: '50', pageNo: '1', ...base, hoNm: h };
      if (d) p.dongNm = d;
      let rows = [];
      try {
        const j = await hubFetch(`${CFG.BLD_HUB}/getBrExposPubuseAreaInfo?${new URLSearchParams(p)}`, 'getBrExposPubuseAreaInfo', ctx);
        const it = j?.response?.body?.items?.item ?? [];
        rows = Array.isArray(it) ? it : [it];
      } catch { tried.push(`${d}/${h}:오류`); continue; }
      tried.push(`${d}/${h}:${rows.length}`);
      const mine = rows.filter(x => String(x.exposPubuseGbCd) === '1' && String(x.mainAtchGbCd) === '0');
      if (!mine.length) continue;
      const pks = [...new Set(mine.map(x => String(x.mgmBldrgstPk)).filter(Boolean))];
      const first = mine.filter(x => String(x.mgmBldrgstPk) === pks[0]);
      // 해당 세대의 공용면적 포함 전체 합산면적도 계산 (대지권비율 미제공 단지 추정용)
      const allMyRows = rows.filter(x => String(x.mgmBldrgstPk) === pks[0] && String(x.mainAtchGbCd) === '0');
      const totalUnitArea = Math.round(allMyRows.reduce((s, x) => s + Number(x.area || 0), 0) * 100) / 100;
      const fl = first.find(x => Number(x.flrNo) > 0);
      const x0 = first[0];
      const root = s => (s || '').replace(/\s/g, '').replace(/(구조|조|식)$/, '');
      const sa = (x0.strctCdNm || '').trim(), sb = (x0.etcStrct || '').trim();
      const strct = sa && sb && root(sa) !== root(sb) ? `${sa} (${sb})` : (sa || sb);
      return {
        error: null,
        area: Math.round(first.reduce((s, x) => s + Number(x.area || 0), 0) * 100) / 100,
        totalUnitArea,
        flrNo: fl ? Number(fl.flrNo) : null,
        purps: x0.mainPurpsCdNm,
        etcPurps: x0.etcPurps,
        strct,
        dupPk: pks.length,
        pk: pks[0],
        pks,
        matched: { dongNm: x0.dongNm, hoNm: x0.hoNm },
        tried,
      };
    }
  }
  try { return await bldUnit(sp, ctx); } catch (e) { return { error: e.message }; }
}

async function bldUnitV3(sp, ctx) {
  const r = await bldUnitV2(sp, ctx);
  if (!r || r.area == null) return r;
  const core = s => (s || '').trim().replace(/^제/, '').replace(/(동|호)$/, '');
  const dn = r.matched?.dongNm ?? (core(sp.get('dongNm')) ? core(sp.get('dongNm')) + '동' : '');
  const hn = r.matched?.hoNm ?? (core(sp.get('hoNm')) + '호');

  if (!r.strct) {
    try {
      const p = { serviceKey: ctx.env.DATA_GO_KR_KEY, _type: 'json', numOfRows: '10', pageNo: '1', ...lot(sp), hoNm: hn };
      if (dn) p.dongNm = dn;
      const j = await hubFetch(`${CFG.BLD_HUB}/getBrExposPubuseAreaInfo?${new URLSearchParams(p)}`, 'getBrExposPubuseAreaInfo', ctx);
      const it = j?.response?.body?.items?.item ?? [], x = (Array.isArray(it) ? it : [it]).find(v => String(v.exposPubuseGbCd) === '1');
      if (x) {
        const root = s => (s || '').replace(/\s/g, '').replace(/(구조|조|식)$/, '');
        const a = (x.strctCdNm || '').trim(), b = (x.etcStrct || '').trim();
        r.strct = a && b && root(a) !== root(b) ? `${a} (${b})` : (a || b);
      }
    } catch {}
  }

  // 전유부 기본개요(getBrExposInfo)에서 대지권 면적/비율 추출
  try {
    const p2 = { serviceKey: ctx.env.DATA_GO_KR_KEY, _type: 'json', numOfRows: '50', pageNo: '1', ...lot(sp), hoNm: hn };
    if (dn) p2.dongNm = dn;
    const j2 = await hubFetch(`${CFG.BLD_HUB}/getBrExposInfo?${new URLSearchParams(p2)}`, 'getBrExposInfo', ctx);
    const it2 = j2?.response?.body?.items?.item ?? [];
    const arr2 = Array.isArray(it2) ? it2 : [it2];
    const x2 = arr2.find(v => v && String(v.mgmBldrgstPk) === String(r.pk)) || arr2.find(v => v && matchUnitRank(v.dongNm, v.hoNm, dn, hn) >= 5);
    if (x2) {
      if (x2.ldaQotaAr != null && Number(x2.ldaQotaAr) > 0) r.ldaQotaAr = Number(x2.ldaQotaAr);
      if (x2.ldaQotaRate && String(x2.ldaQotaRate).trim()) r.ldaQotaRate = String(x2.ldaQotaRate).trim();
    }
  } catch {}

  return r;
}

/* 공시가격 조회 (/api/bld/price) */
async function bldPriceChunk(sp, ctx) {
  const pkSet = new Set((sp.get('pk') || '').split(',').map(s => s.trim()).filter(Boolean));
  const admCd = sp.get('admCd') || '';
  const dong = (sp.get('dongNm') || '').trim(), ho = (sp.get('hoNm') || '').trim();
  if (!admCd) return { hsprc: null, status: 'not_found' };

  const yr = Number(sp.get('year')) || new Date().getFullYear();
  const pagesParam = (sp.get('pages') || '1').split(',').map(Number).filter(n => n >= 1);
  const pagesToFetch = pagesParam.slice(0, 2);

  if (pagesToFetch.includes(1) && ctx.env.VWORLD_KEY) {
    const pnu = makePnu(sp);
    if (pnu && ho) {
      const aptRes = await vworldCall('getApartHousingPriceAttr', { pnu, stdrYear: String(yr), numOfRows: '500' }, ctx);
      const aArr = extractVworldRows(aptRes);
      let bestRank = 0, hit = null;
      for (const r of aArr) {
        if (Number(r.pblntfPc) <= 0) continue;
        const rk = matchUnitRank(r.dongNm ?? r.bldgDongNm ?? r.buldDongNm, r.hoNm ?? r.bldgHoNm ?? r.buldHoNm, dong, ho);
        if (rk > bestRank) { bestRank = rk; hit = r; }
      }
      if (hit) {
        return {
          hsprc: Number(hit.pblntfPc),
          stdDay: `${yr}0101`,
          crtnDay: hit.lastUpdtDt ? String(hit.lastUpdtDt).replace(/\D/g, '').slice(0, 8) : `${yr}0101`,
          year: yr,
          scanned: aArr.length,
          totalCount: aArr.length,
          totalPages: 1,
          via: 'vworld',
          status: 'ok',
        };
      }
    } else if (pnu && !ho) {
      const indRes = await vworldCall('getIndvdHousingPriceAttr', { pnu, stdrYear: String(yr), numOfRows: '50' }, ctx);
      const iArr = extractVworldRows(indRes);
      const hit = iArr.find(r => Number(r.housePc) > 0);
      if (hit) {
        return {
          hsprc: Number(hit.housePc),
          stdDay: `${yr}0101`,
          crtnDay: `${yr}0101`,
          year: yr,
          scanned: iArr.length,
          totalCount: iArr.length,
          totalPages: 1,
          via: 'vworld',
          status: 'ok',
        };
      }
    }
  }

  const ROWS = 500;
  const base = { serviceKey: ctx.env.DATA_GO_KR_KEY, _type: 'json', numOfRows: String(ROWS), ...lot(sp) };

  const isTarget = r => {
    const rPk = String(r.mgmBldrgstPk || '').trim();
    if (rPk && pkSet.has(rPk)) return true;
    if (ho && matchUnitRank(r.dongNm, r.hoNm, dong, ho) >= 8) return true;
    if (pkSet.size === 0 && !dong && !ho) return true;
    return false;
  };

  let best = null, scanned = 0, totalCount = 0;

  for (let i = 0; i < pagesToFetch.length; i++) {
    const page = pagesToFetch[i];
    if (i > 0) await sleep(150);
    const u = `${CFG.BLD_HUB}/getBrHsprcInfo?${new URLSearchParams({
      ...base,
      pageNo: String(page),
      startDate: `${yr}0101`,
      endDate: `${yr}1231`,
    })}`;

    const j = await hubFetch(u, 'getBrHsprcInfo', ctx);
    const raw = j?.response?.body?.items?.item ?? [];
    const it = Array.isArray(raw) ? raw : [raw];
    totalCount = Number(j?.response?.body?.totalCount || 0);
    scanned += it.length;

    for (const r of it) {
      if (isTarget(r) && Number(r.hsprc) > 0) {
        if (!best || String(r.stdDay) > String(best.stdDay) || (r.stdDay === best.stdDay && String(r.crtnDay) > String(best.crtnDay))) {
          best = r;
        }
      }
    }
    if (best || !it.length) break;
  }

  const totalPages = Math.ceil(totalCount / ROWS);

  if (best) {
    return {
      hsprc: Number(best.hsprc),
      crtnDay: best.crtnDay,
      stdDay: best.stdDay,
      pk: best.mgmBldrgstPk,
      year: yr,
      scanned,
      totalCount,
      totalPages,
      status: 'ok',
    };
  }

  return {
    hsprc: null,
    year: yr,
    scanned,
    totalCount,
    totalPages,
    checkedPages: pagesToFetch,
    status: 'scanning',
  };
}

/* ───── 4. HF 공동주택 인터넷시세 ───── */
async function hfSise(sp) {
  const zipNo = sp.get('zipNo') || '', addr = sp.get('roadAddr') || '';
  if (!zipNo || !addr) return { status: 'unavailable', reason: '우편번호/도로명주소 없음', items: [] };
  const u = `${CFG.HF_SISE}?${new URLSearchParams({ addrDvcd: '2', sise_gubun: '2', zpcd: zipNo, stnmAddr: addr })}`;
  let html;
  try {
    const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 homepension-branch-tool' } });
    if (!res.ok) return { status: 'unavailable', reason: `HF 시세 HTTP ${res.status}`, items: [] };
    html = await res.text();
  } catch (e) { return { status: 'unavailable', reason: 'HF 시세 접속 실패: ' + e.message, items: [] }; }
  const items = parseSise(html);
  if (!items.length) {
    return {
      status: 'none',
      reason: !/<tr/i.test(html) || /시세가 없|검색결과가 없/.test(html) ? '해당 주소의 등록 시세 없음' : '시세 표 해석 실패',
      items: [],
    };
  }
  return { status: 'ok', items };
}

function parseSise(html) {
  const text = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
  const marks = [...html.matchAll(/부동산원|KB\s*시세|국민은행/g)].map(m => ({ i: m.index, src: /부동산원/.test(m[0]) ? '부동산원' : 'KB' }));
  const items = [];
  for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => text(c[1]));
    if (cells.length < 5) continue;
    const a = cells[0].match(/([\d.]+)\s*\((\d+)\)/), d = cells[1].match(/(\d{4})[.-](\d{2})[.-](\d{2})/);
    if (!a || !d) continue;
    const num = s => { const n = Number(s.replace(/[^\d]/g, '')); return n ? n * 10000 : null; };
    const src = marks.filter(m => m.i < tr.index).pop()?.src || '부동산원';
    items.push({ source: src, area: Number(a[1]), pyeong: Number(a[2]), baseDay: d[1] + d[2] + d[3], type: cells[2], lower: num(cells[3]), avg: num(cells[4]) });
  }
  return items.sort((x, y) => (x.source === y.source ? x.area - y.area : x.source === '부동산원' ? -1 : 1));
}

/* ───── 5. 예상연금 산출 v5 ───── */
async function hfCall5(p, ctx) {
  if (!ctx.env.DATA_GO_KR_KEY) throw new Error('DATA_GO_KR_KEY 미설정');
  ctx.n = (ctx.n || 0) + 1;
  const u = `${CFG.HF_PENSION}?${new URLSearchParams({ serviceKey: ctx.env.DATA_GO_KR_KEY, pageNo: '1', numOfRows: '10', dataType: 'JSON', ...p })}`;
  let text = '';
  try { text = await (await fetch(u)).text(); } catch (e) { return { error: '접속 실패: ' + e.message }; }
  let r = null; try { r = JSON.parse(text); } catch {}
  const g = r?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (g) return { error: `${g.errMsg}(${g.returnReasonCode})` };
  const h = r?.header ?? r?.response?.header;
  if (h && h.resultCode !== '00') return { error: `${h.resultCode} ${h.resultMsg || ''}`.trim() };
  let it = r?.body?.item ?? r?.response?.body?.items?.item ?? r?.body?.items?.item;
  if (Array.isArray(it)) it = it[0];
  if (!it || it.monPmtAmt == null) return { error: '응답 해석 실패: ' + text.slice(0, 120) };
  const num = v => (v == null || v === '' ? null : Number(String(v).replace(/[^\d.-]/g, '')));
  return { amt: num(it.monPmtAmt), imax: num(it.lmaxAmt ?? it.ImaxAmt), imin: num(it.lminAmt) };
}

async function pensionV5(b, ctx) {
  const housePrc = Math.round(Number(b.housePrc));
  if (!housePrc || !/^\d{8}$/.test(b.ownerBirth || '')) throw new Error('평가주택가격·신청자 생년월일을 확인하세요');
  if (b.spouseBirth && !/^\d{8}$/.test(b.spouseBirth)) throw new Error('배우자 생년월일을 확인하세요');

  const lump = Math.max(0, Math.round(Number(b.lump) || 0));
  const notes = [];

  const wantPrefer = !!b.basicPension && !!b.oneHouse && b.under25 !== 'N';
  const prefer = wantPrefer && housePrc < CFG.PREF_CAP;
  if (wantPrefer && housePrc >= CFG.PREF_CAP) {
    notes.push(`평가주택가격(${fmt(housePrc)}원)이 2억 5,000만 원 이상이므로 우대형 대상에서 제외되어 <b>일반형(종신방식)</b>으로 산출했습니다.`);
  }

  const call = (m, indc, w) => {
    const p = {
      housePrc: String(housePrc),
      houseDvcd: '01',
      pnsnPayMthdDvcd: m,
      mmPayAmtIndcDvcd: indc,
      joinPersBrthDy: b.ownerBirth,
      payTermCd: '01',
    };
    if (b.spouseBirth) p.sposBrthDy = b.spouseBirth;
    if (w > 0) p.wdrwLmtSetpAmt = String(w);
    return hfCall5(p, ctx);
  };
  const limitOf = async m => { const r = await call(m, '01', 0); return r.error ? null : r.imax; };

  let method = lump === 0 ? (prefer ? '07' : '01') : (prefer ? '08' : '02');
  let status = 'ok', imax = null, lumpUsed = lump, first = null;

  if (lump > 0) {
    imax = await limitOf(method);
    let ok = imax != null ? lump <= imax : null;
    if (ok === null) { first = await call(method, '01', lump); ok = !first.error; if (ok) imax = first.imax; }
    if (ok) {
      notes.push(`${METHOD_NAME[method]} 최대인출한도 ${fmt(imax)}원 이내 — 일시인출금 ${fmt(lump)}원 적용.`);
    } else {
      const base = METHOD_NAME[method], baseMax = imax;
      method = '06'; first = null; imax = await limitOf('06');
      if (prefer) {
        status = 'loan_pref';
        notes.push(`우대혼합 최대인출한도(${fmt(baseMax)}원) 초과 — <b>대출상환우대방식(API 미지원)</b> 대상입니다. 공사 홈페이지 또는 담당자 별도 산출로 안내해 주세요. 아래 금액은 일반 대출상환방식(우대 미반영) 참고치입니다.`);
      } else {
        notes.push(`${base} 최대인출한도(${fmt(baseMax)}원) 초과 — <b>대출상환방식(정액형만)</b>으로 전환하여 산출했습니다. 인출금은 기존 주택담보대출 상환 용도로만 사용 가능합니다.`);
      }
      if (imax != null && lump > imax) {
        if (status === 'ok') status = 'over_limit';
        lumpUsed = imax;
        notes.push(`대출상환 최대인출한도(${fmt(imax)}원)도 초과 — 한도액(${fmt(imax)}원)으로 하향 조정하여 산출했습니다. 인출금 조정이 필요합니다.`);
      }
    }
  }

  if (!first) {
    first = await call(method, '01', lumpUsed);
    if (imax == null && !first.error) imax = first.imax;
  }

  const makeRow = (code, label, afterYear, r) => {
    if (r.error) return { code, label, afterYear, first: null, after: null, error: r.error };
    const a = r.amt, cut = Math.round(a * 0.7);
    return { code, label, afterYear, first: a, after: afterYear ? cut : a, error: null };
  };

  const incr = CFG.INCR_METHODS.includes(method);
  const rows = [];
  for (const [code, label, afterYear] of CFG.INDC) {
    if (code === '01') rows.push(makeRow(code, label, afterYear, first));
    else if (!incr) rows.push({ code, label, afterYear, first: null, after: null, error: '정액형만 선택 가능' });
    else rows.push(makeRow(code, label, afterYear, await call(method, code, lumpUsed)));
  }

  return { method, methodName: METHOD_NAME[method], prefer, lump, lumpUsed, imax, status, notes, rows, housePrc };
}