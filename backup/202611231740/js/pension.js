/*
 * js/pension.js : 4. 예상연금 조회
 * backup/202611222155/index.html(v6.0)의 스크립트를 기능 변경 없이 나눈 파일입니다.
 * 함수 선언만 둡니다.
 * 불러오는 순서: common → api → customer → building → price → pension → application → main
 */

function renderPension(r) {
  $('resultSec').style.display = '';
  var basis = '일시인출금 ' + won(r.lump) + '원' + (r.lumpUsed !== r.lump ? ' (한도 조정 → ' + won(r.lumpUsed) + '원)' : '') +
              ', 우대자격 ' + (r.prefer ? '충족' : '미충족') + (r.imax != null ? ', 최대인출한도 ' + won(r.imax) + '원' : '');
  var h = '<div><small>평가주택가격</small> <b>' + won(r.housePrc) + '원</b> <small>(' + baseLabel() + ')</small></div>';
  h += '<div style="margin-top:6px;"><small>적용 지급방식</small> <span class="big-method">' +
       (r.status === 'loan_pref' ? '대출상환우대방식 (API 미지원 · 별도상담)' : r.methodName + '방식') +
       '</span> <small>· 판정 근거: ' + basis + '</small></div>';
  r.notes.forEach(function(n) {
    h += '<div class="banner ' + (r.status === 'ok' ? 'info' : 'warn') + '">' + n + '</div>';
  });
  $('summary').innerHTML = h;

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
