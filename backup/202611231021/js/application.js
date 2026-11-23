/*
 * js/application.js : 5. 신청서 주소 동기화, 맞춤형 필요서류 생성
 * backup/202611222155/index.html(v6.0)의 스크립트를 기능 변경 없이 나눈 파일입니다.
 * 함수 선언만 둡니다.
 * 불러오는 순서: common → api → customer → building → price → pension → application → main
 */

/* ───── 5. 신청서 주소 동기화 & 맞춤형 필요서류 생성 ───── */
function syncAddr(who) {
  var checkbox = $(who + '_addr_same');
  var addrInput = $(who + '_addr');
  var houseAddr = $('house_addr').value.trim();
  if (checkbox.checked) {
    addrInput.value = houseAddr || '담보주택과 같음';
    addrInput.readOnly = true;
    addrInput.style.color = '#555';
  } else {
    if (addrInput.value === '담보주택과 같음' || addrInput.value === houseAddr) addrInput.value = '';
    addrInput.readOnly = false;
    addrInput.style.color = '#111';
  }
  updateDocList();
}

function isPreferentialNow() {
  var checkedPays = Array.prototype.map.call(document.querySelectorAll('input[name="pay_type"]:checked'), function(el) { return el.value; });
  if (checkedPays.some(function(v) { return v.indexOf('우대') !== -1; })) return true;
  if (S.pensionRes && S.pensionRes.prefer) return true;
  var bp = $('basicPension').value === 'Y';
  var oh = $('oneHouse').value === 'Y';
  var u25 = $('under25').value;
  var hp = Number($('housePrc').value) || 0;
  return bp && oh && u25 !== 'N' && hp > 0 && hp < 250000000;
}

function updateDocList() {
  // Step 5 담보방식 추천을 같은 입력값으로 다시 계산한다.
  if (typeof colRefresh === 'function') colRefresh();
  var spBirth = digits($('spouseBirth').value);
  var spName  = ($('sp_name').value || '').trim();
  var spSsn   = digits($('sp_ssn').value);
  var hasSpouse = spBirth.length > 0 || spName.length > 0 || spSsn.length > 0;

  var appAddr = ($('app_addr').value || '').trim();
  var spAddr  = ($('sp_addr').value || '').trim();
  var appSame = $('app_addr_same').checked;
  var spSame  = $('sp_addr_same').checked;
  var addrSame = (appSame && spSame) || (appAddr.length > 0 && appAddr === spAddr);

  var ownerVal = document.querySelector('input[name="ownership"]:checked')?.value || '단독';
  var isJoint = ownerVal === '공동';

  var collateral = $('collateral_type').value || '';
  var isTrust = collateral.indexOf('신탁') !== -1;

  var isSpecial = isPreferentialNow();

  var houseType = $('house_type').value || '';
  var isOffice = houseType === '주거용오피스텔' || S.officetel;

  var ic3Val = Number(digits($('ic3').value)) || 0;
  var hasSeniorLoan = ic3Val > 0;

  var appCenter = [
    '신청인 주민등록등본 2부',
    '신청인 주민등록초본 1부 (전 주소 포함)',
    '전입세대확인서 1부',
    '신청인 가족관계증명서(상세) 1부',
    '신청인 인감증명서 2부'
  ];
  if (isTrust) appCenter.push('신청인 지방세 납세증명서 1부 ★');
  if (isSpecial) appCenter.push('기초연금수급자격확인서 1부 <span style="color:#555;font-size:7.5pt;">(2.5억 미만 1주택자)</span>');
  if (isOffice) appCenter.push('지방세 세목별 과세증명서 1부 <span style="color:#555;font-size:7.5pt;">(주거용 오피스텔 확인)</span>');

  var appEtc = [
    '신청인 인감도장 및 신분증'
  ];
  if (hasSeniorLoan) appEtc.push('대출잔액증명서 1부');
  appEtc.push('등기권리증 원본 <span style="color:#555;font-size:7.5pt;">(소지한 경우에 한함)</span>');

  var spCenter = [];
  if (hasSpouse) {
    spCenter.push('배우자 가족관계증명서(상세) 1부');
    spCenter.push('배우자 인감증명서 ' + (isJoint ? '2부' : '1부'));
    if (!addrSame) spCenter.push('배우자 주민등록등본 1부');
    if (isJoint) spCenter.push('배우자 주민등록초본 1부 (전 주소 포함)');
    if (isTrust && isJoint) spCenter.push('배우자 지방세 납세증명서 1부 ★');
  }
  var spEtc = hasSpouse ? ['배우자 인감도장 및 신분증'] : [];

  function renderList(id, items) {
    var ul = $(id);
    if (ul) ul.innerHTML = items.map(function(i) { return '<li>' + i + '</li>'; }).join('');
  }
  renderList('doc-app-center', appCenter);
  renderList('doc-app-etc',    appEtc);
  renderList('doc-sp-center',  spCenter);
  renderList('doc-sp-etc',     spEtc);

  var show = hasSpouse ? '' : 'none';
  $('th-doc-spouse').style.display        = show;
  $('td-doc-spouse-center').style.display = show;
  $('td-doc-spouse-etc').style.display    = show;
  $('col-spouse').style.display           = show;

  var note = $('doc-trust-note');
  if (isTrust) {
    if (!note) {
      note = document.createElement('p');
      note.id = 'doc-trust-note';
      note.style.cssText = 'font-size:7.5pt;color:#b06000;margin-top:3px;padding:2px 5px;background:#fffbf0;border-left:3px solid #d99b10;line-height:1.5;';
      $('doc-list-section').appendChild(note);
    }
    note.innerHTML = '★ 신탁등기용 지방세 납세증명서 요건: ① 주민등록번호 전체 표시 ② 사용목적 「부동산 신탁등기」 체크 ③ 신탁부동산 표시에 담보주택 주소 표시';
  } else if (note) {
    note.remove();
  }

  setTimeout(autoFitPage, 30);
}

function copyDocListText() {
  var hasSpouse = $('th-doc-spouse').style.display !== 'none';
  function extract(sel) {
    var arr = [];
    document.querySelectorAll(sel).forEach(function(li) {
      var t = li.innerText.trim();
      if (t) arr.push('- ' + t);
    });
    return arr;
  }
  var appLines = extract('#doc-app-center li').concat(extract('#doc-app-etc li'));
  var spLines  = extract('#doc-sp-center li').concat(extract('#doc-sp-etc li'));
  var hasTax   = appLines.concat(spLines).some(function(l) { return l.indexOf('지방세 납세증명') !== -1; });

  var text = '[주택연금 신청 필요서류 안내]\n';
  if ($('house_addr').value) text += '▪ 담보주택: ' + $('house_addr').value + '\n';
  text += '\n▶ 신청인 준비서류\n' + appLines.join('\n') + '\n';
  if (hasSpouse && spLines.length) {
    text += '\n▶ 배우자 준비서류\n' + spLines.join('\n') + '\n';
  }
  if (hasTax) {
    text += '\n※ 부동산 신탁등기용 지방세 납세증명서 발급 유의사항\n';
    text += '① 주민등록번호 뒷자리까지 전체 표시\n';
    text += '② 증명서 사용목적에 「부동산 신탁등기」 체크\n';
    text += '③ 신탁부동산 표시란에 담보주택 주소지 표시\n';
  }
  if ($('app_memo').value.trim()) {
    text += '\n※ 상담 메모 / 안내사항\n' + $('app_memo').value.trim() + '\n';
  }

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(function() { showToast('필요서류 목록이 클립보드에 복사되었습니다 ✓'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('필요서류 목록이 복사되었습니다 ✓');
  }
}

function autoFitPage() {
  var A4_PX = 297 * 3.7795;
  var page = document.querySelector('.page');
  var uls = document.querySelectorAll('#doc-list-table ul');
  var lis = document.querySelectorAll('#doc-list-table li');
  if (!page || !lis.length) return;

  uls.forEach(function(ul) { ul.style.lineHeight = '1.35'; });
  var padPx = (13 + 13) * 3.7795;
  var available = A4_PX - padPx;

  if (page.scrollHeight <= available) {
    var lo = 1.35, hi = 3.2;
    for (var i = 0; i < 16; i++) {
      var mid = (lo + hi) / 2;
      uls.forEach(function(ul) { ul.style.lineHeight = String(mid); });
      if (page.scrollHeight <= available) lo = mid;
      else hi = mid;
    }
    uls.forEach(function(ul) { ul.style.lineHeight = String(lo); });
  }
}

function resetAll() {
  if (!confirm('상담 및 신청서의 모든 입력 내용을 초기화하시겠습니까?')) return;
  location.reload();
}
