/*
 * js/api.js : 0. API 통신 및 토큰 체크
 * backup/202611222155/index.html(v6.0)의 스크립트를 기능 변경 없이 나눈 파일입니다.
 * 함수 선언만 둡니다.
 * 불러오는 순서: common → api → customer → building → price → pension → application → main
 */

/* ───── 0. API 통신 및 토큰 체크 ───── */
function token() { return localStorage.getItem('branchToken') || ''; }

/* ───── 로그인 출입증(Worker /api/login) ─────
 * 출입증은 이 탭의 sessionStorage에만 두고(탭을 닫으면 사라짐), 로그인 후 1시간이 지나면 자동으로 로그인 창으로 돌아간다.
 * 비밀번호는 저장하지 않는다. Worker가 로그인을 요구하지 않으면(health.needLogin=false) 이 기능은 동작하지 않는다. */
var SESS_KEY = 'hpSess', sessTimer = null, sessTick = null;

function sessGet() {
  try {
    var s = JSON.parse(sessionStorage.getItem(SESS_KEY) || 'null');
    if (s && s.token && s.exp > Date.now()) return s;
  } catch (e) {}
  return null;
}

function authHeaders() {
  var h = {}, s = sessGet();
  if (s) h['Authorization'] = 'Bearer ' + s.token;
  if (token()) h['X-Branch-Token'] = token();
  return h;
}

function lockScreen(msg) {
  try { sessionStorage.removeItem(SESS_KEY); } catch (e) {}
  clearTimeout(sessTimer); clearInterval(sessTick);
  document.body.classList.add('locked');
  var sb = $('sessBar'); if (sb) sb.style.display = 'none';
  var m = $('loginMsg'); if (m) m.textContent = msg || '';
  var pw = $('loginPw'); if (pw) pw.value = '';
}

function unlockScreen() {
  var s = sessGet();
  document.body.classList.remove('locked');
  clearTimeout(sessTimer); clearInterval(sessTick);
  if (!s) { $('sessBar').style.display = 'none'; return; }
  $('sessBar').style.display = '';
  var show = function() {
    var left = Math.max(0, Math.ceil((s.exp - Date.now()) / 60000));
    $('sessInfo').textContent = '로그인 중 · 자동 접속 해제까지 약 ' + left + '분';
  };
  show();
  sessTick = setInterval(show, 15000);
  sessTimer = setTimeout(function() { lockScreen('로그인 후 1시간이 지나 접속이 해제되었습니다. 다시 로그인하세요.'); }, Math.max(0, s.exp - Date.now()));
}

function doLogin() {
  var btn = $('loginBtn'); btn.disabled = true; $('loginMsg').textContent = '확인 중...';
  fetch(API_BASE + '/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: $('loginId').value.trim(), pw: $('loginPw').value })
  }).then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
    .then(function(x) {
      if (!x.ok) throw new Error(x.j.error || '로그인에 실패했습니다.');
      sessionStorage.setItem(SESS_KEY, JSON.stringify({ token: x.j.token, exp: x.j.exp }));
      $('loginPw').value = ''; $('loginMsg').textContent = '';
      unlockScreen(); checkToken();
    }).catch(function(e) { $('loginMsg').textContent = e.message; })
    .then(function() { btn.disabled = false; });
}

function api(path, opt) {
  opt = opt || {};
  opt.headers = Object.assign({ 'content-type': 'application/json' }, authHeaders());
  return fetch(API_BASE + path, opt).then(function(r) {
    return r.json().then(function(j) {
      if (r.status === 401 && j.error === 'login_required') {
        lockScreen('접속이 해제되었습니다. 다시 로그인하세요.');
        throw new Error('로그인이 필요합니다.');
      }
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
      return j;
    });
  });
}

function checkToken() {
  fetch(API_BASE + '/api/health', { headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(h) {
      if (h.needLogin && !h.loginOk) { lockScreen(sessGet() ? '접속이 해제되었습니다. 다시 로그인하세요.' : ''); return; }
      if (h.needLogin) unlockScreen(); else document.body.classList.remove('locked');
      if (h.loginMisconfigured) { $('apiStatus').textContent = '⚠ 로그인 설정 불완전: SESSION_SECRET 필요'; $('apiStatus').style.color = '#c62828'; return; }
      $('tokenSec').style.display = (h.needToken && !h.needLogin) ? '' : 'none';
      $('tokenState').textContent = h.tokenOk ? '✓ 접속 확인됨' : '✗ 토큰 불일치';
      $('tokenState').style.color = h.tokenOk ? '#2e7d32' : '#c62828';
      var vTxt = h.hasVworldKey ? ' · V-World 연동됨' : '';
      $('apiStatus').textContent = h.ok ? '✓ API 정상 (' + h.version + vTxt + ')' : '';
    }).catch(function() {
      document.body.classList.remove('locked'); // 서버에 닿지 않으면 화면은 열어 두고 상태만 알린다
      $('apiStatus').textContent = '⚠ API 서버 연결 확인 필요';
      $('apiStatus').style.color = '#c62828';
    });
}
