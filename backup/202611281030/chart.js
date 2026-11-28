/* 보증잔액의 구성과 주택가격 예상경로 그래프 (이자율·상승률을 직접 입력한 경우에만 표시)
 * - 쌓은 면적: 일시 받은 돈, 월 지급금(누적), 보증료(누적), 이자(누적). 쌓인 높이 전체가 보증잔액이다.
 * - 선: 주택가격 예상경로. 선과 쌓인 면적 사이의 초록색 부분이 "남는 금액(상속분)"이다.
 * - 99(숨김 기준값) 모드에서는 곡선만으로 이자율·상승률을 역산할 수 있으므로 그리지 않는다. */

function chartFmt(v) { // 억/만 단위 표시
  var a = Math.abs(v), sign = v < 0 ? '-' : '';
  if (a >= 1e8) return sign + (a / 1e8).toFixed(2) + '억';
  return sign + Math.round(a / 1e4).toLocaleString('ko-KR') + '만';
}
function chartAxis(v) { // 눈금 표시
  if (v === 0) return '0';
  if (v >= 1e8) return (Math.round(v / 1e7) / 10) + '억';
  return Math.round(v / 1e4).toLocaleString('ko-KR') + '만';
}
function chartNiceStep(max, ticks) {
  var raw = max / ticks, pow = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

function updateChart(r) {
  var box = $('gChart'), inp = $('gRate');
  if (!box) return;
  var msg = function(t) { box.innerHTML = '<div class="chart-msg">' + t + '</div>'; };
  if (!inp) { box.innerHTML = ''; return; }
  if (secretOn) return msg('기준값을 적용 중일 때는 그래프를 표시하지 않습니다. 이자율과 주택가격상승률을 직접 입력하면 표시됩니다.');
  var row = r.rows && r.rows[0], monthly = row && !row.error ? row.first : null;
  if (r.status === 'loan_pref' || monthly == null) return msg('월지급금이 없어 그래프를 표시할 수 없습니다.');
  var ci = colInputs();
  var rate = inp.value === '' ? null : Number(inp.value);
  if (rate == null || isNaN(rate) || ci.growth == null || isNaN(ci.growth) || ci.age == null)
    return msg('이자율과 주택가격상승률(Step 5)을 직접 입력하면 보증잔액과 집값 그래프가 표시됩니다.');
  var run = guaranteeRun(monthly, r.housePrc, rate, ci.age, r.lumpUsed || 0, true);
  if (!run) return msg('입력값을 확인해 주세요.');

  var n = run.months, S_ = run.series, g = ci.growth / 100 / 12, age0 = run.effAge;
  var price = [], i;
  for (i = 0; i <= n; i++) price.push(r.housePrc * Math.pow(1 + g, i));
  var t1 = [], t2 = [], t3 = [], t4 = [];
  for (i = 0; i <= n; i++) { t1.push(S_.lump[i]); t2.push(t1[i] + S_.pay[i]); t3.push(t2[i] + S_.fee[i]); t4.push(t3[i] + S_.intr[i]); }
  var bal = t4;
  var cross = null;
  for (i = 1; i <= n; i++) if (bal[i] >= price[i]) { cross = i; break; }
  var lastGap = cross == null ? n : cross - 1; // 집값이 잔액보다 큰 마지막 시점

  var W = 760, H = 330, L = 58, R = 34, T = 16, B = 44, pw = W - L - R, ph = H - T - B;
  var ymax = Math.max(price[n], bal[n], price[0]) * 1.04, step = chartNiceStep(ymax, 5);
  ymax = Math.ceil(ymax / step) * step;
  var X = function(k) { return L + pw * (k / n); }, Y = function(v) { return T + ph * (1 - v / ymax); };
  var pts = function(arr, from, to) { var a = []; for (var k = from; k <= to; k++) a.push(X(k).toFixed(1) + ',' + Y(arr[k]).toFixed(1)); return a; };
  var area = function(top, bot) { return 'M' + pts(top, 0, n).join('L') + 'L' + pts(bot, 0, n).reverse().join('L') + 'Z'; };
  var zero = []; for (i = 0; i <= n; i++) zero.push(0);

  var svg = '<svg id="gSvg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="보증잔액 구성과 주택가격 예상경로">';
  for (var yv = 0; yv <= ymax + 1; yv += step) {
    svg += '<line class="ch-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(yv).toFixed(1) + '" y2="' + Y(yv).toFixed(1) + '"/>' +
           '<text class="ch-t" x="' + (L - 6) + '" y="' + (Y(yv) + 4).toFixed(1) + '" text-anchor="end">' + chartAxis(yv) + '</text>';
  }
  // 남는 금액(집값 − 보증잔액): 집값이 더 큰 구간
  if (lastGap >= 1) svg += '<path class="ch-gap" d="M' + pts(price, 0, lastGap).join('L') + 'L' + pts(bal, 0, lastGap).reverse().join('L') + 'Z"/>';
  svg += '<path class="ch-a4" d="' + area(t4, t3) + '"/><path class="ch-a3" d="' + area(t3, t2) + '"/>' +
         '<path class="ch-a2" d="' + area(t2, t1) + '"/><path class="ch-a1" d="' + area(t1, zero) + '"/>' +
         '<polyline class="ch-price" points="' + pts(price, 0, n).join(' ') + '"/>';
  // 가로축: 5년 단위 + 마지막(100세 말)
  var ticks = [];
  for (i = 60; i < n - 12; i += 60) ticks.push(i);
  ticks.push(n);
  ticks.forEach(function(k) {
    var lab = k === n ? '100세말' : (k / 12) + '년', sub = k === n ? (Math.round(n / 12) + '년') : (age0 + k / 12) + '세';
    svg += '<line class="ch-tick" x1="' + X(k).toFixed(1) + '" x2="' + X(k).toFixed(1) + '" y1="' + (T + ph) + '" y2="' + (T + ph + 4) + '"/>' +
           '<text class="ch-t" x="' + X(k).toFixed(1) + '" y="' + (T + ph + 18) + '" text-anchor="middle">' + lab + '</text>' +
           '<text class="ch-t sub" x="' + X(k).toFixed(1) + '" y="' + (T + ph + 33) + '" text-anchor="middle">' + sub + '</text>';
  });
  svg += '<text class="ch-t sub" x="' + L + '" y="' + (T + ph + 18) + '" text-anchor="middle">0</text>';
  var crossTxt = '';
  if (cross != null) {
    var cy = Math.floor(cross / 12), cm = cross % 12;
    crossTxt = cy + '년' + (cm ? ' ' + cm + '개월' : '') + ' 후(' + (age0 + cy) + '세 무렵)';
    var cx = X(cross), anchor = cx > W - 150 ? 'end' : 'start', tx = anchor === 'end' ? cx - 6 : cx + 6;
    svg += '<line class="ch-cross" x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + T + '" y2="' + (T + ph) + '"/>' +
           '<text class="ch-t" x="' + tx.toFixed(1) + '" y="' + (T + 12) + '" text-anchor="' + anchor + '">보증잔액이 집값을 넘는 시점: ' + crossTxt + '</text>';
  }
  svg += '<line id="gHov" class="ch-hov" x1="0" x2="0" y1="' + T + '" y2="' + (T + ph) + '" style="display:none"/>' +
         '<rect id="gOv" x="' + L + '" y="' + T + '" width="' + pw + '" height="' + ph + '" fill="transparent"/></svg>';

  // 쉬운 말 요약
  var gapEnd = price[n] - bal[n], txt;
  if (cross == null) {
    txt = '100세 말까지 집값(예상 ' + chartFmt(price[n]) + ')이 보증잔액(' + chartFmt(bal[n]) + ')보다 커서, 약 <b>' + chartFmt(gapEnd) + '</b>이 남아 상속·잉여로 돌아갑니다.';
  } else {
    txt = '집값은 ' + chartFmt(price[n]) + ', 보증잔액은 ' + chartFmt(bal[n]) + '으로 <b>' + crossTxt + '부터 보증잔액이 집값을 넘습니다.</b> 그 전까지는 남는 금액이 있고, ' +
          '주택연금은 집값 범위에서 정산되어 부족분을 상속인에게 청구하지 않습니다(비소구).';
  }
  var legend = [['a1', '일시 받은 돈'], ['a2', '월 지급금(누적)'], ['a3', '보증료(누적)'], ['a4', '이자(누적)']].filter(function(x) { return x[0] !== 'a1' || (r.lumpUsed || 0) > 0; }).map(function(x) {
    return '<span class="lg"><i class="sw ch-' + x[0] + '"></i>' + x[1] + '</span>';
  }).join('') + '<span class="lg"><i class="sw-line"></i>집값 예상</span><span class="lg"><i class="sw ch-gap"></i>남는 금액(상속분)</span>';

  // 5년 단위 표
  var rows = [], rk = [];
  for (i = 60; i < n; i += 60) rk.push(i);
  rk.push(n);
  rk.forEach(function(k) {
    var gap = price[k] - bal[k];
    rows.push('<tr><td>' + (k / 12) + '년 <small>(' + (k === n ? '100세말' : (age0 + k / 12) + '세') + ')</small></td><td>' + chartFmt(price[k]) + '</td><td>' + chartFmt(t2[k]) +
              '</td><td>' + chartFmt(S_.fee[k]) + '</td><td>' + chartFmt(S_.intr[k]) + '</td><td>' + chartFmt(bal[k]) + '</td><td>' + (gap > 0 ? chartFmt(gap) : '0') + '</td></tr>');
  });
  var table = '<div style="overflow-x:auto;"><table class="p-table ch-table"><thead><tr><th>경과(나이)</th><th>집값(예상)</th><th>받은 돈</th><th>보증료</th><th>이자</th><th>보증잔액</th><th>남는 금액</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';

  box.innerHTML = '<h3 class="ch-h">시간이 지나면 어떻게 되나요? <small>(정액형 월지급금 기준, 억·만원 표시)</small></h3>' +
    '<div class="ch-sum">' + txt + '</div><div class="ch-wrap" id="gWrap">' + svg + '<div class="ch-tip" id="gTip" style="display:none"></div></div>' +
    '<div class="ch-legend">' + legend + '</div>' + table;

  // 마우스/터치로 가리킨 시점의 값 보기
  var ov = $('gOv'), hov = $('gHov'), tip = $('gTip'), wrap = $('gWrap'), svgEl = $('gSvg');
  var show = function(ev) {
    var rc = svgEl.getBoundingClientRect(), pt = ev.touches ? ev.touches[0] : ev;
    var k = Math.round(((pt.clientX - rc.left) / rc.width * W - L) / pw * n);
    k = Math.max(0, Math.min(n, k));
    hov.setAttribute('x1', X(k)); hov.setAttribute('x2', X(k)); hov.style.display = '';
    var gap = price[k] - bal[k];
    tip.innerHTML = '<div>' + Math.floor(k / 12) + '년 ' + (k % 12) + '개월 (' + (age0 + Math.floor(k / 12)) + '세)</div>' +
      '<div>집값 ' + chartFmt(price[k]) + '</div><div>받은 돈 ' + chartFmt(t2[k]) + '</div><div>보증료 ' + chartFmt(S_.fee[k]) + '</div>' +
      '<div>이자 ' + chartFmt(S_.intr[k]) + '</div><div>보증잔액 ' + chartFmt(bal[k]) + '</div><div>남는 금액 ' + (gap > 0 ? chartFmt(gap) : '0') + '</div>';
    tip.style.display = '';
    var left = (X(k) / W) * rc.width + 12;
    if (left + tip.offsetWidth > rc.width) left = (X(k) / W) * rc.width - tip.offsetWidth - 12;
    tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
  };
  var hide = function() { hov.style.display = 'none'; tip.style.display = 'none'; };
  ov.addEventListener('mousemove', show); ov.addEventListener('mouseleave', hide);
  ov.addEventListener('touchstart', show, { passive: true }); ov.addEventListener('touchmove', show, { passive: true }); ov.addEventListener('touchend', hide);
}
