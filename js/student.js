/* 학생 페이지 */
let S = null;            // 서버에서 받은 상태
let offset = 0;          // 서버시각 - 내 시계
let tickTimer = null, saveTimer = null;
let dirty = false, submitting = false, pdfOffered = false;
const answers = {};      // { 문항id: 글 }

let PW = '';
const sapi = (action, p, t) => api(action, Object.assign({ sid: S ? S.sid : '', pw: PW }, p || {}), t);
const screens = ['login', 'setup', 'intro', 'write', 'result'];
function show(name) { screens.forEach(s => $('#screen-' + s).classList.toggle('hidden', s !== name)); window.scrollTo(0, 0); }
function msg(sel, text, cls) { const n = $(sel); n.replaceChildren(); if (text) n.append(el('div', { class: 'msg ' + (cls || 'err') }, text)); }
const lsKey = () => 'ans_' + (S ? S.sid : '');
function lsGet() { try { return JSON.parse(localStorage.getItem(lsKey()) || '{}'); } catch (e) { return {}; } }
function lsSet() { try { localStorage.setItem(lsKey(), JSON.stringify(answers)); } catch (e) { } }

/* ───── 로그인 ───── */
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const sid = $('#sid').value.replace(/\s/g, '');
  if (!/^[0-9]{4}$/.test(sid)) return msg('#loginMsg', '학번은 숫자 4자리로 입력해 주세요. (예: 1101)');
  await doLogin(sid, $('#lpw').value);
});
let pendingSid = '';
async function doLogin(sid, pw, silent) {
  $('#loginBtn').disabled = true; msg('#loginMsg', silent ? '' : '확인하는 중…', 'info');
  const r = await api('login', { sid, pw });
  $('#loginBtn').disabled = false;
  if (r.needSetup) { msg('#loginMsg', ''); pendingSid = sid; return showSetup(r); }
  if (!r.ok) { msg('#loginMsg', r.error); sessionStorage.removeItem('sid'); sessionStorage.removeItem('pw'); return; }
  msg('#loginMsg', '');
  PW = pw; sessionStorage.setItem('sid', sid); sessionStorage.setItem('pw', pw);
  applyState(r);
}

/* ───── 비밀번호 만들기 ───── */
const PW_RULE = /^hyein[0-9]{4}!$/;
function showSetup(r) {
  $('#setupWho').textContent = `${r.cls}반 ${r.team}조 · ${r.name} 학생이 맞나요? (학번 ${pendingSid})`;
  $('#npw').value = $('#npw2').value = ''; msg('#setupMsg', ''); show('setup');
}
$('#sid').addEventListener('input', e => { e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4); });
$('#showPw').onchange = e => { $('#npw').type = $('#npw2').type = e.target.checked ? 'text' : 'password'; };
$('#setupBack').onclick = () => { pendingSid = ''; show('login'); };
$('#setupForm').addEventListener('submit', async e => {
  e.preventDefault();
  const a = $('#npw').value, b = $('#npw2').value;
  if (!PW_RULE.test(a)) return msg('#setupMsg', '규칙에 맞지 않아요. hyein + 숫자 4자리 + ! 로 만들어 주세요. (hyein으로 시작, 숫자 4개, 마지막은 느낌표)');
  if (a !== b) return msg('#setupMsg', '두 비밀번호가 서로 달라요. 다시 확인해 주세요.');
  $('#setupBtn').disabled = true; msg('#setupMsg', '저장하는 중…', 'info');
  const r = await api('setPassword', { sid: pendingSid, pw: a });
  $('#setupBtn').disabled = false;
  if (!r.ok) return msg('#setupMsg', r.error);
  PW = a; sessionStorage.setItem('sid', pendingSid); sessionStorage.setItem('pw', a);
  applyState(r);
});
function applyState(r) {
  S = r; offset = r.serverNow - Date.now();
  if (r.status === 'ready') return showIntro();
  if (r.status === 'running') return showWrite();
  return showResult();
}

/* ───── 안내 ───── */
function showIntro() {
  $('#introTitle').textContent = S.name + ' 학생, 안녕하세요!';
  $('#introSub').textContent = `${S.cls}반 ${S.team}조 · 학번 ${S.sid}`;
  $('#introRoles').replaceChildren(...S.roles.map(r => el('span', { class: 'chip' }, r)));
  $('#introTime').textContent = `맡은 역할 ${S.roles.length}개 → 작성 시간 ${S.minutes}분 (문항 ${S.questions.length}개)`;
  $('#introMax').textContent = S.maxChars; $('#introPenalty').textContent = S.leavePenalty;
  $('#introPenalty').closest('li').classList.toggle('hidden', !(S.leavePenalty > 0));
  msg('#introMsg', '');
  show('intro');
}
$('#startBtn').onclick = async () => {
  $('#startBtn').disabled = true;
  const r = await sapi('start');
  $('#startBtn').disabled = false;
  if (!r.ok) return msg('#introMsg', r.error);
  applyState(r);
};
$('#introBack').onclick = logout;
function logout() { stopTimers(); sessionStorage.removeItem('sid'); sessionStorage.removeItem('pw'); PW = ''; S = null; $('#sid').value = ''; $('#lpw').value = ''; pdfOffered = false; show('login'); }

/* ───── 작성 ───── */
function showWrite() {
  const local = lsGet();
  (S.answers || []).forEach(a => { answers[a.id] = local[a.id] != null && local[a.id].length >= a.answer.length ? local[a.id] : a.answer; });
  S.questions.forEach(q => { if (answers[q.id] == null) answers[q.id] = local[q.id] || ''; });

  $('#wTitle').textContent = `${S.cls}반 ${S.team}조 · ${S.name}`;
  const list = $('#qList'); list.replaceChildren();
  let lastRole = null;
  S.questions.forEach(q => {
    if (q.role !== lastRole) {
      lastRole = q.role;
      list.append(el('div', { class: 'role-head' }, el('span', { class: 'chip' }, '역할'), el('h2', {}, q.role)));
    }
    const ta = el('textarea', { maxlength: S.maxChars, placeholder: '여기에 써 주세요', 'data-qid': q.id });
    ta.value = answers[q.id] || '';
    const cnt = el('div', { class: 'count' });
    const upd = () => { const n = ta.value.length; cnt.textContent = `${n} / ${S.maxChars}자`; cnt.classList.toggle('full', n >= S.maxChars); };
    ta.addEventListener('input', () => { answers[q.id] = ta.value; dirty = true; lsSet(); upd(); });
    ta.addEventListener('blur', () => saveNow());
    upd();
    list.append(el('div', { class: 'card qcard' },
      el('div', { class: 'qno' }, `문항 ${q.no}`), el('div', { class: 'qtext' }, q.q),
      el('div', { class: 'hint' }, '💡 ' + q.hint), ta, cnt));
  });
  show('write');
  away = null;
  updLeaveBadge();
  stopTimers();
  tickTimer = setInterval(tick, 500); tick();
  saveTimer = setInterval(() => saveNow(), 25000);
}
function stopTimers() { clearInterval(tickTimer); clearInterval(saveTimer); tickTimer = saveTimer = null; }

function remainMs() { return S.endsAt - (Date.now() + offset); }
function tick() {
  const ms = remainMs(), t = $('#timer');
  const sec = Math.max(0, Math.ceil(ms / 1000));
  t.textContent = String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  t.classList.toggle('warn', sec <= 300 && sec > 60); t.classList.toggle('danger', sec <= 60);
  const w = $('#warnMsg');
  if (sec <= 60) { w.style.display = ''; w.className = 'msg err'; w.textContent = '⏰ 1분 남았어요! 곧 자동으로 제출돼요.'; }
  else if (sec <= 300) { w.style.display = ''; w.className = 'msg info'; w.textContent = '⏰ 5분 남았어요. 마무리해 주세요.'; }
  else w.style.display = 'none';
  if (ms <= 0 && !submitting) doSubmit(true);
}

let savePromise = null;
async function saveNow() {
  if (!S || S.status !== 'running' || submitting) return;
  const body = dirty ? { answers } : {}; // 바뀐 게 없으면 '살아있음' 신호만 가볍게 보냄
  dirty = false;
  savePromise = sapi('save', body, 30000);
  const r = await savePromise;
  const n = $('#savedAt');
  if (r.ok) n.textContent = '✔ 자동 저장됨 ' + new Date().toLocaleTimeString('ko-KR');
  else { dirty = true; n.textContent = '⚠ 저장 실패 — 인터넷을 확인하세요 (내용은 이 컴퓨터에 임시 보관 중)'; if (r.timeup || r.done) doSubmit(true); }
}

/* ───── 화면 이탈 감지 (다른 탭·창·프로그램으로 넘어가면 1회 감점 + 벗어난 시간 기록) ───── */
let away = null; // 이탈 중이면 { start }
const fmtSec = s => s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`;
const isAway = () => document.visibilityState !== 'visible' || !document.hasFocus();
function updLeaveBadge() {
  const b = $('#leaveBadge'), n = S ? (S.leaves || 0) : 0;
  b.classList.toggle('hidden', !n);
  b.textContent = n ? `⚠ 화면 이탈 ${n}회 · ${fmtSec(S.leaveSec || 0)}` + (S.leavePenalty > 0 ? ` (−${n * S.leavePenalty}점)` : '') : '';
}
function watching() { return S && S.status === 'running' && !submitting && !$('#screen-write').classList.contains('hidden'); }
function checkAway() {
  if (!watching()) return;
  if (isAway()) {
    if (!away) {
      away = { start: Date.now() };
      S.leaves = (S.leaves || 0) + 1; updLeaveBadge();
      sapi('away', { start: away.start }, 20000);
    }
  } else if (away) {
    const rec = away; away = null;
    sendLeave(rec, Date.now(), 0);
  }
}
function sendLeave(rec, end, attempt) {
  const secs = Math.max(0, Math.round((end - rec.start) / 1000));
  if (!attempt) { S.leaveSec = (S.leaveSec || 0) + secs; updLeaveBadge(); showLeaveModal(secs); }
  sapi('leave', { start: rec.start, end }, 20000).then(r => {
    if (r.ok && typeof r.leaves === 'number') { S.leaves = r.leaves; S.leaveSec = r.leaveSec; updLeaveBadge(); }
    else if (r.network && attempt < 5) setTimeout(() => sendLeave(rec, end, attempt + 1), 2000);
  });
}
function showLeaveModal(secs) {
  const n = S.leaves, p = S.leavePenalty;
  $('#mLeaveText').textContent = `이탈 시간 ${fmtSec(secs)} · 지금까지 ${n}회` + (p > 0 ? `, 감점 −${n * p}점` : '') + ' (누적 이탈 시간 ' + fmtSec(S.leaveSec || 0) + ')';
  $('#mLeave').classList.remove('hidden');
}
document.addEventListener('visibilitychange', checkAway);
['blur', 'focus', 'pageshow'].forEach(ev => window.addEventListener(ev, checkAway));
setInterval(checkAway, 700);
$('#mLeaveOk').onclick = () => $('#mLeave').classList.add('hidden');

/* ───── 제출 ───── */
$('#submitBtn').onclick = () => {
  const empty = S.questions.filter(q => !(answers[q.id] || '').trim()).length;
  const w = $('#mSubmitWarn');
  w.classList.toggle('hidden', !empty); w.textContent = empty ? `아직 비어 있는 문항이 ${empty}개 있어요.` : '';
  $('#mSubmit').classList.remove('hidden');
};
$('#mSubmitNo').onclick = () => $('#mSubmit').classList.add('hidden');
$('#mSubmitYes').onclick = () => { $('#mSubmit').classList.add('hidden'); doSubmit(false); };

async function doSubmit(auto) {
  if (submitting) return;
  submitting = true; stopTimers(); lsSet();
  if (savePromise) { try { await savePromise; } catch (e) { } } // 진행 중인 자동 저장이 끝난 뒤 제출
  if (auto) { document.querySelectorAll('textarea').forEach(t => { t.disabled = true; }); await new Promise(res => setTimeout(res, Math.random() * 12000)); } // 시간 종료 때 한꺼번에 몰리지 않게 분산
  $('#mSubmit').classList.add('hidden');
  $('#busyTitle').textContent = auto ? '⏰ 시간이 끝나 자동으로 제출하고 있어요' : '제출하고 채점하고 있어요';
  $('#busyErr').replaceChildren(); $('.spinner').classList.remove('hidden');
  $('#mBusy').classList.remove('hidden');
  let r = null;
  for (let i = 0; i < 6; i++) {
    r = await sapi('submit', { answers }, 120000);
    if (r.ok) break;
    if (!r.network) break;
    await new Promise(res => setTimeout(res, 2500 + Math.random() * 3000));
  }
  if (r && r.ok) {
    $('#mBusy').classList.add('hidden'); submitting = false;
    applyState(r); offerPdf(); return;
  }
  $('.spinner').classList.add('hidden');
  $('#busyErr').append(el('div', { class: 'msg err' }, (r && r.error) || '제출에 실패했어요.'),
    el('p', { class: 'sub' }, '내용은 이 컴퓨터에 보관되어 있어요. 인터넷을 확인한 뒤 다시 시도하세요.'),
    el('button', { class: 'btn', onclick: () => { submitting = false; doSubmit(auto); } }, '다시 시도'));
}

/* ───── 결과 ───── */
function levelOf(p) { return p >= 80 ? ['아주 잘 이해했어요 🎉', 'ok'] : p >= 60 ? ['대체로 이해했어요 👍', 'ok'] : p >= 40 ? ['조금 더 복습해 봐요 📖', 'warn'] : ['내 역할을 다시 한번 살펴봐요 🔎', 'danger']; }
const r1 = n => Math.round(n * 10) / 10;

function showResult() {
  stopTimers();
  const R = S.result, pending = R.gradeStatus === '대기' || R.gradeStatus === '';
  $('#resMeta').textContent = `${S.cls}반 ${S.team}조 · 학번 ${S.sid} · 제출 ${R.submittedAt || ''}`;
  const sum = $('#resSummary'); sum.replaceChildren();
  const notice = $('#resNotice'); notice.replaceChildren();

  if (!S.showResult) {
    sum.append(el('div', { class: 'msg okm' }, '답안이 잘 제출되었어요. 채점 결과는 선생님이 확인한 뒤 안내해 주세요.'));
  } else if (pending) {
    sum.append(el('div', { class: 'msg info' }, '채점이 아직 끝나지 않았어요. 잠시 뒤 [결과 새로고침]을 눌러 주세요. (답안은 이미 안전하게 저장됐어요)'));
  } else {
    const pct = R.max ? R.total / R.max * 100 : 0, [label, cls] = levelOf(pct);
    sum.append(el('div', { class: 'row', style: 'align-items:flex-end;gap:16px' },
      el('div', { class: 'score-big' }, `${r1(R.total)} / ${R.max}`), el('span', { class: 'chip ' + cls }, label)));
    if (R.leaves > 0) sum.append(el('div', { class: 'msg err', style: 'margin-top:10px' },
      `⚠ 시험 중 화면 이탈 ${R.leaves}회 (총 ${fmtSec(R.leaveSec || 0)})` + (R.penalty ? ` → 감점 −${r1(R.penalty)}점 (원점수 ${r1(R.raw)}점)` : '') + '. 선생님이 확인 후 조정할 수 있어요.'));
    S.roles.forEach(role => {
      const its = R.items.filter(i => i.role === role), got = its.reduce((a, i) => a + (i.score || 0), 0), mx = its.reduce((a, i) => a + i.max, 0);
      sum.append(el('div', { style: 'margin-top:12px' }, el('b', {}, role), ` — ${r1(got)} / ${mx}`, el('div', { class: 'bar' }, el('i', { style: `width:${mx ? got / mx * 100 : 0}%` }))));
    });
  }

  const list = $('#resList'); list.replaceChildren();
  let last = null;
  R.items.forEach(it => {
    if (it.role !== last) { last = it.role; list.append(el('div', { class: 'role-head' }, el('span', { class: 'chip' }, '역할'), el('h2', {}, it.role))); }
    const card = el('div', { class: 'card' },
      el('div', { class: 'row', style: 'justify-content:space-between' }, el('b', {}, `문항 ${it.no}. ${it.title}`),
        S.showResult && it.score != null ? el('span', { class: 'chip' }, `${r1(it.score)} / ${it.max}점`) : null),
      el('div', { class: 'sub', style: 'margin:.3em 0' }, it.q),
      el('div', { class: 'myans' }, it.answer || '(작성하지 않음)'));
    if (S.showResult && it.score != null) {
      if (it.feedback) card.append(el('div', { class: 'fb' }, '💬 ' + it.feedback));
      if (it.rubric && it.rubric.length) card.append(el('ul', { class: 'crit' }, it.rubric.map((t, i) => el('li', { class: it.hits[i] ? 'hit' : '' }, t))));
    }
    list.append(card);
  });
  show('result');
}
$('#refreshBtn').onclick = async () => { const r = await sapi('login'); if (r.ok) applyState(r); else msg('#resNotice', r.error); };
$('#logoutBtn').onclick = logout;

/* ───── PDF ───── */
function offerPdf() { if (!pdfOffered) { pdfOffered = true; $('#mPdf').classList.remove('hidden'); } }
$('#pdfBtn').onclick = makePdf;
$('#mPdfYes').onclick = () => { $('#mPdf').classList.add('hidden'); makePdf(); };
$('#mPdfNo').onclick = () => $('#mPdf').classList.add('hidden');

function makePdf() {
  const R = S.result, doc = $('#pdfDoc'); doc.replaceChildren();
  doc.append(el('h1', {}, CONFIG.TITLE), el('div', { class: 'meta' },
    `${S.cls}반 ${S.team}조 · 학번 ${S.sid} · ${S.name} · 제출 ${R.submittedAt || ''}`, el('br'), '역할: ' + S.roles.join(', '),
    S.showResult && R.total != null && R.gradeStatus !== '대기' ? el('div', {}, `총점 ${r1(R.total)} / ${R.max}` + (R.leaves > 0 ? ` (화면 이탈 ${R.leaves}회·${fmtSec(R.leaveSec || 0)}, 감점 −${r1(R.penalty || 0)})` : '')) : null));
  let last = null;
  R.items.forEach(it => {
    if (it.role !== last) { last = it.role; doc.append(el('div', { class: 'pdf-role' }, '■ ' + it.role)); }
    const q = el('div', { class: 'pdf-q' }, el('b', {}, `문항 ${it.no}. ${it.title}`), el('div', {}, it.q), el('div', { class: 'pdf-a' }, it.answer || '(작성하지 않음)'));
    if (S.showResult && it.score != null) { q.append(el('div', {}, `점수: ${r1(it.score)} / ${it.max}`)); if (it.feedback) q.append(el('div', { class: 'pdf-fb' }, it.feedback)); }
    doc.append(q);
  });
  const name = `이해도점검_${S.sid}.pdf`;
  if (window.html2pdf) {
    html2pdf().set({ margin: [10, 10, 10, 10], filename: name, image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: '.pdf-q' } }).from(doc).save();
  } else { alert('PDF 도구를 불러오지 못했어요. 열리는 인쇄 창에서 "PDF로 저장"을 선택해 주세요.'); window.print(); }
}

/* ───── 시작: 새로고침해도 이어서 ───── */
window.addEventListener('beforeunload', e => { if (S && S.status === 'running' && !submitting) { e.preventDefault(); e.returnValue = ''; } });
(function init() { const sid = sessionStorage.getItem('sid'), pw = sessionStorage.getItem('pw'); if (sid && pw) { $('#sid').value = sid; doLogin(sid, pw, true); } })();
