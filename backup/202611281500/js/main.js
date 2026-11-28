/*
 * js/main.js : 화면 이벤트 연결과 시작 코드
 * backup/202611222155/index.html(v6.0)의 스크립트를 기능 변경 없이 나눈 파일입니다.
 * 함수 선언은 두지 않습니다. 원본의 최상위 실행문을 원래 순서 그대로 둡니다.
 * 불러오는 순서: common → api → customer → building → price → pension → application → main
 */

$('tokenIn').value = token();

$('tokenBtn').onclick = function() {
  localStorage.setItem('branchToken', $('tokenIn').value.trim());
  checkToken();
};

$('col_growth').addEventListener('input', function() { rateFieldInput(this); colRefresh(); }); // 입력칸이 요약 줄로 옮겨져 Step 5 영역의 입력 감지에서 빠졌으므로 직접 연결
$('loginForm').onsubmit = function(e) { e.preventDefault(); doLogin(); };
$('logoutBtn').onclick = function() { lockScreen('로그아웃되었습니다.'); };

checkToken();

(function initToday() {
  var now = new Date();
  $('sign_year').value = now.getFullYear();
  $('sign_month').value = now.getMonth() + 1;
  $('sign_day').value = now.getDate();
})();

$('ownerBirth').oninput = function() {
  this.value = digits(this.value).slice(0, 6);
  if (this.value.length === 6) {
    var cur = $('app_ssn').value;
    var tail = cur.indexOf('-') >= 0 ? cur.split('-')[1] : '';
    $('app_ssn').value = this.value + '-' + (tail || '');
  }
  updateDocList();
};

$('spouseBirth').oninput = function() {
  this.value = digits(this.value).slice(0, 6);
  if (this.value.length === 6) {
    var cur = $('sp_ssn').value;
    var tail = cur.indexOf('-') >= 0 ? cur.split('-')[1] : '';
    $('sp_ssn').value = this.value + '-' + (tail || '');
  } else if (this.value.length === 0) {
    $('sp_ssn').value = '';
  }
  updateDocList();
};

$('lump').oninput = function() {
  recalcInchulBalance();
};

$('basicPension').onchange = $('oneHouse').onchange = $('under25').onchange = function() {
  updateDocList();
};

$('ratio').value = localStorage.getItem('ratio') || '140';

$('ratio').onchange = function() {
  if (Number(this.value) < 100) this.value = '100';
  localStorage.setItem('ratio', this.value);
  buildPriceOptions();
  applyPrice();
  bldPriceSummary();
};

/* ───── 2. 주소 검색 & 건축물·토지·대지권 요약 ───── */
$('addrBtn').onclick = searchAddrUI;

$('addrQ').onkeydown = function(e) {
  if (e.key === 'Enter') searchAddrUI();
};

$('dongSel').onchange = function() {
  var i = this.value; if (i === '' || !S.bld) return;
  var dong = S.bld.dongs[Number(i)];
  resetUnit(); $('hoSel').innerHTML = ''; $('hoSel').disabled = true;
  setPill('stUnit', 'loading', '⏳ ' + dong + ' 호 목록 조회 중...');
  api('/api/bld/units?' + qs(Object.assign({}, S.addr, { dongNm: dong }))).then(function(units) {
    S.units = units;
    if (!units.length) {
      setPill('stUnit', 'none', '전유부 목록 없음');
      banner('bldMsg', 'warn', '이 동의 전유부(호) 목록이 조회되지 않습니다 — 주소 검색창에 동·호를 함께 입력해 검색하거나 면적·가격을 직접 입력하세요.');
      $('area').readOnly = false;
      buildPriceOptions(); applyPrice();
      return;
    }
    setPill('stUnit', 'ok', '✓ ' + dong + ' (' + units.length + '세대)');
    fill($('hoSel'), units, function(u) {
      return u.hoNm + ' · ' + (u.under ? '지하 ' : '') + (u.flr != null ? u.flr + '층' : '층 미확인') + (u.lowest ? ' · 최저층' : '');
    }, '호 선택 (' + units.length + '세대)');
    renderBldBanner(dong, '', null);
    if (units.length === 1) { $('hoSel').value = '0'; $('hoSel').onchange(); }
  }).catch(function(e) {
    setPill('stUnit', 'fail', '✗ 호 목록 실패');
    banner('bldMsg', 'err', '호 목록 조회 실패: ' + e.message);
  });
};

$('hoSel').onchange = function() {
  var i = this.value; if (i === '') return;
  var u = S.units[Number(i)]; if (!u) return;
  var dong = S.bld && S.bld.dongs.length ? S.bld.dongs[Number($('dongSel').value)] : '';
  loadUnit(dong, u.hoNm, u, Promise.resolve(S.bld));
};

$('area').oninput = function() {
  $('area_bldg').value = this.value;
  buildPriceOptions();
  applyPrice();
  bldPriceSummary();
};

$('priceBase').onchange = function() {
  S.base = this.value;
  S.userBase = true;
  applyPrice();
  if (S.base === 'manual') $('housePrc').focus();
};

$('lowest').onchange = function() { buildPriceOptions(); applyPrice(); };

$('housePrc').oninput = function() {
  S.userBase = true;
  if (S.base !== 'manual') { S.base = 'manual'; $('priceBase').value = 'manual'; }
  priceNotes();
  updateDocList();
};

/* ───── 4. 예상연금 조회 ───── */
$('calcBtn').onclick = function() {
  var rawOb = digits($('ownerBirth').value), rawSb = digits($('spouseBirth').value), hp = Number($('housePrc').value);
  if (!validYmd6(rawOb)) { alert('신청자 생년월일을 주민번호 앞자리처럼 6자리(예: 601231)로 입력하세요.'); $('ownerBirth').focus(); return; }
  if (rawSb && !validYmd6(rawSb)) { alert('배우자 생년월일을 6자리(예: 601231)로 입력하거나, 배우자가 없으면 비워두세요.'); $('spouseBirth').focus(); return; }
  if (!hp) { alert('평가주택가격을 확인하세요.'); $('housePrc').focus(); return; }
  if (S.officetel) { alert('주거목적 오피스텔은 이 도구에서 산출하지 않습니다. 공사 홈페이지(주택구분: 주거목적 오피스텔) 또는 담당자 산출로 안내해 주세요.'); return; }

  var ob8 = ymd6To8(rawOb);
  var sb8 = rawSb ? ymd6To8(rawSb) : '';

  $('calcState').textContent = '예상연금 API 호출 중... (최대 5~6건 호출, 수 초 소요)';
  $('calcBtn').disabled = true;

  api('/api/pension', {
    method: 'POST',
    body: JSON.stringify({
      housePrc: hp,
      ownerBirth: ob8,
      spouseBirth: sb8,
      lump: Number($('lump').value) || 0,
      basicPension: $('basicPension').value === 'Y',
      oneHouse: $('oneHouse').value === 'Y',
      under25: $('under25').value
    })
  }).then(function(r) {
    S.pensionRes = r;
    S.pickedCol = 0;
    renderPension(r);
    applyPensionToApplication(r, 0);
  }).catch(function(e) {
    alert(e.message);
  }).then(function() {
    $('calcBtn').disabled = false;
    $('calcState').textContent = '';
  });
};

window.pickPensionCol = function(idx) {
  if (!S.pensionRes) return;
  S.pickedCol = idx;
  renderPension(S.pensionRes);
  applyPensionToApplication(S.pensionRes, idx);
  showToast('신청서 지급방식에 [' + S.pensionRes.methodName + ' - ' + S.pensionRes.rows[idx].label + '] 반영 완료');
};

document.querySelectorAll('.ic-sub').forEach(function(inp) {
  inp.addEventListener('input', function() {
    var raw = digits(this.value);
    this.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
    recalcInchulBalance();
  });
});

$('ic7').addEventListener('input', function() {
  var raw = digits(this.value);
  this.value = raw ? Number(raw).toLocaleString('ko-KR') : '';
  var sum = 0;
  document.querySelectorAll('.ic-sub').forEach(function(el) { sum += Number(digits(el.value)) || 0; });
  sum += Number(raw) || 0;
  $('ic_sum_label').textContent = sum > 0 ? '(합계: ' + won(sum) + '원)' : '';
});

$('house_addr').addEventListener('input', function() {
  ['app', 'sp'].forEach(function(who) {
    var cb = $(who + '_addr_same');
    if (cb && cb.checked) syncAddr(who);
  });
});

['sp_name', 'sp_ssn', 'app_addr', 'sp_addr', 'house_type', 'collateral_type'].forEach(function(id) {
  var el = $(id);
  if (el) {
    el.addEventListener('input', updateDocList);
    el.addEventListener('change', updateDocList);
  }
});

document.querySelectorAll('input[name="ownership"], input[name="pay_type"]').forEach(function(el) {
  el.addEventListener('change', updateDocList);
});

syncAddr('app');

syncAddr('sp');

updateDocList();

// Step 5 담보방식 추천 화면 준비
if (typeof colInit === 'function') colInit();
