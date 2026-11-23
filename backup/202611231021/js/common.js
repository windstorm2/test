/*
 * js/common.js : 설정값, 전역 상태 객체 S, 공통 도우미 함수
 * backup/202611222155/index.html(v6.0)의 스크립트를 기능 변경 없이 나눈 파일입니다.
 * 원본 맨 앞의 설정값 선언 8개와 함수 선언만 둡니다.
 * 불러오는 순서: common → api → customer → building → price → pension → application → main
 */

/* ───── 설정 및 전역 상태 객체 S ───── */
var API_BASE = location.hostname.endsWith('workers.dev') ? '' : 'https://homepension.windstorm2.workers.dev';

var AREA_TOL = 1.0;

var S = {
  addr: null,
  parsedDong: '',
  parsedHo: '',
  bld: null,
  units: [],
  unit: null,
  det: null,
  land: null,
  landRightRatio: '',
  price: null,
  priceErr: null,
  priceLoading: false,
  priceSeq: 0,
  sise: null,
  siseLoading: false,
  siseP: null,
  base: '',
  officetel: false,
  pensionRes: null,
  pickedCol: 0
};

var $ = function(id) { return document.getElementById(id); };

var won = function(n) { return n == null || n === '' ? '-' : Number(n).toLocaleString('ko-KR'); };

var digits = function(s) { return String(s || '').replace(/[^0-9]/g, ''); };

var qs = function(o) {
  return Object.keys(o).filter(function(k) { return o[k] != null && o[k] !== ''; })
    .map(function(k) { return k + '=' + encodeURIComponent(o[k]); }).join('&');
};

var fmtDay = function(d) {
  d = String(d || '');
  return d.length === 8 ? d.slice(0,4) + '.' + d.slice(4,6) + '.' + d.slice(6) : d;
};

function showToast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(function() { t.style.display = 'none'; }, 2200);
}

function banner(el, cls, msg) {
  $(el).innerHTML = msg ? '<div class="banner ' + cls + '">' + msg + '</div>' : '';
}

function addBanner(el, cls, msg) {
  $(el).insertAdjacentHTML('beforeend', '<div class="banner ' + cls + '">' + msg + '</div>');
}

function fill(sel, arr, labelFn, ph) {
  sel.innerHTML = '';
  var o = document.createElement('option');
  o.value = ''; o.textContent = ph;
  sel.appendChild(o);
  arr.forEach(function(x, i) {
    var op = document.createElement('option');
    op.value = String(i);
    op.textContent = labelFn(x);
    sel.appendChild(op);
  });
  sel.disabled = !arr.length;
}

function setPill(id, state, text) {
  var el = $(id);
  if (!el) return;
  $('fetchStatusBar').style.display = 'flex';
  el.className = 'pill ' + state;
  el.textContent = text;
}
