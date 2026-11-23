/*
 * js/api.js : 0. API 통신 및 토큰 체크
 * backup/202611222155/index.html(v6.0)의 스크립트를 기능 변경 없이 나눈 파일입니다.
 * 함수 선언만 둡니다.
 * 불러오는 순서: common → api → customer → building → price → pension → application → main
 */

/* ───── 0. API 통신 및 토큰 체크 ───── */
function token() { return localStorage.getItem('branchToken') || ''; }

function api(path, opt) {
  opt = opt || {};
  opt.headers = Object.assign({ 'content-type': 'application/json' }, token() ? { 'X-Branch-Token': token() } : {});
  return fetch(API_BASE + path, opt).then(function(r) {
    return r.json().then(function(j) {
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
      return j;
    });
  });
}

function checkToken() {
  fetch(API_BASE + '/api/health', { headers: token() ? { 'X-Branch-Token': token() } : {} })
    .then(function(r) { return r.json(); })
    .then(function(h) {
      $('tokenSec').style.display = h.needToken ? '' : 'none';
      $('tokenState').textContent = h.tokenOk ? '✓ 접속 확인됨' : '✗ 토큰 불일치';
      $('tokenState').style.color = h.tokenOk ? '#2e7d32' : '#c62828';
      var vTxt = h.hasVworldKey ? ' · V-World 연동됨' : '';
      $('apiStatus').textContent = h.ok ? '✓ API 정상 (' + h.version + vTxt + ')' : '';
    }).catch(function() {
      $('apiStatus').textContent = '⚠ API 서버 연결 확인 필요';
      $('apiStatus').style.color = '#c62828';
    });
}
