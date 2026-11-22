/*
 * js/price.js : 공시가격 조회, 3. 주택가격 산정 기준
 * backup/202611222155/index.html(v6.0)의 스크립트를 기능 변경 없이 나눈 파일입니다.
 * 함수 선언만 둡니다.
 * 불러오는 순서: common → api → customer → building → price → pension → application → main
 */

/* ───── 공시가격: 표제부 동별 세대수 누적 비율 계산 + 양방향 2페이지 분할 스캔 ───── */
function calcTargetRatio(dong, ho) {
  if (!S.bld || !S.bld.dongs || !S.bld.dongs.length || !dong) return 0;
  var targetKey = normDongKey(dong);
  var dongs = S.bld.dongs;
  var hhlds = S.bld.dongHhlds || {};

  var idx = dongs.findIndex(function(x) { return normDongKey(x) === targetKey; });
  if (idx < 0) {
    var dNum = digits(targetKey);
    if (dNum) idx = dongs.findIndex(function(x) { return digits(x) === dNum; });
  }
  if (idx < 0) return 0;

  var flr = guessFloor(ho) || 5;
  var maxFlr = getBuildingMaxFloor(dong) || 25;
  var inDongRatio = Math.min(0.9, Math.max(0.1, flr / maxFlr));

  var totalH = 0, beforeH = 0, targetH = 0;
  dongs.forEach(function(dName, i) {
    var k = normDongKey(dName);
    var h = hhlds[k] || 100;
    totalH += h;
    if (i < idx) beforeH += h;
    if (i === idx) targetH = h;
  });

  if (totalH <= 0) return (idx + inDongRatio) / dongs.length;
  return (beforeH + targetH * inDongRatio) / totalH;
}

function buildPageOrder(totalPages, ratio) {
  if (totalPages <= 1) return [];
  var center = ratio > 0 ? Math.max(2, Math.min(totalPages, Math.round(ratio * totalPages))) : 2;
  var order = [];
  var seen = { 1: true };
  for (var d = 0; d <= totalPages; d++) {
    var p1 = center + d;
    var p2 = center - d;
    if (p1 >= 2 && p1 <= totalPages && !seen[p1]) { order.push(p1); seen[p1] = true; }
    if (p2 >= 2 && p2 <= totalPages && !seen[p2]) { order.push(p2); seen[p2] = true; }
  }
  return order;
}

async function startPriceFetch(a, dong, ho, pkStr) {
  var mySeq = ++S.priceSeq;
  S.price = null; S.priceErr = null; S.priceLoading = true;
  setPill('stPrice', 'loading', '⏳ 공시가격 조회 중...');
  bldPriceSummary();

  var curYear = new Date().getFullYear();
  var years = [curYear, curYear - 1];
  var ratio = calcTargetRatio(dong, ho);
  var trace = [];

  for (var yi = 0; yi < years.length; yi++) {
    if (mySeq !== S.priceSeq) return;
    var yr = years[yi];
    setPill('stPrice', 'loading', '⏳ 공시가격 (' + yr + '년 확인 중)...');

    var p1;
    try {
      p1 = await api('/api/bld/price?' + qs(Object.assign({}, a, { dongNm: dong, hoNm: ho, pk: pkStr || '', year: yr, pages: '1' })));
    } catch (e) {
      trace.push(yr + '년:오류(' + e.message + ')');
      continue;
    }
    if (mySeq !== S.priceSeq) return;

    if (p1.status === 'ok' && p1.hsprc) {
      S.price = p1; S.priceLoading = false;
      setPill('stPrice', 'ok', '✓ 공시가격: ' + won(p1.hsprc) + '원 (' + yr + '년)');
      buildPriceOptions(); applyPrice(); bldPriceSummary();
      return;
    }

    var totalPages = Math.min(30, p1.totalPages || 0);
    var scanned = p1.scanned || 0;

    if (totalPages >= 2) {
      var queue = buildPageOrder(totalPages, ratio);
      for (var i = 0; i < queue.length; i += 2) {
        if (mySeq !== S.priceSeq) return;
        var chunk = queue.slice(i, i + 2);
        var doneCnt = Math.min(totalPages, 1 + i + chunk.length);
        var progressMsg = yr + '년 ' + chunk.join('·') + 'P 탐색 중 (' + doneCnt + '/' + totalPages + 'P)';
        setPill('stPrice', 'loading', '⏳ 공시가격: ' + progressMsg);
        S.priceProgress = progressMsg;
        bldPriceSummary();

        try {
          var res = await api('/api/bld/price?' + qs(Object.assign({}, a, { dongNm: dong, hoNm: ho, pk: pkStr || '', year: yr, pages: chunk.join(',') })));
          if (mySeq !== S.priceSeq) return;
          scanned += (res.scanned || 0);
          if (res.status === 'ok' && res.hsprc) {
            S.price = res; S.priceLoading = false; S.priceProgress = '';
            setPill('stPrice', 'ok', '✓ 공시가격: ' + won(res.hsprc) + '원 (' + yr + '년)');
            buildPriceOptions(); applyPrice(); bldPriceSummary();
            return;
          }
        } catch (e) {}
      }
    }
    trace.push(yr + '년:' + scanned + '/' + (p1.totalCount || 0) + '건');
  }

  if (mySeq !== S.priceSeq) return;
  S.price = { hsprc: null, status: 'not_found', trace: trace };
  S.priceLoading = false; S.priceProgress = '';
  setPill('stPrice', 'none', '공시가격: 조회안됨');
  buildPriceOptions(); applyPrice(); bldPriceSummary();
}

function bldPriceSummary() {
  var parts = [];
  if (S.priceLoading) {
    parts.push('공시가격: ⏳ <b>' + (S.priceProgress || '조회 중...') + '</b>');
  } else if (S.price && S.price.hsprc) {
    parts.push('공시가격: <b>' + won(S.price.hsprc) + '원</b> (' + (S.price.year ? S.price.year + '년, ' : '') + '기준 ' + fmtDay(S.price.stdDay || S.price.crtnDay) + ') → ×' + $('ratio').value + '% = <b>' + won(hsprcConv()) + '원</b>');
  } else {
    var diag = (S.price && S.price.trace && S.price.trace.length) ? ' <small style="color:#666;">[' + S.price.trace.join(', ') + ']</small>' : '';
    parts.push('공시가격: <b>' + (S.priceErr ? '조회 실패 (' + S.priceErr + ')' : '조회안됨') + '</b>' + diag);
  }

  if (S.siseLoading) {
    parts.push('HF 시세: ⏳ <b>조회 중...</b>');
  } else {
    var b = bestSise();
    if (b >= 0) {
      var it = S.sise.items[b];
      parts.push('HF 시세(' + it.source + ' ' + it.area + '㎡, ' + fmtDay(it.baseDay) + '): 하위평균 <b>' + won(it.lower) + '원</b> / 일반평균 <b>' + won(it.avg) + '원</b>');
    } else if (S.sise && S.sise.status === 'ok') {
      parts.push('HF 시세: 전용면적 ±' + AREA_TOL + '㎡ 이내 일치 타입 없음 (전체 ' + S.sise.items.length + '개 타입)');
    } else if (S.sise) {
      parts.push('HF 시세: 조회안됨' + (S.sise.reason ? ' (' + S.sise.reason + ')' : ''));
    }
  }
  banner('bldPriceBanner', 'info', parts.join('<br>'));
}

/* ───── 3. 주택가격 산정 기준 ───── */
function isApt() {
  var s = ((S.det && S.det.purps) || '') + ' ' + ((S.unit && S.unit.purps) || '') + ' ' + ((S.bld && (S.bld.purps + ' ' + S.bld.etcPurps)) || '');
  return /아파트|연립/.test(s);
}

function sisePrice(it) { return $('lowest').value === 'Y' ? (it.lower || it.avg) : (it.avg || it.lower); }

function ratio() { return Number($('ratio').value) / 100; }

function hsprcConv() { return S.price && S.price.hsprc ? Math.round(S.price.hsprc * ratio()) : null; }

function siseNear() {
  if (!S.sise || S.sise.status !== 'ok') return [];
  var area = Number($('area').value);
  var all = S.sise.items.map(function(it, i) { return { it: it, i: i, d: area ? Math.abs(it.area - area) : 0 }; });
  return area ? all.filter(function(x) { return x.d <= AREA_TOL; }) : all;
}

function bestSise() {
  if (!isApt() || !Number($('area').value)) return -1;
  var best = -1, bd = 1e9;
  siseNear().forEach(function(x) {
    var rank = x.d + (x.it.source === '부동산원' ? 0 : 0.001);
    if (rank < bd) { bd = rank; best = x.i; }
  });
  return best;
}

function buildPriceOptions() {
  var sel = $('priceBase'); sel.innerHTML = '';
  var add = function(v, t, dis) {
    var o = document.createElement('option');
    o.value = v; o.textContent = t;
    if (dis) o.disabled = true;
    sel.appendChild(o);
  };
  var apt = isApt(), ok = S.sise && S.sise.status === 'ok' && S.sise.items.length;
  if (apt && ok) {
    siseNear().forEach(function(x) {
      var it = x.it;
      add('sise:' + x.i, it.source + ' 시세 | ' + it.area + '㎡(' + it.pyeong + '평) | ' + fmtDay(it.baseDay) + ' | ' + won(sisePrice(it)) + '원');
    });
  }
  if (S.price && S.price.hsprc) {
    add('hsprc', '공시가격 환산 | 공시가격 ' + won(S.price.hsprc) + '원(' + fmtDay(S.price.stdDay || S.price.crtnDay) + ') × ' + $('ratio').value + '% | ' + won(hsprcConv()) + '원');
  } else {
    add('hsprc', '공시가격 환산 | ' + (S.priceLoading ? '조회 중...' : '조회안됨'), true);
  }
  add('manual', '직접 입력 | 상담자 입력값을 평가주택가격으로 사용');

  var b = bestSise();
  if (b >= 0) {
    S.base = 'sise:' + b;
  } else if (S.price && S.price.hsprc && (S.base === '' || S.base === 'manual')) {
    S.base = 'hsprc';
  } else if (!S.base || !sel.querySelector('option[value="' + S.base + '"]') || sel.querySelector('option[value="' + S.base + '"]').disabled) {
    S.base = 'manual';
  }
  sel.value = S.base;
}

function applyPrice() {
  var hp = $('housePrc');
  if (S.base.indexOf('sise:') === 0 && S.sise && S.sise.items) {
    var it = S.sise.items[Number(S.base.slice(5))];
    if (it) { hp.value = sisePrice(it); hp.readOnly = true; }
  } else if (S.base === 'hsprc') {
    hp.value = hsprcConv() || '';
    hp.readOnly = true;
  } else {
    hp.readOnly = false;
  }
  priceNotes();
  updateDocList();
}

function priceNotes() {
  $('priceMsg').innerHTML = '';
  if (S.base.indexOf('sise:') === 0 && S.sise && S.sise.items) {
    var it = S.sise.items[Number(S.base.slice(5))];
    if (it) addBanner('priceMsg', 'info', '<b>한국부동산원/국민은행 인터넷시세 기준</b> (' + it.source + ', 기준일 ' + fmtDay(it.baseDay) + ') — 최저층은 하위평균가, 그 외 층은 일반평균가 적용.');
  }
  if (S.base === 'hsprc' && S.price && S.price.hsprc) {
    addBanner('priceMsg', 'warn', '⚠ <b>공시가격 보정 적용</b> — 공시가격(' + won(S.price.hsprc) + '원, 기준일 ' + fmtDay(S.price.stdDay || S.price.crtnDay) + ')에 ' + $('ratio').value + '%를 적용한 참고용 추정치입니다. 감정평가 결과에 따라 연금액이 변동될 수 있습니다.');
  }
  if (S.base === 'manual') {
    addBanner('priceMsg', 'warn', '⚠ <b>상담자가 입력한 가격입니다.</b> 공사 가격평가 및 감정평가 결과에 따라 연금액이 변동될 수 있습니다.');
  }
  if (S.price && S.price.hsprc > 1200000000) {
    addBanner('priceMsg', 'err', '공시가격 ' + won(S.price.hsprc) + '원 — <b>12억 초과. 가입요건(공시가격 등 12억 이하) 확인 필요</b> (계산은 계속 진행)');
  }
  var hp = Number($('housePrc').value);
  if (hp > 1200000000) {
    addBanner('priceMsg', 'info', '평가주택가격 ' + won(hp) + '원 — 월지급금은 공사 기준(시세 12억 원 상한)으로 산정됩니다.');
  }
}

function baseLabel() {
  var o = $('priceBase').selectedOptions[0];
  return o ? o.textContent.split('|')[0].trim() : '-';
}
