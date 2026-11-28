/* 보증잔액의 구성과 주택가격 예상경로 그래프 (입력한 이자율·상승률로만 그린다)
 * - 쌓은 면적: 받은금액(월지급금+일시인출금 누적), 보증료, 이자. 쌓인 높이 전체가 보증잔액이다.
 * - 선: 주택가격 예상경로. 선과 쌓인 면적 사이의 초록색 부분이 "남는 금액(상속분)"이다.
 * - 월지급금은 신청서에 반영한(선택한) 지급유형 기준이다. 초기증액형은 증액기간 종료 후 월지급금(×70%)으로 바뀐다.
 * - 보증금액·설정금액은 Worker의 고정 기준값으로 따로 계산되며, 이 그래프와 값이 다를 수 있다. */

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
  if (!inp) { box.innerHTML = ''; return; }
  var hold = $('growthHolder'), gIn = $('col_growth');
  hold.appendChild(inp); hold.appendChild(gIn); // 다시 그리기 전에 입력칸을 보관함으로 옮겨 사라지지 않게 한다
  var mount = function() {
    var d = $('gIn');
    d.innerHTML = '<label>이자율</label><span></span><label>상승률</label><span></span>';
    var sp = d.querySelectorAll('span');
    sp[0].appendChild(inp); sp[0].appendChild(document.createTextNode(' %'));
    sp[1].appendChild(gIn); sp[1].appendChild(document.createTextNode(' %'));
  };
  var msg = function(t) { box.innerHTML = '<div class="ch-wrap"><div class="chart-msg">' + t + '</div><div class="ch-inputs" id="gIn"></div></div>'; mount(); };
  var ASK = '이자율과 주택가격 상승률을 입력해 주세요.';
  var pi = S.pickedCol != null && r.rows && r.rows[S.pickedCol] && !r.rows[S.pickedCol].error ? S.pickedCol : 0;
  var row = r.rows && r.rows[pi], monthly = row && !row.error && row.first != null ? row.first : null;
  if (r.status === 'loan_pref' || monthly == null) return msg('월지급금이 없어 그래프를 표시할 수 없습니다.');
  var ci = colInputs();
  var rate = inp.value === '' ? null : Number(inp.value);
  if (rate == null || isNaN(rate) || ci.growth == null || isNaN(ci.growth) || ci.age == null)
    return msg(ASK);
  var sched = { first: row.first, after: row.after != null ? row.after : row.first, from: row.afterYear ? (row.afterYear - 1) * 12 + 1 : Infinity };
  var run = guaranteeRun(sched, r.housePrc, rate, ci.age, r.lumpUsed || 0, true);
  if (!run) return msg('입력값을 확인해 주세요.');

  var nAll = run.months, S_ = run.series, g = ci.growth / 100 / 12, age0 = run.effAge;
  var n = Math.min(nAll, Math.max(12, (95 - age0) * 12)); // 계산은 끝까지, 화면은 95세까지만
  var price = [], i;
  for (i = 0; i <= nAll; i++) price.push(r.housePrc * Math.pow(1 + g, i));
  var t1 = [], t2 = [], t3 = [], t4 = [];
  for (i = 0; i <= nAll; i++) { t1.push(S_.lump[i]); t2.push(t1[i] + S_.pay[i]); t3.push(t2[i] + S_.fee[i]); t4.push(t3[i] + S_.intr[i]); }
  var bal = t4;
  var cross = null;
  for (i = 1; i <= nAll; i++) if (bal[i] >= price[i]) { cross = i; break; }
  if (cross != null && cross > n) cross = null; // 95세 이후 교차는 표시하지 않는다
  var lastGap = cross == null ? n : cross - 1; // 집값이 잔액보다 큰 마지막 시점

  var W = 760, H = 330, L = 0, R = 0, T = 16, B = 44, pw = W - L - R, ph = H - T - B;
  var ymax = Math.max(price[n], bal[n], price[0]) * 1.04, step = chartNiceStep(ymax, 5);
  ymax = Math.ceil(ymax / step) * step;
  var X = function(k) { return L + pw * (k / n); }, Y = function(v) { return T + ph * (1 - v / ymax); };
  var pts = function(arr, from, to) { var a = []; for (var k = from; k <= to; k++) a.push(X(k).toFixed(1) + ',' + Y(arr[k]).toFixed(1)); return a; };
  var area = function(top, bot) { return 'M' + pts(top, 0, n).join('L') + 'L' + pts(bot, 0, n).reverse().join('L') + 'Z'; };
  var zero = []; for (i = 0; i <= n; i++) zero.push(0);

  var svg = '<svg id="gSvg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="보증잔액 구성과 주택가격 예상경로">';
  for (var yv = 0; yv <= ymax + 1; yv += step) {
    svg += '<line class="ch-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(yv).toFixed(1) + '" y2="' + Y(yv).toFixed(1) + '"/>' +
           '<text class="ch-t" x="' + (L + 4) + '" y="' + (Y(yv) - 4).toFixed(1) + '" text-anchor="start">' + chartAxis(yv) + '</text>';
  }
  // 남는 금액(집값 − 보증잔액): 집값이 더 큰 구간
  if (lastGap >= 1) svg += '<path class="ch-gap" d="M' + pts(price, 0, lastGap).join('L') + 'L' + pts(bal, 0, lastGap).reverse().join('L') + 'Z"/>';
  svg += '<path class="ch-a4" d="' + area(t4, t3) + '"/><path class="ch-a3" d="' + area(t3, t2) + '"/>' +
         '<path class="ch-a2" d="' + area(t2, zero) + '"/>' +
         '<polyline class="ch-bal" points="' + pts(bal, 0, n).join(' ') + '"/>' +
         '<polyline class="ch-price" points="' + pts(price, 0, n).join(' ') + '"/>';
  // 가로축: 5년 단위 + 마지막(95세)
  var ticks = [];
  for (i = 60; i < n - 12; i += 60) ticks.push(i);
  ticks.push(n);
  ticks.forEach(function(k) {
    var lab = (k / 12) + '년', sub = (age0 + k / 12) + '세';
    svg += '<line class="ch-tick" x1="' + X(k).toFixed(1) + '" x2="' + X(k).toFixed(1) + '" y1="' + (T + ph) + '" y2="' + (T + ph + 4) + '"/>' +
           '<text class="ch-t" x="' + X(k).toFixed(1) + '" y="' + (T + ph + 18) + '" text-anchor="' + (k === n ? 'end' : 'middle') + '">' + lab + '</text>' +
           '<text class="ch-t sub" x="' + X(k).toFixed(1) + '" y="' + (T + ph + 33) + '" text-anchor="' + (k === n ? 'end' : 'middle') + '">' + sub + '</text>';
  });
  svg += '<text class="ch-t sub" x="' + L + '" y="' + (T + ph + 18) + '" text-anchor="start">0</text>';
  var crossTxt = '';
  if (cross != null) {
    crossTxt = (cross / 12).toFixed(1) + '년';
    var cx = X(cross), anchor = cx > W - 150 ? 'end' : 'start', tx = anchor === 'end' ? cx - 6 : cx + 6;
    svg += '<line class="ch-cross" x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + T + '" y2="' + (T + ph) + '"/>' +
           '<text class="ch-t" x="' + tx.toFixed(1) + '" y="' + (T + 12) + '" text-anchor="' + anchor + '">' + crossTxt + '</text>';
  }
  svg += '<line id="gHov" class="ch-hov" x1="0" x2="0" y1="' + T + '" y2="' + (T + ph) + '" style="display:none"/>' +
         '<rect id="gOv" x="' + L + '" y="' + T + '" width="' + pw + '" height="' + ph + '" fill="transparent"/>';

  // 라벨: 각 면적의 오른쪽 끝 안쪽에 우측정렬(색을 쫓아가지 않아도 되도록), 주택가격은 선 위 가운데쯤
  var bands = [['a2', '받은금액', zero, t2], ['a3', '보증료', t2, t3], ['a4', '이자', t3, t4]];
  var labs = bands.map(function(b) { return { c: b[0], t: b[1], y: (Y(b[2][n]) + Y(b[3][n])) / 2, h: Y(b[2][n]) - Y(b[3][n]) }; });
  if (price[n] - bal[n] > 0) labs.push({ c: 'gap', t: '남는 금액', y: (Y(price[n]) + Y(bal[n])) / 2, h: Y(bal[n]) - Y(price[n]) });
  var lastY = Infinity;
  labs.sort(function(a, b) { return b.y - a.y; }).forEach(function(o) {
    if (o.h < 3) return;
    var y = Math.min(o.y, lastY - 13); lastY = y;
    svg += '<text class="ch-lab ' + o.c + '" x="' + (W - R - 6) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + o.t + '</text>';
  });
  var pm = Math.round(n / 2);
  svg += '<text class="ch-lab price" x="' + X(pm).toFixed(1) + '" y="' + (Y(price[pm]) - 9).toFixed(1) + '" text-anchor="middle">주택가격</text>';
  svg += '</svg>';

  // 5년 단위 표
  var rows = [], rk = [];
  for (i = 60; i <= n; i += 60) rk.push(i);
  if (rk[rk.length - 1] !== n) rk.push(n);
  var eok = function(v) { return (v / 1e8).toFixed(1); };
  rk.forEach(function(k) {
    var gap = price[k] - bal[k];
    rows.push('<tr><td>' + (k / 12) + '년 <small>(' + (age0 + k / 12) + '세)</small></td><td>' + eok(S_.pay[k]) + '</td><td>' + eok(S_.lump[k]) +
              '</td><td>' + eok(t2[k]) + '</td><td>' + eok(S_.fee[k]) + '</td><td>' + eok(S_.intr[k]) + '</td><td>' + eok(bal[k]) + '</td><td>' + eok(price[k]) + '</td><td>' + (gap > 0 ? eok(gap) : '0.0') + '</td></tr>');
  });
  var table = '<div class="ch-unit">(단위: 억원, 누적금액)</div><table class="p-table ch-table"><thead><tr><th>경과(나이)</th><th>월지급금</th><th>일시인출금</th><th>받은금액</th><th>보증료</th><th>이자</th><th>보증잔액</th><th>주택가격</th><th>남는 금액</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>';

  box.innerHTML = '<div class="ch-wrap" id="gWrap">' + svg + '<div class="ch-tip" id="gTip" style="display:none"></div>' +
    '<div class="ch-inputs" id="gIn"></div></div>' + table;
  mount();

  // 마우스/터치로 가리킨 시점의 값 보기
  var ov = $('gOv'), hov = $('gHov'), tip = $('gTip'), wrap = $('gWrap'), svgEl = $('gSvg');
  var show = function(ev) {
    var rc = svgEl.getBoundingClientRect(), pt = ev.touches ? ev.touches[0] : ev;
    var k = Math.round(((pt.clientX - rc.left) / rc.width * W - L) / pw * n);
    k = Math.max(0, Math.min(n, k));
    hov.setAttribute('x1', X(k)); hov.setAttribute('x2', X(k)); hov.style.display = '';
    var gap = price[k] - bal[k];
    tip.innerHTML = '<div>' + Math.floor(k / 12) + '년 ' + (k % 12) + '개월 (' + (age0 + Math.floor(k / 12)) + '세)</div>' +
      '<div>주택가격 ' + chartFmt(price[k]) + '</div><div>받은 돈 ' + chartFmt(t2[k]) + '</div><div>보증료 ' + chartFmt(S_.fee[k]) + '</div>' +
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
