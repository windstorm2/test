/*
 * js/pension.js : 4. 예상연금 조회
 * backup/202611222155/index.html(v6.0)의 스크립트를 기능 변경 없이 나눈 파일입니다.
 * 함수 선언만 둡니다.
 * 불러오는 순서: common → api → customer → building → price → pension → application → main
 */


/* ───── 보증금액 계산 ─────
 * 개월 수 = 12 × (101 − min(연소자 만나이, 90). 월지급금은 선택된 지급방식의 정액형 초회 월지급금을 모든 회차에 적용한다.
 * 1회차: 초기보증료 = 내림(주택가격 × 1%)과 일시인출금(설정인출한도)을 1회차 기준에 함께 더한다(2026-11-28). 이후 회차는 없음.
 * 매 회차: 기준 = 직전 보증잔액 + (1회차만 초기보증료 + 일시인출금) + 월지급금
 *          보증료 = 내림(기준 × 0.95% / 12), 이자 = 내림((기준 + 보증료) × 이자율 / 12)
 *          보증잔액 = round(기준 + 보증료 + 이자, 0)
 * 보증금액 = 마지막 회차 보증잔액을 100만 원 단위로 내림 */
/* monthly: 숫자(모든 회차 같은 월지급금) 또는 { first, after, from } (from회차부터 after, 그 전은 first. 초기증액형 그래프용) */
function guaranteeRun(monthly, housePrc, ratePct, age, lump, keep) {
  var payAt = typeof monthly === 'object' ? function(i) { return i >= monthly.from ? monthly.after : monthly.first; } : function() { return monthly; };
  var firstPay = typeof monthly === 'object' ? monthly.first : monthly;
  if (!(firstPay > 0) || !(housePrc > 0) || age == null || !(ratePct >= 0) || ratePct > 30) return null; // 이자율 30% 초과는 입력 오류로 본다
  var effAge = Math.min(age, 90); // 연소자 나이 상한 90세 적용 (최소 132회차)
  var months = 12 * (101 - effAge);
  if (!(months > 0)) return null;
  var lumpAmt = Math.max(0, Number(lump) || 0);
  var rate = ratePct / 100, initFee = Math.floor(housePrc * 0.01), init = initFee + lumpAmt, bal = 0; // init = 초기보증료 + 일시인출금
  // keep이면 그래프용으로 회차별 누적(일시인출금, 월지급금, 보증료, 이자)과 보증잔액을 함께 남긴다(0회차 = 가입 시점)
  var ser = keep ? { lump: [lumpAmt], pay: [0], fee: [initFee], intr: [0], bal: [init] } : null;
  var cumFee = initFee, cumIntr = 0, cumPay = 0;
  for (var i = 1; i <= months; i++) {
    var pay = payAt(i);
    cumPay += pay;
    var base = bal + (i === 1 ? init : 0) + pay;
    var fee = Math.floor(base * 0.0095 / 12); // 연보증료율 0.95% (전 회차), 원 단위 내림
    var intr = Math.floor((base + fee) * rate / 12);
    bal = Math.round(base + fee + intr); // 보증잔액 = round(합계, 0)
    if (keep) {
      cumFee += fee; cumIntr += intr;
      ser.lump.push(lumpAmt); ser.pay.push(cumPay); ser.fee.push(cumFee); ser.intr.push(cumIntr); ser.bal.push(bal);
    }
  }
  return { months: months, balance: bal, amount: Math.floor(bal / 1000000) * 1000000, series: ser, effAge: effAge };
}
function calcGuarantee(monthly, housePrc, ratePct, age, lump) { return guaranteeRun(monthly, housePrc, ratePct, age, lump, false); }

/* 저장된 이자율. 예전 버전이 99(숨김 코드)나 `**`를 저장해 둔 경우 읽지 않고 지운다. */
function guaranteeRateSaved() {
  try {
    var v = localStorage.getItem('gRate') || '5';
    var n = Number(v);
    if (v !== '' && !(n >= 0 && n < 30)) { localStorage.removeItem('gRate'); return ''; }
    return v;
  } catch (e) { return '5'; }
}

/* 보증금액·120%·설정금액은 Worker가 Cloudflare 고정 기준값으로 계산해 예상연금 응답(r.guarantee)에 담아 준다.
   화면의 이자율·상승률 입력칸은 아래 그래프에만 쓴다. */
function updateGuaranteeLine(r) {
  var el = $('gAmt'), st = $('gSet'), p120 = $('g120');
  if (!el) return;
  var g = r.guarantee || {};
  p120.textContent = ''; el.className = 'note'; el.title = '';
  if (st) { st.textContent = g.setAmount != null ? won(g.setAmount) + '원' : '-'; st.className = g.setAmount != null ? '' : 'note'; }
  if (g.error) { el.textContent = '- (' + g.error + ')'; if (st) st.textContent = '- (' + g.error + ')'; return; }
  if (g.amount == null) { el.textContent = '- (월지급금 없음)'; return; }
  el.textContent = won(g.amount) + '원'; el.className = '';
  p120.textContent = '(120% ' + won(g.amount120) + '원)';
}

function updateGuarantee(r) {
  updateGuaranteeLine(r);
  if (typeof updateChart === 'function') updateChart(r);
}

/* 증액기간 종료 후 월지급금: 최초 금액 × 70%를 10원 단위로 반올림 (공사 모의계산과 일치 확인, 2026-11-28) */
function roundAfter(first) { return Math.floor((first * 7 + 50) / 100) * 10; }

function renderPension(r) {
  $('resultSec').style.display = '';
  // 서버(Worker) 버전과 상관없이 같은 값이 나오도록 화면에서도 같은 규칙으로 맞춘다
  (r.rows || []).forEach(function(x) { if (x.afterYear && x.first != null && !x.error) x.after = roundAfter(x.first); });
  var age = (typeof colInputs === 'function') ? colInputs().age : null;
  var methodTxt = r.status === 'loan_pref' ? '대출상환우대 (API 미지원 · 별도상담)' : r.methodName;
  var baseTxt = baseLabel().replace(/\s*시세$/, ''); // "부동산원 시세" → "부동산원"
  var item = function(k, v, cls) { return '<span class="sum-item' + (cls ? ' ' + cls : '') + '"><span class="k">' + k + '</span><span class="v">' + v + '</span></span>'; };
  var h = '<div class="sum">';
  h += '<div class="sum-line">' +
       item('연소자', (age == null ? '-' : age) + '세') +
       item('주택가격', won(r.housePrc) + '원 <span class="sub">(' + baseTxt + ')</span>') +
       item('지급방식', methodTxt) +
       item('설정인출한도', won(r.lumpUsed) + ' <span class="sub">(가능한도 ' + (r.imax != null ? won(r.imax) : '-') + (r.lumpUsed !== r.lump ? ' · 조정 전 ' + won(r.lump) : '') + ')</span>') +
       '</div>';
  h += '<div class="sum-line">' +
       item('보증금액', '<span id="gAmt"></span> <span id="g120" class="sub"></span>', 'key') +
       item('설정금액', '<span id="gSet"></span>', 'key') +
       '</div></div>';
  r.notes.forEach(function(n) {
    h += '<div class="banner ' + (r.status === 'ok' ? 'info' : 'warn') + '">' + n + '</div>';
  });
  $('summary').innerHTML = h;
  // 이자율·상승률 입력칸은 그래프 왼쪽 위에 겹쳐 표시한다(js/chart.js). 기본값은 index.html의 5%·2%이고 저장하지 않는다.
  try { localStorage.removeItem('gRate'); } catch (e) {}
  $('gRate').oninput = function() {
    this.value = this.value.replace(/[^0-9.]/g, '');
    updateChart(r);
  };
  updateGuarantee(r);

  var rows = r.rows;
  var th = '<tr><th>구간</th>';
  rows.forEach(function(x, idx) {
    var cls = idx === S.pickedCol ? ' class="picked-col"' : '';
    var btn = !x.error ? '<br><button type="button" class="c-btn pick' + (idx === S.pickedCol ? ' active' : '') + '" onclick="pickPensionCol(' + idx + ')">' + (idx === S.pickedCol ? '✓ 신청서 반영됨' : '신청서 반영') + '</button>' : '';
    th += '<th' + cls + '>' + x.label + btn + '</th>';
  });
  th += '</tr>';
  $('pThead').innerHTML = th;

  var cell = function(v, idx, sub) {
    var cls = idx === S.pickedCol ? ' class="picked-col"' : '';
    return '<td' + cls + '>' + (v == null ? '-' : '<b>' + won(v) + '원</b>' + (sub ? '<br><small>' + sub + '</small>' : '')) + '</td>';
  };

  var tb = '<tr><td>초회 월지급금 (1년차~)</td>' + rows.map(function(x, i) {
    var cls = i === S.pickedCol ? ' class="picked-col"' : '';
    return x.error ? '<td' + cls + '><small style="color:#777;">' + x.error + '</small></td>' : cell(x.first, i, '');
  }).join('') + '</tr>';

  tb += '<tr><td>증액기간 종료 후 (×70%)</td>' + rows.map(function(x, i) {
    var cls = i === S.pickedCol ? ' class="picked-col"' : '';
    if (x.error) return '<td' + cls + '>-</td>';
    var afterVal = x.after != null ? x.after : x.y11;
    var subTxt = x.afterYear ? '(' + x.afterYear + '년차~)' : '(변동 없음)';
    return cell(afterVal, i, subTxt);
  }).join('') + '</tr>';

  var base = rows[0] ? rows[0].first : null;
  tb += '<tr><td>정액형 대비 초회 차이</td>' + rows.map(function(x, i) {
    var cls = i === S.pickedCol ? ' class="picked-col"' : '';
    if (i === 0 || x.first == null || base == null) return '<td' + cls + '>-</td>';
    var diff = x.first - base;
    return '<td' + cls + ' style="color:' + (diff >= 0 ? '#0b5cad' : '#c62828') + ';">' + (diff > 0 ? '+' : '') + won(diff) + '원</td>';
  }).join('') + '</tr>';

  tb += '<tr><td>정액형 대비 증액종료후 차이</td>' + rows.map(function(x, i) {
    var cls = i === S.pickedCol ? ' class="picked-col"' : '';
    var afterVal = x.after != null ? x.after : x.y11;
    if (i === 0 || afterVal == null || base == null) return '<td' + cls + '>-</td>';
    var diffAfter = afterVal - base;
    return '<td' + cls + ' style="color:' + (diffAfter >= 0 ? '#0b5cad' : '#c62828') + ';">' + (diffAfter > 0 ? '+' : '') + won(diffAfter) + '원</td>';
  }).join('') + '</tr>';

  $('pTbody').innerHTML = tb;
  $('resultSec').scrollIntoView({ behavior: 'smooth' });
}

function applyPensionToApplication(r, colIdx) {
  document.querySelectorAll('input[name="pay_type"]').forEach(function(cb) { cb.checked = false; });
  $('pay_jongsin').value = '';
  $('pay_honhab').value = '';
  $('pay_hwakjung').value = '';

  var row = r.rows[colIdx] || r.rows[0];
  var indcLabel = row ? row.label : '정액형';

  var checkVal = '';
  if (r.status === 'loan_pref') {
    checkVal = '대출상환우대_정액형';
  } else if (r.method === '01') {
    checkVal = '종신지급';
    $('pay_jongsin').value = indcLabel;
  } else if (r.method === '02') {
    checkVal = '종신혼합';
    $('pay_honhab').value = indcLabel;
  } else if (r.method === '06') {
    checkVal = '대출상환_정액형';
  } else if (r.method === '07') {
    checkVal = '우대지급_정액형';
  } else if (r.method === '08') {
    checkVal = '우대혼합_정액형';
  }

  if (checkVal) {
    var targetCb = document.querySelector('input[name="pay_type"][value="' + checkVal + '"]');
    if (targetCb) targetCb.checked = true;
  }

  recalcInchulBalance();
}

function updateLumpGuideBadge() {
  var lump = targetLumpAmt();
  var badge = $('lumpGuideBadge');
  if (lump > 0 || (S.pensionRes && S.pensionRes.imax)) {
    var txt = '💡 설정 인출한도: ' + won(lump) + '원';
    if (S.pensionRes && S.pensionRes.imax != null) {
      txt += ' (최대인출한도: ' + won(S.pensionRes.imax) + '원)';
    }
    txt += ' — 선순위대출 등 입력 시 잔액이 [기타]란에 자동 기입됩니다.';
    badge.textContent = txt;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}
