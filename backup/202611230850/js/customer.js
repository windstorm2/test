/*
 * js/customer.js : 1. 고객 기본 정보
 * backup/202611222155/index.html(v6.0)의 스크립트를 기능 변경 없이 나눈 파일입니다.
 * 함수 선언만 둡니다.
 * 불러오는 순서: common → api → customer → building → price → pension → application → main
 */

/* ───── 1. 고객 기본 정보 (6자리 생년월일 입력 → API용 8자리 자동 변환 및 신청서 연동) ───── */
function ymd6To8(s) {
  var d = digits(s);
  if (d.length === 8) return d;
  if (d.length !== 6) return '';
  var yy = Number(d.slice(0, 2));
  var century = yy <= 25 ? '20' : '19';
  return century + d;
}

function targetLumpAmt() {
  if (S.pensionRes && S.pensionRes.lumpUsed != null) return Number(S.pensionRes.lumpUsed) || 0;
  return Number($('lump').value) || 0;
}

function recalcInchulBalance() {
  var totalTarget = targetLumpAmt();
  var subSum = 0;
  document.querySelectorAll('.ic-sub').forEach(function(el) {
    subSum += Number(digits(el.value)) || 0;
  });

  if (totalTarget > 0) {
    var rem = Math.max(0, totalTarget - subSum);
    $('ic7').value = rem > 0 ? rem.toLocaleString('ko-KR') : (subSum > 0 ? '0' : '');
  }
  var ic7Val = Number(digits($('ic7').value)) || 0;
  var grandTotal = subSum + ic7Val;
  $('ic_sum_label').textContent = grandTotal > 0 ? '(합계: ' + won(grandTotal) + '원)' : '';
  updateLumpGuideBadge();
  updateDocList();
}

function validYmd6(s) {
  var ymd8 = ymd6To8(s);
  if (ymd8.length !== 8) return false;
  var y = +ymd8.slice(0,4), m = +ymd8.slice(4,6), d = +ymd8.slice(6);
  return y >= 1900 && y <= new Date().getFullYear() && m >= 1 && m <= 12 && d >= 1 && d <= 31;
}
