/*
 * js/pension.js : 4. 예상연금 조회
 * backup/202611222155/index.html(v6.0)의 스크립트를 기능 변경 없이 나눈 파일입니다.
 * 함수 선언만 둡니다.
 * 불러오는 순서: common → api → customer → building → price → pension → application → main
 */

/* ───── 보증금액 계산 ─────
 * 개월 수 = 12 × (101 − 연소자 만나이). 월지급금은 선택된 지급방식의 정액형 초회 월지급금을 모든 회차에 적용한다.
 * 1회차: 초기보증료 = 주택가격 × 1%, 이후 회차는 없음.
 * 매 회차: 기준 = 직전 보증잔액 + (1회차만 초기보증료) + 월지급금
 *          보증료 = 기준 × 보증료율 / 12(1회차 0.95%, 2회차 이후 1%), 이자 = (기준 + 보증료) × 이자율 / 12 (회차별 내림 없음)
 *          보증잔액 = 기준 + 보증료 + 이자
 * 보증금액 = 마지막 회차 보증잔액을 100만 원 단위로 내림 */
function calcGuarantee(monthly, housePrc, ratePct, age) {
  if (!(monthly > 0) || !(housePrc > 0) || age == null || !(ratePct >= 0)) return null;
  var months = 12 * (101 - age);
  if (!(months > 0)) return null;
  var rate = ratePct / 100, init = housePrc * 0.01, bal = 0;
  for (var i = 1; i <= months; i++) {
    var base = bal + (i === 1 ? init : 0) + monthly;
    var fee = base * (i === 1 ? 0.0095 : 0.01) / 12; // 연보증료율: 1회차 0.95%, 2회차 이후 1%
    var intr = (base + fee) * rate / 12;
    bal = base + fee + intr;
  }
  return { months: months, balance: bal, amount: Math.floor(bal / 1000000) * 1000000 };
}

function guaranteeRateSaved() {
  try { return localStorage.getItem('gRate') || ''; } catch (e) { return ''; }
}

function updateGuarantee(r) {
  var el = $('gAmt'), inp = $('gRate');
  if (!el || !inp) return;
  var row = r.rows && r.rows[0];
  var monthly = row && !row.error ? row.first : null;
  var age = (typeof colInputs === 'function') ? colInputs().age : null;
  if (r.status === 'loan_pref' || monthly == null) { el.textContent = '- (월지급금 산출 불가)'; return; }
  if (inp.value === '') { el.textContent = '- (이자율을 입력하면 계산됩니다)'; return; }
  var g = calcGuarantee(monthly, r.housePrc, Number(inp.value), age);
  el.textContent = g ? won(g.amount) + '원' : '-';
  el.title = g ? g.months + '회차 보증잔액 ' + won(g.balance) + '원' : '';
}

function renderPension(r) {
  $('resultSec').style.display = '';
  var age = (typeof colInputs === 'function') ? colInputs().age : null;
  var methodTxt = r.status === 'loan_pref' ? '대출상환우대방식 (API 미지원 · 별도상담)' : r.methodName + '방식';
  var h = '<div>연소자 ' + (age == null ? '-' : age) + '세, 주택가격 ' + won(r.housePrc) + '원(' + baseLabel() + '), ' + methodTxt +
          ', 인출한도(' + (r.imax != null ? won(r.imax) : '-') + ') ' + won(r.lumpUsed) +
          (r.lumpUsed !== r.lump ? ' (한도 조정 전 ' + won(r.lump) + '원)' : '') + '</div>';
  h += '<div style="margin-top:4px;">보증금액 <span id="gAmt"></span> ' +
       '<small>· 이자율(연 %) <input type="number" id="gRate" step="0.01" min="0" style="width:70px;" placeholder="예: 4.5" value="' + guaranteeRateSaved() + '"></small></div>';
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
