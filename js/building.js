/*
 * js/building.js : 2. 주소 검색, 건축물·토지·대지권 요약
 * backup/202611222155/index.html(v6.0)의 스크립트를 기능 변경 없이 나눈 파일입니다.
 * 함수 선언만 둡니다.
 * 불러오는 순서: common → api → customer → building → price → pension → application → main
 */

function searchAddrUI() {
  var q = $('addrQ').value.trim();
  if (!q) return;
  $('addrList').innerHTML = '<small>도로명주소 검색 중...</small>';
  api('/api/addr?q=' + encodeURIComponent(q)).then(function(res) {
    var list = Array.isArray(res) ? res : (res.items || []);
    S.parsedDong = (res.parsed && res.parsed.dong) ? res.parsed.dong : '';
    S.parsedHo   = (res.parsed && res.parsed.ho) ? res.parsed.ho : '';

    if (!list.length) {
      $('addrList').innerHTML = '<small style="color:#c62828;">결과 없음 — 도로명, 지번 또는 건물명으로 다시 검색하세요.</small>';
      return;
    }
    $('addrList').innerHTML = '';
    list.forEach(function(a) {
      var b = document.createElement('button');
      b.textContent = a.roadAddr + ' (' + a.jibunAddr + ')';
      b.onclick = function() {
        Array.prototype.forEach.call($('addrList').children, function(c) { c.className = ''; });
        b.className = 'sel';
        pickAddr(a);
      };
      $('addrList').appendChild(b);
    });
    if (list.length === 1) $('addrList').firstChild.click();
  }).catch(function(e) {
    $('addrList').innerHTML = '<small style="color:#c62828;">' + e.message + '</small>';
  });
}

function resetUnit() {
  S.unit = null; S.det = null; S.land = null; S.landRightRatio = ''; S.price = null; S.priceErr = null; S.base = ''; S.userBase = false; S.officetel = false;
  S.priceSeq++;
  $('area').value = ''; $('area').readOnly = true;
  $('housePrc').value = ''; $('priceBase').innerHTML = ''; $('priceMsg').innerHTML = '';
  $('bldPriceBanner').innerHTML = '';
  $('resultSec').style.display = 'none';
}

function mapPurpsToHouseType(purpsStr) {
  var s = String(purpsStr || '');
  if (/오피스텔/.test(s)) return '주거용오피스텔';
  if (/노인복지/.test(s)) return '노인복지주택';
  if (/아파트/.test(s)) return '아파트';
  if (/연립|다세대/.test(s)) return '연립/다세대';
  if (/단독|다가구/.test(s)) return '단독주택';
  return '';
}

function formatStandardHouseAddr(a, dong, ho) {
  if (!a) return '';
  var road = (a.roadAddrPart1 || a.roadAddr || '').trim();
  var jb = (a.jibunAddr || '').trim();

  var dongName = '', lotNum = '';
  var m = jb.match(/(\S+(?:동|읍|면|리|가))\s+(산?\s*\d+(?:-\d+)?)/);
  if (m) {
    dongName = m[1];
    lotNum = m[2].replace(/\s+/g, '');
  } else {
    var m2 = (a.roadAddr || '').match(/\(([^,)]+)/);
    if (m2) dongName = m2[1].trim();
    var b1 = Number(a.bun || 0), b2 = Number(a.ji || 0);
    if (b1) lotNum = (a.platGbCd === '1' ? '산' : '') + b1 + (b2 ? '-' + b2 : '');
  }

  var dhParts = [];
  if (dong && dong !== '(동 없음)') {
    var dClean = String(dong).trim();
    dhParts.push(/동$/.test(dClean) ? dClean : dClean + '동');
  }
  if (ho) {
    var hClean = String(ho).trim();
    dhParts.push(/호$/.test(hClean) ? hClean : hClean + '호');
  }
  var dhStr = dhParts.join(' ');

  var refParts = [];
  if (dongName) refParts.push(dongName);
  if (a.bdNm) refParts.push(a.bdNm.trim());
  var refStr = refParts.length ? '(' + refParts.join(', ') + ')' : '';

  var stdRoad = road;
  if (dhStr) {
    stdRoad += ', ' + dhStr + refStr;
  } else if (refStr) {
    stdRoad += ' ' + refStr;
  }

  var jibunShort = (dongName && lotNum) ? (dongName + ' ' + lotNum) : jb;
  if (jibunShort) {
    stdRoad += ' (' + jibunShort + ')';
  }
  return stdRoad;
}

/* 대지권비율 수집 (자료가 있는 경우에만 사용, 추정하지 않음):
   1) 브이월드 대지권등록부 또는 건축물대장 전유부(ldaQotaAr/ldaQotaRate) 원문 우선
   2) 브이월드 공동주택속성(getApartHousingPriceAttr)의 대지권지분 보조
   3) 두 자료에 모두 없으면 비워 둔다. 면적 비례 추정은 하지 않는다(2026-11-23 사용자 결정). */
function computeBestLandRight() {
  var b = S.bld, d = S.det, l = S.land;
  var totalLandAr = (b && b.platArea && Number(b.platArea) > 0) ? Number(b.platArea) : ((l && l.landArea && Number(l.landArea) > 0) ? Number(l.landArea) : null);

  var rightAr = (d && d.ldaQotaAr && Number(d.ldaQotaAr) > 0) ? Number(d.ldaQotaAr) : ((l && l.landRightArea && Number(l.landRightArea) > 0) ? Number(l.landRightArea) : null);
  var rawRate = (d && d.ldaQotaRate) || (l && l.landRightRatio) || '';
  var src = (l && l.rightSource) || (d && (d.ldaQotaAr || d.ldaQotaRate) ? '건축물대장' : '');

  var m = String(rawRate).match(/([\d,.]+)\s*분의\s*([\d,.]+)/);
  if (m) {
    var denFromRate = Number(m[1].replace(/,/g, ''));
    var numFromRate = Number(m[2].replace(/,/g, ''));
    if (numFromRate > 0) rightAr = numFromRate;
    var finalDen = (totalLandAr && totalLandAr > denFromRate) ? totalLandAr : (denFromRate || totalLandAr);
    return {
      totalLandAr: finalDen,
      rightAr: rightAr,
      ratioText: finalDen && rightAr ? (finalDen + '분의 ' + rightAr) : rawRate,
      source: src,
      estimated: false
    };
  }

  if (totalLandAr && rightAr) {
    return {
      totalLandAr: totalLandAr,
      rightAr: rightAr,
      ratioText: totalLandAr + '분의 ' + rightAr,
      source: src,
      estimated: false
    };
  }

  return { totalLandAr: totalLandAr, rightAr: rightAr, ratioText: rawRate || '', source: src, estimated: false };
}

function syncBuildingToApplication(dong, ho) {
  if (!S.addr) return;
  var fullAddr = formatStandardHouseAddr(S.addr, dong, ho);

  $('house_addr').value = fullAddr;
  ['app', 'sp'].forEach(function(who) {
    var cb = $(who + '_addr_same');
    if (cb && cb.checked) syncAddr(who);
  });

  if ($('area').value) $('area_bldg').value = $('area').value;

  var lr = computeBestLandRight();
  S.landRightRatio = lr.ratioText || '';

  var appLandVal = lr.rightAr || lr.totalLandAr || '';
  if (appLandVal) $('area_land').value = appLandVal;

  var purps = ((S.det && S.det.purps) || '') + ' ' + ((S.unit && S.unit.purps) || '') + ' ' + ((S.bld && (S.bld.purps + ' ' + S.bld.etcPurps)) || '');
  var mappedType = mapPurpsToHouseType(purps);
  if (mappedType) $('house_type').value = mappedType;

  updateDocList();
}

function normDongKey(d) {
  return String(d || '').replace(/\s/g, '').replace(/^제/, '').replace(/동$/, '').toUpperCase();
}

function getBuildingMaxFloor(dong) {
  if (!S.bld) return null;
  if (S.bld.dongFlrs && dong) {
    var key = normDongKey(dong);
    if (S.bld.dongFlrs[key]) return S.bld.dongFlrs[key];
  }
  if (S.units && S.units.length) {
    var flrs = S.units.map(function(u) { return u.flr || 0; });
    var maxU = Math.max.apply(null, flrs);
    if (maxU > 0) return maxU;
  }
  return S.bld.grndFlr || null;
}

function shortStrct(s) {
  if (!s) return '';
  var clean = String(s).split('(')[0].trim();
  return clean.replace(/구조$/, '조');
}

/* 부동산 요약정보 문자열 생성 (전체대지 + 대지권비율 통합 표기) */
function buildCompactSummary(dong, ho, fl) {
  var items = [];
  var b = S.bld, d = S.det, u = S.unit, l = S.land;

  // 1) 동·호
  var dh = ((dong && dong !== '(동 없음)') ? dong + ' ' : '') + (ho || '');
  if (dh.trim()) items.push('<b>' + dh.trim() + '</b>');

  // 2) 용도
  var purps = (d && d.purps) || (u && u.purps) || (b && b.purps) || '';
  if (purps) items.push('<b>' + purps + '</b>');

  // 3) 구조
  var st = shortStrct((d && d.strct) || (b && b.strct) || '');
  if (st) items.push(st);

  // 4) 층/총층수 ("3층/총15층")
  var maxFlr = getBuildingMaxFloor(dong);
  if (fl != null && maxFlr) items.push('<b>' + fl + '층/총' + maxFlr + '층</b>');
  else if (fl != null) items.push('<b>' + fl + '층</b>');
  else if (maxFlr) items.push('총' + maxFlr + '층');

  // 5) 단지규모 ("4개동/270세대")
  if (b) {
    var dCnt = b.dongs ? b.dongs.length : 0;
    var hCnt = b.totalHhld != null ? b.totalHhld : b.hhldCnt;
    var scale = [];
    if (dCnt > 0) scale.push(dCnt + '개동');
    if (hCnt != null && hCnt > 0) scale.push(won(hCnt) + '세대');
    if (scale.length) items.push(scale.join('/'));
  }

  // 6) 사용승인일 및 경과연수 ("사용승인 1999.09.21(27년 경과)")
  if (b && b.useAprDay && String(b.useAprDay).length >= 4) {
    var ua = String(b.useAprDay);
    var bYear = Number(ua.slice(0, 4));
    var elapsed = Math.max(0, new Date().getFullYear() - bYear);
    items.push('사용승인 ' + fmtDay(ua) + '(' + elapsed + '년 경과)');
  }

  // 7) 전체대지 및 대지권비율 통합 표기
  var isCollective = (b && b.collective) || !!ho;
  var lr = computeBestLandRight();
  var jimok = (l && l.jimok) || '';

  if (isCollective) {
    if (lr.totalLandAr) items.push('전체대지 ' + won(lr.totalLandAr) + '㎡' + (jimok ? '(' + jimok + ')' : ''));
    if (lr.ratioText) {
      items.push('대지권비율 <b>' + lr.ratioText + '</b>');
    }
  } else {
    if (jimok || lr.totalLandAr) {
      items.push('토지 ' + (jimok ? jimok + ' ' : '') + (lr.totalLandAr ? won(lr.totalLandAr) + '㎡' : ''));
    }
  }

  // 8) 개별공시지가
  if (l && l.landPricePerM2) {
    var lpStr = '공시지가 ' + won(l.landPricePerM2) + '원/㎡';
    if (!isCollective && l.landPriceTotal) {
      lpStr += '(토지총액 ' + won(l.landPriceTotal) + '원)';
    }
    items.push(lpStr);
  }

  return items.join(' · ');
}

function renderBldBanner(dong, ho, fl) {
  var summaryLine = buildCompactSummary(dong, ho, fl);
  var lines = [summaryLine];
  var warn = false;

  var isCollective = (S.bld && S.bld.collective) || !!ho;
  var lr = computeBestLandRight();
  if (isCollective && lr.ratioText) {
    lines.push('<small style="color:#5c3c00;">※ 대지권비율(<b>' + lr.ratioText + '</b>' + (lr.source ? ' · ' + lr.source : '') + ')은 공부 기준 자동추출값이므로, <b>등기서면 출력 전 등기사항전부증명서와 반드시 대조 확인 및 수정</b>하시기 바랍니다.</small>');
  }

  if (S.det && S.det.area == null && ho) {
    warn = true;
    lines.push('전유면적을 건축물대장에서 찾지 못했습니다 — 면적을 직접 입력하세요.');
  }
  if (S.det && S.det.dupPk > 1) {
    warn = true;
    lines.push('동일 호수가 ' + S.det.dupPk + '건 중복 등록되어 첫 건의 면적을 적용했습니다.');
  }
  var purps = ((S.det && S.det.purps) || '') + ' ' + ((S.bld && S.bld.purps) || '');
  if (/오피스텔|업무시설/.test(purps)) {
    S.officetel = true;
    lines.push('<b>주거목적 오피스텔은 월지급금 산정 기준이 일반주택과 다릅니다. 공사 홈페이지(주택구분: 주거목적 오피스텔) 또는 담당자 산출로 안내해 주세요.</b>');
    banner('bldMsg', 'err', lines.join('<br>'));
  } else {
    S.officetel = false;
    banner('bldMsg', warn ? 'warn' : 'info', lines.join('<br>'));
  }
}

/* 대지권 비율이 없을 때 그 사유(Worker v6.4 이상이 돌려주는 진단 정보)를 짧은 문구로 만든다 */
function landRightWhy(l, dong, ho) {
  if (!ho) return '';
  var g = l && l.ldareg;
  if (!g) return '';
  var unit = (dong ? dong + ' ' : '') + ho;
  if (g.stop === 'error') return '대지권등록 조회 실패(브이월드 응답 없음)';
  if (g.stop === 'empty') return '이 필지에 대지권등록 자료 없음';
  if (g.stop === 'budget') return '대지권등록 ' + g.rows + '/' + (g.total || '?') + '건만 읽고 중단(호출 한도), ' + unit + ' 못 찾음';
  return '대지권등록 ' + g.rows + '건 중 ' + unit + ' 일치 없음' + (g.dongs && g.dongs.length ? ' (자료의 동 예: ' + g.dongs.slice(0, 4).join(', ') + ')' : '');
}

/* 브이월드 토지·대지권등록부·공시지가 비동기 조회 */
function startLandFetch(a, dong, ho, platArea) {
  S.land = null;
  setPill('stLand', 'loading', '⏳ 토지·대지권 조회 중...');
  return api('/api/land?' + qs(Object.assign({}, a, { dongNm: dong, hoNm: ho, platArea: platArea || '' })))
    .then(function(l) {
      S.land = l;
      var lr = computeBestLandRight();
      if (!l || !l.hasKey) {
        setPill('stLand', 'none', '토지·대지권: VWORLD_KEY 미설정');
      } else if (lr.ratioText) {
        setPill('stLand', 'ok', '✓ 대지권: ' + lr.ratioText);
      } else if (l.landArea || l.landPricePerM2) {
        var tag = (l.jimok ? l.jimok + ' ' : '') + (l.landArea ? won(l.landArea) + '㎡' : '확인됨');
        var why = landRightWhy(l, dong, ho);
        setPill('stLand', 'ok', '✓ 토지: ' + tag + (why ? ' · 대지권 비율 없음: ' + why : ''));
      } else {
        setPill('stLand', 'none', '대지권 미조회' + (landRightWhy(l, dong, ho) ? ': ' + landRightWhy(l, dong, ho) : ''));
      }

      if (l && l.aptPubPrice && (!S.price || !S.price.hsprc)) {
        S.price = { hsprc: l.aptPubPrice, year: l.aptPubYear, stdDay: l.aptPubYear + '0101', status: 'ok' };
        S.priceLoading = false;
        S.priceSeq++;
        setPill('stPrice', 'ok', '✓ 공시가격: ' + won(l.aptPubPrice) + '원 (' + l.aptPubYear + '년)');
        buildPriceOptions(); applyPrice(); bldPriceSummary();
      }
      syncBuildingToApplication(dong, ho);
      var fl = (S.det && S.det.flrNo) || (S.unit && S.unit.flr) || guessFloor(ho);
      renderBldBanner(dong, ho, fl);
    })
    .catch(function() {
      var lr = computeBestLandRight();
      if (lr.ratioText) setPill('stLand', 'ok', '✓ 대지권: ' + lr.ratioText);
      else setPill('stLand', 'none', '토지조회 생략');
      var fl = (S.det && S.det.flrNo) || (S.unit && S.unit.flr) || guessFloor(ho);
      renderBldBanner(dong, ho, fl);
    });
}

function pickAddr(a) {
  S.addr = a; S.bld = null; S.units = []; resetUnit();
  $('hoSel').innerHTML = ''; $('hoSel').disabled = true;

  var dong = S.parsedDong || '', ho = S.parsedHo || '';
  syncBuildingToApplication(dong, ho);

  // 1) HF 인터넷시세 비동기 선조회
  S.sise = null; S.siseLoading = true;
  setPill('stSise', 'loading', '⏳ HF 인터넷시세 조회 중...');
  S.siseP = api('/api/sise?' + qs({ zipNo: a.zipNo, roadAddr: a.roadAddrPart1 }))
    .then(function(s) {
      S.sise = s; S.siseLoading = false;
      if (s.status === 'ok') setPill('stSise', 'ok', '✓ 인터넷시세 (' + s.items.length + '개 타입)');
      else setPill('stSise', 'none', '인터넷시세: 없음');
      buildPriceOptions(); applyPrice(); bldPriceSummary();
      return s;
    })
    .catch(function(e) {
      S.sise = { status: 'unavailable', reason: e.message, items: [] };
      S.siseLoading = false;
      setPill('stSise', 'fail', '✗ 시세 조회 실패');
      buildPriceOptions(); applyPrice(); bldPriceSummary();
      return S.sise;
    });

  // 2) 표제부 조회
  setPill('stUnit', 'loading', '⏳ 건축물대장 조회 중...');
  var dongsP = api('/api/bld/dongs?' + qs(a)).then(function(b) { S.bld = b; return b; });

  if (ho) {
    var dLabel = dong ? (/동$/.test(dong) ? dong : dong + '동') : '(동 없음)';
    var hLabel = /호$/.test(ho) ? ho : ho + '호';
    fill($('dongSel'), [dLabel], function(x) { return x; }, '동'); $('dongSel').value = '0';
    fill($('hoSel'), [hLabel], function(x) { return x; }, '호'); $('hoSel').value = '0';
    banner('bldMsg', 'info', '<b>' + (dong ? dLabel + ' ' : '') + hLabel + '</b> 조회 중...');
    loadUnit(dong, ho, null, dongsP);

    dongsP.then(function(b) {
      if (b && b.dongs && b.dongs.length) {
        fill($('dongSel'), b.dongs, function(x) { return x; }, '동 선택');
        var dCore = digits(dong) || dong;
        var idx = b.dongs.findIndex(function(x) { return (digits(x) || x) === dCore; });
        if (idx >= 0) $('dongSel').value = String(idx);
      }
    }).catch(function() {});
    return;
  }

  banner('bldMsg', 'info', '건축물대장 표제부 조회 중...');
  dongsP.then(function(b) {
    startLandFetch(a, '', '', b.platArea);
    if (!b.dongs.length) {
      setPill('stUnit', 'ok', '✓ 일반건축물');
      fill($('dongSel'), ['(동 없음)'], function(x) { return x; }, '동'); $('dongSel').value = '0';
      $('hoSel').innerHTML = ''; $('hoSel').disabled = true;
      if (b.totArea) { $('area').value = b.totArea; $('area_bldg').value = b.totArea; }
      $('area').readOnly = false;
      syncBuildingToApplication('', '');
      renderBldBanner('', '', null);
      startPriceFetch(a, '', '', '');
      return;
    }
    setPill('stUnit', 'ok', '✓ ' + b.dongs.length + '개동');
    fill($('dongSel'), b.dongs, function(x) { return x; }, '동 선택');
    syncBuildingToApplication('', '');
    renderBldBanner('', '', null);
    if (dong) {
      var dCore = digits(dong) || dong;
      var matchIdx = b.dongs.findIndex(function(x) { return (digits(x) || x) === dCore; });
      if (matchIdx >= 0) { $('dongSel').value = String(matchIdx); $('dongSel').onchange(); return; }
    }
    if (b.dongs.length === 1) { $('dongSel').value = '0'; $('dongSel').onchange(); }
  }).catch(function(e) {
    setPill('stUnit', 'fail', '✗ 건축물대장 오류');
    banner('bldMsg', 'err', '건축물대장 조회 실패: ' + e.message + ' — 전용면적·가격을 직접 입력해 진행하세요.');
    $('area').readOnly = false;
    startLandFetch(a, '', '', null);
    buildPriceOptions(); applyPrice();
  });
}

function guessFloor(h) {
  var d = digits(h);
  if (!d) return null;
  if (d.length <= 1) return 1;
  if (d.length <= 3) return Number(d.charAt(0));
  return Number(d.slice(0, d.length - 2));
}

function loadUnit(dong, ho, u, dongsP) {
  resetUnit(); S.unit = u;
  var a = S.addr, p = Object.assign({}, a, { dongNm: dong, hoNm: ho, pks: u ? u.pks.join(',') : '' });

  setPill('stUnit', 'loading', '⏳ 전유부 조회 중...');
  setPill('stPrice', 'loading', '⏳ 공시가격 대기...');
  S.priceLoading = true;
  bldPriceSummary();

  var unitP = api('/api/bld/unit?' + qs(p));

  unitP.then(function(d) {
    S.det = d;
    $('area').value = d.area != null ? d.area : '';
    $('area').readOnly = d.area != null;

    var fl = d.flrNo != null ? d.flrNo : (u && u.flr != null ? u.flr : guessFloor(ho));
    var known = S.units.filter(function(x) { return x.flrSrc === '대장' && x.flr != null && !x.under; }).map(function(x) { return x.flr; });
    var minF = known.length ? Math.min.apply(null, known) : 1;
    var low = fl != null && (fl === 1 || fl === minF);
    $('lowest').value = low ? 'Y' : 'N';

    if (d.area != null) setPill('stUnit', 'ok', '✓ 전용 ' + d.area + '㎡ · ' + (fl ? fl + '층' : ''));
    else setPill('stUnit', 'none', '전유면적 미확인(직접입력)');

    buildPriceOptions();
    applyPrice();
    bldPriceSummary();

    return dongsP.then(function(b) { return b; }, function() { return null; }).then(function(b) {
      var finalDong = (d.matched && d.matched.dongNm) ? d.matched.dongNm : dong;
      var finalHo   = (d.matched && d.matched.hoNm) ? d.matched.hoNm : ho;
      var pkList = (d.pks && d.pks.length) ? d.pks.join(',') : (d.pk || (u && u.pks ? u.pks.join(',') : ''));

      startLandFetch(a, finalDong, finalHo, b ? b.platArea : null);

      syncBuildingToApplication(finalDong, finalHo);

      if (!S.price || !S.price.hsprc) {
        startPriceFetch(a, finalDong, finalHo, pkList);
      }

      renderBldBanner(finalDong, finalHo, fl);

      if (d.area == null) {
        api('/api/bld/raw?' + qs(Object.assign({}, a, { dongNm: dong }))).then(function(r) {
          addBanner('bldMsg', 'info', r.total
            ? '대장 등록 표기 예시 — 동: <b>' + r.dongs.join(', ') + '</b> / 호: ' + r.hos.join(', ')
            : '이 필지에는 집합건축물 전유부 자료가 없습니다 — 일반건축물대장 표제부 면적을 참고해 직접 입력하세요.');
        }).catch(function() {});
      }

      buildPriceOptions();
      applyPrice();
      bldPriceSummary();
    });
  }).catch(function(e) {
    setPill('stUnit', 'fail', '✗ 전유부 조회 실패');
    banner('bldMsg', 'err', '건축물대장 조회 실패: ' + e.message + ' — 전용면적·가격을 직접 입력해 진행하세요.');
    $('area').readOnly = false;
    startLandFetch(a, dong, ho, S.bld ? S.bld.platArea : null);
    startPriceFetch(a, dong, ho, '');
    buildPriceOptions(); applyPrice(); bldPriceSummary();
  });
}
