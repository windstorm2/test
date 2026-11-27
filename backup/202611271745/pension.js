/*
 * js/pension.js : 4. 예상연금 조회
 * backup/202611222155/index.html(v6.0)의 스크립트를 기능 변경 없이 나눈 파일입니다.
 * 함수 선언만 둡니다.
 * 불러오는 순서: common → api → customer → building → price → pension → application → main
 */

/* ───── 숨긴 기준값(99) ─────
 * 이자율·주택가격상승률에 99를 입력하면 화면에서 계산하지 않고 Worker(/api/calc)가 Cloudflare 변수 값으로 계산해 결과만 돌려준다.
 * 같은 입력은 다시 호출하지 않도록 결과를 기억한다. 오류는 5초만 기억해 다시 시도할 수 있게 한다. */
var SECRET_CODE = 99, secCache = {}, secPending = {};

function secretGet(kind, p) { // kind: 'g' 보증금액, 'f' 100세말 예상주택가격
  var key = kind === 'g' ? ['g', p.monthly, p.housePrc, p.age].join('|') : ['f', p.housePrc, p.age].join('|');
  if (secCache[key]) return secCache[key];
  if (!secPending[key]) {
    secPending[key] = 1;
    var body = kind === 'g' ? { housePrc: p.housePrc, age: p.age, monthly: p.monthly, useRate: true } : { housePrc: p.housePrc, age: p.age, useGrowth: true };
    api('/api/calc', { method: 'POST', body: JSON.stringify(body) }).then(function(j) {
      secCache[key] = { state: 'ok', val: kind === 'g' ? (j.guarantee && j.guarantee.amount) : j.future };
    }).catch(function(e) {
      secCache[key] = { state: 'err', msg: e.message };
      setTimeout(function() { delete secCache[key]; }, 5000);
    }).then(function() {
      delete secPending[key];
      if (S.pensionRes) updateGuarantee(S.pensionRes);
      if (typeof colRefresh === 'function') colRefresh();
    });
  }
  return { state: 'wait' };
}

/* ───── 보증금액 계산 ─────
 * 개월 수 = 12 × (101 − min(연소자 만나이, 90). 월지급금은 선택된 지급방식의 정액형 초회 월지급금을 모든 회차에 적용한다.
 * 1회차: 초기보증료 = 내림(주택가격 × 1%), 이후 회차는 없음.
 * 매 회차: 기준 = 직전 보증잔액 + (1회차만 초기보증료) + 월지급금
 *          보증료 = 내림(기준 × 0.95% / 12), 이자 = 내림((기준 + 보증료) × 이자율 / 12)
 *          보증잔액 = round(기준 + 보증료 + 이자, 0)
 * 보증금액 = 마지막 회차 보증잔액을 100만 원 단위로 내림 */
function calcGuarantee(monthly, housePrc, ratePct, age) {
  if (!(monthly > 0) || !(housePrc > 0) || age == null || !(ratePct >= 0)) return null;
  var effAge = Math.min(age, 90); // 연소자 나이 상한 90세 적용 (최소 132회차)
  var months = 12 * (101 - effAge);
  if (!(months > 0)) return null;
  var rate = ratePct / 100, init = Math.floor(housePrc * 0.01), bal = 0;
  for (var i = 1; i <= months; i++) {
    var base = bal + (i === 1 ? init : 0) + monthly;
    var fee = Math.floor(base * 0.0095 / 12); // 연보증료율 0.95% (전 회차), 원 단위 내림
    var intr = Math.floor((base + fee) * rate / 12);
    bal = Math.round(base + fee + intr); // 보증잔액 = round(합계, 0)
  }
  return { months: months, balance: bal, amount: Math.floor(bal / 1000000) * 1000000 };
}

function guaranteeRateSaved() {
  try { return localStorage.getItem('gRate') || ''; } catch (e) { return ''; }
}

function updateGuarantee(r) {
  var el = $('gAmt'), inp = $('gRate'), st = $('gSet');
  if (!el || !inp) return;
  if (st) st.textContent = '';
  var row = r.rows && r.rows[0];
  var monthly = row && !row.error ? row.first : null;
  var age = (typeof colInputs === 'function') ? colInputs().age : null;
  if (r.status === 'loan_pref' || monthly == null) { el.textContent = '- (월지급금 산출 불가)'; return; }
  if (inp.value === '') { el.textContent = '- (이자율을 입력하면 계산됩니다)'; return; }
  var g;
  if (Number(inp.value) === SECRET_CODE) { // 지점 기준값: Worker가 계산한 결과만 받는다
    if (age == null) { el.textContent = '-'; return; }
    var sg = secretGet('g', { monthly: monthly, housePrc: r.housePrc, age: age });
    if (sg.state === 'wait') { el.textContent = '계산 중...'; return; }
    if (sg.state === 'err') { el.textContent = '- (' + sg.msg + ')'; return; }
    g = sg.val != null ? { amount: sg.val } : null;
  } else {
    g = calcGuarantee(monthly, r.housePrc, Number(inp.value), age);
  }
  el.textContent = g ? won(g.amount) + '원' : '-';
  if (st && g) {
    // 보증금액의 120%(100만 원 미만 내림), 설정금액 = 100세말 예상주택가격(등록면허세 등 설정 비용 계산에 쓰는 값)
    var ci = colInputs();
    var fi = colFutureInfo(ci.housePrice, ci.age, ci.growth);
    st.textContent = '(120% ' + won(Math.floor(g.amount * 1.2 / 1000000) * 1000000) + '원) · 설정금액 ' + (fi.val != null ? won(fi.val) + '원' : (fi.note || '- (Step 5 주택가격상승률을 입력하면 표시)'));
  }
  el.title = g && g.months ? g.months + '회차 보증잔액 ' + won(g.balance) + '원' : '';
}

function renderPension(r) {
  $('resultSec').style.display = '';
  var age = (typeof colInputs === 'function') ? colInputs().age : null;
  var methodTxt = r.status === 'loan_pref' ? '대출상환우대 (API 미지원 · 별도상담)' : r.methodName;
  var baseTxt = baseLabel().replace(/\s*시세$/, ''); // "부동산원 시세" → "부동산원"
  var h = '<div>연소자 ' + (age == null ? '-' : age) + '세, 주택가격 ' + won(r.housePrc) + '원(' + baseTxt + '), ' + methodTxt +
          ', 설정인출한도 ' + won(r.lumpUsed) + ' (가능한도 ' + (r.imax != null ? won(r.imax) : '-') + ')' +
          (r.lumpUsed !== r.lump ? ' · 한도 조정 전 ' + won(r.lump) + '원' : '') + '</div>';
  h += '<div style="margin-top:4px;">보증금액 <span id="gAmt"></span> <span id="gSet"></span> ' +
       '<small>· 추정 이자율(연 %) <input type="number" id="gRate" step="0.01" min="0" style="width:70px;" placeholder="예: 4.5" value="' + guaranteeRateSaved() + '"></small></div>';
  r.notes.forEach(function(n) {
    h += '<div class="banner ' + (r.status === 'ok' ? 'info' : 'warn') + '">' + n + '</div>';
  });
  $('summary').innerHTML = h;
  $('gRate').oninput = function() {
    try { localStorage.setItem('gRate', this.value); } catch (e) {}
    updateGuarantee(r);
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
