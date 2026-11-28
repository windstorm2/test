/*
 * js/collateral.js : Step 5 담보방식 추천 (v6.1)
 *
 * colEval(inp)  화면을 건드리지 않는 계산 함수 (Node에서 따로 시험할 수 있다)
 * colInit()     화면 준비 (js/main.js 끝에서 호출)
 * colRefresh()  앞 단계 값과 응답을 읽어 다시 계산 (updateDocList 첫머리에서 호출)
 *
 * 위험 점수와 기준값(±20, -40)은 확정 전 임시값이다. docs/HANDOFF.md 6·7·8번 참고.
 */

var COL_LIFE = { 60: 24, 61: 23, 62: 22, 63: 21, 64: 21, 65: 20, 66: 19, 67: 18, 68: 18, 69: 17, 70: 16, 71: 15, 72: 14, 73: 13, 74: 13, 75: 12, 76: 11, 77: 11, 78: 10, 79: 9, 80: 9, 81: 8, 82: 8, 83: 7, 84: 7, 85: 6, 86: 6, 87: 5, 88: 5, 89: 4, 90: 4 };

/* 응답은 왼쪽 -2(저당권 쪽) ~ 오른쪽 +2(신탁 쪽). 문구는 기존 추천 도구에서 옮겼고 4번의 "0원" 표현만 뺐다. */
var COL_Q = [
  { q: '1. 등기상 어르신 본인의 명의 유지가 얼마나 중요한가요?', left: '매우 중요 (내 이름 유지 필수)', right: '전혀 중요하지 않음 (공사에 이름 이전도 무방)' },
  { q: "2. 배우자에게 연금이 자녀 동의 없이 '자동'으로 이어지는 것이 얼마나 중요한가요?", left: '전혀 중요하지 않음 (자녀 동의 얻을 수 있음)', right: '매우 중요 (자동 승계 필수 필요)', spouseOnly: true },
  { q: "3. 향후 집의 일부 또는 전부를 '보증금 있는' 전·월세로 임대할 계획이 있으신가요?", left: '전혀 없음 (공실 또는 보증금 없는 월세만)', right: '반드시 임대 계획 있음' },
  { q: '4. 가입할 때 내는 초기 세금(등록면허세 등) 부담을 줄이는 것이 중요하십니까?', left: '부담 없음 (초기 세금 직접 납부 무방)', right: '매우 중요 (초기 비용을 줄이고 싶음)' },
  { q: '5. 나중에 부부가 모두 돌아가시고 남은 돈을 돌려받을 때 어떤 방안을 더 중요하게 보십니까?', left: '가족이 직접 주택 처분 및 상속', right: '믿을 수 있는 사람을 미리 지정해두어 공사에서 직접 정산' },
  { q: '6. 어르신의 연세와 주택 나이를 고려하여, 재개발/재건축 추진 시 명의 변경 없이 편리하게 유지하는 것이 얼마나 중요하신가요?', left: '매우 중요 (정비사업 예상 및 대처 필수)', right: '전혀 관심 없음 (상관없음)' }
];

function colEval(inp) {
  var r = { kind: 'incomplete', title: '', one: '', family: '', fam: '', succ: null, attr: null, pref: 0, reasons: [], checks: [], guide: '', redev: null, tax: null, weights: [] };
  var sp = !!inp.hasSpouse, joint = sp && inp.ownership === '공동';
  var i;

  // 1) 재건축 가능성: 건물 경과연수 + 기대여명
  var w = (inp.weights || []).slice(), a = inp.answers || [];
  for (i = 0; i < 6; i++) { w[i] = Number(w[i]); if (isNaN(w[i])) w[i] = 1; }
  if (inp.age != null && inp.elapsed != null) {
    var life = inp.age < 60 ? 25 : (inp.age > 90 ? 3 : (COL_LIFE[inp.age] || 10));
    var sum = inp.elapsed + life;
    r.redev = { elapsed: inp.elapsed, life: life, sum: sum, level: sum > 40 ? 2 : (sum > 30 ? 1 : 0), raised: false };
    if (sum > 40 && w[5] === 1) { w[5] = 2; r.redev.raised = true; }
  }
  r.weights = w;

  // 2) 선호 지수 = Σ(응답 × 중요도) ÷ Σ(2 × 중요도) × 100
  var num = 0, den = 0;
  for (i = 0; i < 6; i++) {
    if (i === 1 && !sp) continue;
    num += (Number(a[i]) || 0) * w[i]; den += 2 * w[i];
  }
  r.pref = den ? Math.round(num / den * 100) : 0;

  // 3) 저당권 설정세금 참고값 (기존 도구의 식, 검증 전)
  if (inp.age != null && inp.housePrice > 0) {
    var gi = S.pensionRes && S.pensionRes.guarantee;
    if (gi && gi.setAmount != null) r.tax = { future: gi.setAmount, tax: gi.tax };
  }

  // 4) 가족 구성과 소유 형태 → 위험 점수
  if (inp.appChild == null || (sp && inp.spChild == null)) {
    r.title = '자녀 질문에 답하면 추천이 표시됩니다'; return r;
  }
  var appC = !!inp.appChild, spC = sp && !!inp.spChild;
  var appNC = false, spNC = false, base = 'neutral';
  if (!sp) {
    if (appC) { r.fam = 'single_child'; r.family = '배우자 없음 + 자녀 있음'; r.succ = 0; r.attr = 0; }
    else { r.fam = 'single_none'; r.family = '배우자·자녀 모두 없음'; r.succ = 0; r.attr = 2; base = 'trust'; }
  } else if (!appC && !spC) {
    r.fam = 'couple_none'; r.family = '무자녀 부부'; r.succ = 1; r.attr = 3; base = 'trust';
  } else {
    if (appC && spC) {
      var rel = Number(inp.rel) || 0;
      if (!rel) { r.title = '두 분의 자녀 관계를 선택하면 추천이 표시됩니다'; return r; }
      appNC = rel === 2 || rel === 4; spNC = rel === 3 || rel === 4;
    } else if (appC) { appNC = true; } else { spNC = true; }
    if (appNC || (joint && spNC)) {
      r.fam = 'owner_nc'; r.succ = 3; r.attr = 3; base = 'fixed';
      r.family = (appNC && spNC) ? '부부 각각 비공동 자녀 있음' : (appNC ? (spC ? '신청인에게 비공동 자녀 있음' : '신청인만 자녀 있음') : (appC ? '배우자에게 비공동 자녀 있음' : '배우자만 자녀 있음'));
    } else if (spNC) {
      r.fam = 'sp_nc_sole'; r.succ = 1; r.attr = 2; base = 'trust';
      r.family = appC ? '배우자에게 비공동 자녀 있음' : '배우자만 자녀 있음';
    } else {
      r.fam = 'common'; r.family = '공동자녀 부부'; r.succ = 1; r.attr = 1;
    }
  }
  r.family += ' · ' + (joint ? '부부 공동소유' : '신청인 단독소유');

  if (r.fam === 'owner_nc') {
    r.reasons.push('저당권방식은 소유자가 먼저 사망하면 배우자가 6개월 안에 주택 소유권 전부를 넘겨받아야 연금이 이어지는데, 상대 배우자의 자녀가 아닌 자녀(비공동 자녀)의 동의가 필요합니다.');
    r.reasons.push('저당권방식은 배우자가 주택을 넘겨받은 뒤 사망하면 남는 재산이 그 배우자의 상속인에게 가고, 먼저 사망한 분의 비공동 자녀에게는 가지 않을 수 있습니다.');
  } else if (r.fam === 'sp_nc_sole') {
    r.reasons.push('신청인 단독소유이고 비공동 자녀가 배우자에게만 있어, 신청인 사망 시 배우자 승계에 그 자녀는 관여하지 않습니다.');
    r.reasons.push('다만 저당권방식은 배우자가 주택을 넘겨받은 뒤 사망하면 남는 재산이 배우자의 상속인에게 갑니다. 원하는 사람에게 남기려면 신탁방식으로 귀속권리자를 미리 지정하는 편이 확실합니다.');
  } else if (r.fam === 'couple_none') {
    r.reasons.push('자녀가 없어 소유자의 부모가 생존한 경우가 아니면 배우자가 단독으로 상속합니다(민법 제1003조 적용, 법률 검토 전).');
    r.reasons.push('부부가 모두 사망한 뒤 남는 재산이 누구에게 갈지 정해져 있지 않으므로, 신탁방식으로 귀속권리자를 미리 지정하는 편이 확실합니다.');
    r.checks.push('소유자의 부모가 생존해 있으면 저당권방식의 배우자 승계에 부모의 동의가 필요할 수 있습니다.');
  } else if (r.fam === 'common') {
    r.reasons.push('자녀가 모두 두 분의 공동자녀라 배우자 승계와 상속에서 두 방식의 차이가 크지 않습니다.');
    r.reasons.push('다만 저당권방식은 배우자 승계 때 자녀 전원의 동의가 필요합니다. 한 명이라도 연락이 닿지 않거나 반대하면 승계가 막힙니다.');
  } else if (r.fam === 'single_child') {
    r.reasons.push('배우자가 없어 승계 문제가 없고, 남는 재산은 두 방식 모두 자녀에게 갑니다.');
  } else {
    r.reasons.push('배우자와 자녀가 없어 사망 후 남는 재산의 귀속이 정해져 있지 않습니다. 신탁방식으로 귀속권리자를 미리 지정하는 편이 확실합니다.');
  }

  // 5) 이용 제한과 판정
  // 보증금 있는 임대차는 저당권방식에서 "순수 월세로 변경"하는 조건으로 가입할 수 있다(사용자 확인 2026-11-23).
  // 따라서 가입을 막지는 않고, 신탁방식을 쓰기 어려운 경우에 한해 저당권방식을 추천한다.
  var leases = Number(inp.leases) || 0;
  var leaseTxt = '보증금 있는 임대차 ' + leases + '건을 순수 월세 계약으로 바꾸는 조건으로 가입할 수 있습니다.';
  var trustHard = !!inp.trustNA || (leases >= 5 && inp.houseType !== '단독주택');
  if (inp.trustNA) {
    r.kind = 'mortgage_only'; r.title = '저당권방식만 가능';
    r.one = '신탁방식을 쓸 수 없는 주택입니다(복합용도주택, 농지법 등으로 신탁이 제한되는 주택, 등기와 실질이 다른 주택).';
    if (leases >= 1) r.one += ' ' + leaseTxt;
    if (r.succ >= 2 || r.attr >= 2) r.checks.push('가족 구성상 저당권방식의 위험(위 점수)을 고객에게 따로 설명해야 합니다.');
  } else if (leases >= 5 && inp.houseType !== '단독주택') {
    r.kind = 'mortgage_only'; r.title = '저당권방식 (조건부)';
    r.one = '보증금 있는 임대차가 5건 이상이라 신탁방식을 이용할 수 없습니다(단독주택 제외). 저당권방식은 ' + leaseTxt;
    if (r.succ >= 2 || r.attr >= 2) r.checks.push('가족 구성상 저당권방식의 위험(위 점수)을 고객에게 따로 설명해야 합니다.');
  } else if (base === 'fixed') {
    r.kind = 'trust'; r.title = '신탁방식 추천';
    r.one = appNC ? '배우자가 자녀 동의 없이 연금을 이어받고, 남는 재산은 신청인 자녀에게 가도록 귀속권리자를 지정합니다.' : '배우자가 자녀 동의 없이 연금을 이어받고, 남는 재산의 귀속권리자를 미리 지정합니다.';
    r.reasons.push('배우자 승계 위험이 높아 고객 선호와 관계없이 신탁방식을 추천합니다.');
  } else if (base === 'trust') {
    if (r.pref < -40) {
      r.kind = 'mortgage'; r.title = '저당권방식 추천 (고객 선호 반영)';
      r.one = '고객 선호가 저당권방식 쪽으로 뚜렷합니다. 남는 재산 귀속 위험은 따로 설명해야 합니다.';
    } else {
      r.kind = 'trust'; r.title = '신탁방식 추천 (기본)';
      r.one = r.fam === 'single_none' ? '남는 재산을 받을 사람(지인 등 1인)을 귀속권리자로 개별지정합니다.' : '남는 재산을 받을 귀속권리자를 미리 지정합니다.';
    }
    r.reasons.push('귀속 위험이 높아 신탁방식이 기본 추천입니다. 선호 지수가 -40 미만이면 저당권방식으로 바뀝니다(현재 ' + r.pref + ').');
  } else {
    if (r.pref > 20) { r.kind = 'trust'; r.title = '신탁방식 추천 (고객 선호 반영)'; r.one = '위험 측면에서는 두 방식이 비슷하고, 고객 선호가 신탁방식 쪽입니다.'; }
    else if (r.pref < -20) { r.kind = 'mortgage'; r.title = '저당권방식 추천 (고객 선호 반영)'; r.one = '위험 측면에서는 두 방식이 비슷하고, 고객 선호가 저당권방식 쪽입니다.'; }
    else { r.kind = 'free'; r.title = '자율 선택 (두 방식에 큰 차이 없음)'; r.one = '위험 측면에서 두 방식이 비슷하고 고객 선호도 뚜렷하지 않습니다. 아래 알아둘 점을 보고 고객이 고릅니다.'; }
    r.reasons.push('위험 측면에서는 중립이므로 고객 선호 지수(' + r.pref + ')로 판단했습니다. +20 초과는 신탁, -20 미만은 저당권입니다.');
  }

  if (leases >= 1 && !trustHard && r.kind === 'mortgage') {
    // 신탁방식을 쓸 수 있는데 임대차가 있으면 저당권방식은 추천하지 않는다.
    r.kind = 'trust'; r.title = '신탁방식 추천 (임대차 반영)';
    r.one = '보증금 있는 임대차가 있어 신탁방식을 추천합니다. 저당권방식은 임대차를 순수 월세로 바꿔야 가입할 수 있습니다.';
    r.reasons.push('고객 선호는 저당권방식 쪽(지수 ' + r.pref + ')이지만, 신탁방식을 쓸 수 있고 보증금 있는 임대차 ' + leases + '건이 있어 저당권방식은 추천하지 않습니다. 저당권방식은 신탁방식을 쓰기 어려운 경우에만 추천합니다.');
  }
  if (leases >= 1 && !trustHard) r.checks.push('보증금 있는 임대차가 ' + leases + '건 있습니다. 저당권방식을 선택하면 ' + leaseTxt);
  if (r.redev && r.redev.level >= 1) {
    var t = '건물 경과 ' + r.redev.elapsed + '년 + 기대여명 ' + r.redev.life + '년 = ' + r.redev.sum + '년으로, 거주 중 재건축·재개발 가능성' + (r.redev.level === 2 ? '이 높습니다.' : '이 있습니다.');
    if (r.redev.raised) t += ' 6번 문항의 중요도 "보통"을 "중요"로 올려 계산했습니다.';
    r.checks.push(t);
  }
  if (r.kind === 'trust') {
    if (sp && (appC || spC)) r.checks.push('신탁방식에서도 공동상속인이 유류분을 청구하면 배우자에게 가액반환 책임이 생길 수 있습니다.');
    r.checks.push('신탁방식의 비용 지원은 한시적입니다(HF 안내).');
  }
  r.checks.push('가입 후에도 담보제공방식을 서로 바꿀 수 있습니다.');

  // 6) 귀속권리자 지정 안내 (신탁방식 설명서 20번)
  if (appC) r.guide = '신청인(위탁자)에게 자녀가 있으므로 자녀 전원을 포괄지정하거나, 자녀·자녀의 배우자·손자녀 가운데 1인 이상을 개별지정할 수 있습니다. 그 밖의 사람은 1인만 개별지정할 수 있습니다.';
  else r.guide = '신청인(위탁자)에게 자녀가 없으므로 3촌 이내 혈족·2촌 이내 인척(배우자의 자녀 등) 가운데 1인 이상 또는 그 밖의 사람 1인을 개별지정하거나, 배우자의 자녀 전원·형제자매 전원·손자녀 전원 가운데 하나로 포괄지정할 수 있습니다.';
  if (r.fam === 'single_none') r.guide += ' 지인은 1인만 개별지정할 수 있습니다.';
  if (joint) r.guide += ' 부부 공동소유는 위탁자가 두 분이므로 지정 방법을 공사 기준으로 확인하세요.';
  return r;
}

function colBirth8(v) {
  var s = String(v || '').replace(/\D/g, '');
  if (s.length === 8) return s;
  if (s.length !== 6) return '';
  var r = '';
  try { if (typeof ymd6To8 === 'function') r = String(ymd6To8(s) || '').replace(/\D/g, ''); } catch (e) { r = ''; }
  return r.length === 8 ? r : '19' + s;
}

function colAgeOf(b8) {
  if (!b8) return null;
  var y = +b8.slice(0, 4), m = +b8.slice(4, 6), d = +b8.slice(6, 8), t = new Date();
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  var a = t.getFullYear() - y;
  if (t.getMonth() + 1 < m || (t.getMonth() + 1 === m && t.getDate() < d)) a--;
  return a >= 0 && a < 130 ? a : null;
}

function colInputs() {
  var val = function(id) { var e = $(id); return e ? String(e.value || '') : ''; };
  var hasSp = val('spouseBirth').replace(/\D/g, '').length > 0 || val('sp_name').trim().length > 0 || val('sp_ssn').replace(/\D/g, '').length > 0;
  var a1 = colAgeOf(colBirth8(val('ownerBirth'))), a2 = colAgeOf(colBirth8(val('spouseBirth')));
  var age = a1 == null ? null : (hasSp && a2 != null ? Math.min(a1, a2) : a1);
  var ua = String((S.det && S.det.useAprDay) || (S.bld && S.bld.useAprDay) || '');
  var uy = parseInt(ua.slice(0, 4), 10);
  var own = document.querySelector('input[name="ownership"]:checked');
  var yn = function(id) { var v = val(id); return v === '' ? null : v === 'Y'; };
  var ans = [], wts = [];
  for (var i = 0; i < COL_Q.length; i++) {
    var c = document.querySelector('input[name="col_q' + i + '"]:checked');
    ans.push(c ? Number(c.value) : 0);
    wts.push(Number(val('col_w' + i) || 1));
  }
  return {
    hasSpouse: hasSp, ownership: own ? own.value : '단독',
    appChild: yn('col_appChild'), spChild: hasSp ? yn('col_spChild') : null, rel: Number(val('col_rel')) || 0,
    leases: Number(val('col_leases')) || 0, trustNA: val('col_trustNA') === 'Y',
    houseType: val('house_type'), housePrice: Number(val('housePrc')) || 0,
    age: age, useYear: uy > 1900 ? uy : null, elapsed: uy > 1900 ? new Date().getFullYear() - uy : null,
    growth: val('col_growth') === '' ? null : Number(val('col_growth')),
    answers: ans, weights: wts
  };
}

function colRender(r) {
  if (r.kind === 'incomplete') return '<div class="banner info">' + r.title + '</div>'; // 연소자·가족 요약 줄과 같은 서식
  var h = ['<h3>' + r.title + '</h3>'];
  if (r.one) h.push('<div class="col-one">' + r.one + '</div>');
  var lv = ['없음', '낮음', '높음', '매우 높음'];
  var li = function(arr) { return '<ul>' + arr.map(function(x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'; };
  h.push('<div class="col-kv">');
  h.push('<div><b>가족 구성 · 소유 형태</b>' + r.family + '</div>');
  h.push('<div><b>배우자 승계 위험 (저당권 선택 시)</b>' + r.succ + '점 / 3점 · ' + lv[r.succ] + '</div>');
  h.push('<div><b>남는 재산 귀속 위험 (저당권 선택 시)</b>' + r.attr + '점 / 3점 · ' + lv[r.attr] + '</div>');
  h.push('<div><b>고객 선호 지수 (-100 저당권 ~ +100 신탁)</b>' + r.pref + ' · ' + (r.pref > 20 ? '신탁 쪽' : (r.pref < -20 ? '저당권 쪽' : '뚜렷하지 않음')) + '</div>');
  h.push('</div>');
  h.push('<h4>추천 사유</h4>' + li(r.reasons));
  if (r.checks.length) h.push('<h4>확인할 사항</h4>' + li(r.checks));
  if (r.tax) h.push('<h4>저당권 설정세금 참고값</h4><ul><li>약 ' + r.tax.tax.toLocaleString('ko-KR') + '원 (100세말 예상 주택가격 ' + r.tax.future.toLocaleString('ko-KR') + '원 × 0.12%.)</li></ul>');
  h.push('<h4>저당권방식 알아둘 점</h4>' + li([
    '등기 명의는 그대로 유지됩니다.',
    '소유자가 사망하면 배우자가 6개월 안에 주택 소유권 전부를 넘겨받아야 연금이 이어지고, 공동상속인 전원의 동의가 필요합니다.',
    '가입할 때 등록면허세 등 설정 비용을 가입자가 냅니다.',
    '보증금 있는 임대는 할 수 없고, 주택 일부를 보증금 없는 월세로만 임대할 수 있습니다.'
  ]));
  h.push('<h4>신탁방식 알아둘 점</h4>' + li([
    '주택 소유권이 공사 앞으로 신탁등기되고, 가입자는 그대로 거주합니다.',
    '소유자가 사망하면 배우자가 자녀 동의 없이 연금을 이어받습니다.',
    '부부가 모두 사망한 뒤 남는 재산은 미리 지정한 귀속권리자에게 갑니다.',
    '보증금 있는 임대도 할 수 있습니다(단독주택이 아니면 4건까지).',
    '비용 지원은 한시적이고, 유류분 청구가 있으면 가액반환 책임이 생길 수 있습니다.'
  ]));
  h.push('<h4>귀속권리자 지정 안내 (신탁방식)</h4><ul><li>' + r.guide + '</li></ul>');
  h.push('<table class="col-table"><tr><th>지정방법</th><th>위탁자 자녀</th><th>지정 대상</th></tr>' +
    '<tr><td>개별지정</td><td>있음</td><td>① 위탁자의 자녀, 자녀의 배우자, 손자녀, 보증약정 이후 혼인한 배우자 가운데 1인 이상 / ② 그 밖의 사람 1인 (①·② 중 하나)</td></tr>' +
    '<tr><td>개별지정</td><td>없음</td><td>① 위탁자의 3촌 이내 혈족(손자녀, 형제, 조카 등), 2촌 이내 인척(배우자의 자녀 등), 보증약정 이후 혼인한 배우자 가운데 1인 이상 / ② 그 밖의 사람 1인 (①·② 중 하나)</td></tr>' +
    '<tr><td>포괄지정</td><td>있음</td><td>자녀 전원</td></tr>' +
    '<tr><td>포괄지정</td><td>없음</td><td>① 사후수익자(배우자)의 자녀 전원 ② 위탁자의 형제·자매 전원 ③ 위탁자의 손자녀 전원 가운데 하나. ②, ③은 귀속권리자가 되는 사람 중 1인 이상의 개인정보 제공 동의 필요</td></tr></table>');
  return h.join('');
}

function colRefresh() {
  if (!S.col || !$('colResult')) return;
  try {
    var inp = colInputs();
    $('col_owner').value = inp.ownership;
    $('col_spChildWrap').style.display = inp.hasSpouse ? '' : 'none';
    $('col_relWrap').style.display = (inp.hasSpouse && inp.appChild === true && inp.spChild === true) ? '' : 'none';
    var q2 = $('col_qrow1'); if (q2) q2.style.display = inp.hasSpouse ? '' : 'none';
    var r = colEval(inp); S.col.last = r;
    if (S.pensionRes && typeof updateGuarantee === 'function') updateGuarantee(S.pensionRes);
    $('colBase').innerHTML = '연소자 ' + (inp.age == null ? '미입력' : inp.age + '세') +
      ' · 배우자 ' + (inp.hasSpouse ? '있음' : '없음') +
      ' · 주택가격 ' + (inp.housePrice ? inp.housePrice.toLocaleString('ko-KR') + '원' : '미입력') +
      ' · ' + (inp.houseType || '유형 미선택') +
      ' · 사용승인 ' + (inp.useYear ? inp.useYear + '년(' + inp.elapsed + '년 경과)' : '미조회');
    $('colResult').innerHTML = colRender(r);
    var pick = $('collateral_type') ? $('collateral_type').value : '';
    var pk = pick === '근저당권' ? 'mortgage' : (pick.indexOf('신탁') === 0 ? 'trust' : '');
    document.querySelectorAll('[data-col-pick]').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-col-pick') === pick);
    });
    var m = $('colPickMsg');
    if (!pk) { m.className = ''; m.innerHTML = ''; }
    else if (r.kind === 'mortgage_only' && pk === 'trust') { m.className = 'banner warn'; m.innerHTML = '최종 선택 : ' + pick + '. 신탁방식을 이용할 수 없는 조건입니다(신탁 불가 주택 또는 보증금 있는 임대차 5건 이상).'; }
    else if ((r.kind === 'trust' || r.kind === 'mortgage') && pk !== r.kind) { m.className = 'banner warn'; m.innerHTML = '최종 선택 : ' + pick + '. 추천은 "' + r.title + '"인데 다른 방식을 골랐습니다. 고객이 차이를 이해했는지 확인하세요.'; }
    else { m.className = 'banner info'; m.innerHTML = '최종 선택 : ' + pick + ' (신청서의 담보제공방식에 반영했습니다)'; }
  } catch (e) {
    if (window.console) console.error('collateral', e);
  }
}

function colInit() {
  var sec = $('colSec');
  if (!sec) return;
  S.col = { last: null };
  var h = ['<div class="col-qhead">고객 선호 문항 : 가운데가 중립이고, 왼쪽은 저당권방식 쪽, 오른쪽은 신탁방식 쪽입니다.</div>'];
  COL_Q.forEach(function(q, i) {
    var radios = '';
    [-2, -1, 0, 1, 2].forEach(function(v) {
      radios += '<label><input type="radio" name="col_q' + i + '" value="' + v + '"' + (v === 0 ? ' checked' : '') + '></label>';
    });
    h.push('<div class="col-q" id="col_qrow' + i + '"><div class="col-qt">' + q.q + '</div><div class="col-scale">' +
      '<span class="col-l">' + q.left + '</span><span class="col-radios">' + radios + '</span><span class="col-r">' + q.right + '</span>' +
      '<select id="col_w' + i + '" class="col-w" title="중요도"><option value="0">중요도 없음</option><option value="1" selected>중요도 보통</option><option value="2">중요도 중요</option></select>' +
      '</div></div>');
  });
  $('colSurvey').innerHTML = h.join('');

  var onAny = function(e) {
    var t = e.target;
    if (t && t.id === 'col_owner') {
      var rd = document.querySelector('input[name="ownership"][value="' + t.value + '"]');
      if (rd && !rd.checked) { rd.checked = true; rd.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    colRefresh();
  };
  sec.addEventListener('change', onAny);
  sec.addEventListener('input', onAny);
  sec.querySelectorAll('[data-col-pick]').forEach(function(b) {
    b.addEventListener('click', function() {
      var sel = $('collateral_type');
      if (!sel) return;
      sel.value = b.getAttribute('data-col-pick');
      if (typeof updateDocList === 'function') updateDocList(); else colRefresh();
    });
  });
  $('colReload').addEventListener('click', function() { colRefresh(); });
  ['ownerBirth', 'spouseBirth', 'housePrc', 'house_type', 'collateral_type', 'sp_name', 'sp_ssn'].forEach(function(id) {
    var e = $(id);
    if (!e) return;
    e.addEventListener('input', colRefresh);
    e.addEventListener('change', colRefresh);
  });
  document.querySelectorAll('input[name="ownership"]').forEach(function(e) { e.addEventListener('change', colRefresh); });
  colRefresh();
}
