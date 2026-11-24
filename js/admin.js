/* 교사 관리 페이지 */
let PW = '', LIST = [], pollTimer = null;
const adm = (action, p, t) => api(action, Object.assign({ pw: PW }, p || {}), t);
const note = (sel, text, cls) => { const n = $(sel); n.replaceChildren(); if (text) n.append(el('div', { class: 'msg ' + (cls || 'err') }, text)); };
const r1 = n => Math.round(n * 10) / 10;

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); PW = $('#pw').value;
  note('#loginMsg', '확인 중…', 'info');
  const r = await adm('adminLogin');
  if (!r.ok) { PW = ''; return note('#loginMsg', r.error); }
  sessionStorage.setItem('apw', PW); enter();
});
$('#logout').onclick = () => { sessionStorage.removeItem('apw'); location.reload(); };
const MONITOR_ONLY = new URLSearchParams(location.search).get('view') === 'monitor';
function enter() {
  $('#loginView').classList.add('hidden'); $('#mainView').classList.remove('hidden');
  if (MONITOR_ONLY) { // 별도 감시 창: 감시 화면만 크게 보여 줌
    document.title = '실시간 감시'; document.querySelector('.tabs').classList.add('hidden');
    ['status', 'settings', 'export'].forEach(t => $('#tab-' + t).classList.add('hidden')); $('#tab-monitor').classList.remove('hidden');
    $('#popMonitor').classList.add('hidden'); $('#adminTitle').textContent = '실시간 감시'; loadMonitor();
  } else { loadStatus(); loadSettings(); }
  setInterval(() => { if (!$('#tab-monitor').classList.contains('hidden')) loadMonitor(); }, 6000); setInterval(tickMonitor, 1000); pollTimer = setInterval(() => { if (!$('#tab-status').classList.contains('hidden')) loadStatus(true); }, 30000); }

document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  ['status', 'monitor', 'settings', 'export'].forEach(t => $('#tab-' + t).classList.toggle('hidden', t !== b.dataset.tab));
  if (b.dataset.tab === 'monitor') loadMonitor();
});

/* ───── 현황 ───── */
async function loadStatus(quiet) {
  if (!quiet) note('#statusMsg', '불러오는 중…', 'info');
  const r = await adm('adminOverview');
  if (!r.ok) return note('#statusMsg', r.error);
  note('#statusMsg', ''); LIST = r.list; fillClassFilter(); render();
}
function fillClassFilter() {
  const sel = $('#fClass'), cur = sel.value, cls = [...new Set(LIST.map(s => s.cls))].sort((a, b) => a - b);
  sel.replaceChildren(el('option', { value: '' }, '전체 반'), ...cls.map(c => el('option', { value: c }, c + '반'))); sel.value = cur;
}
const stateClass = s => s === '미접속' ? 'gray' : s === '작성 중' ? 'warn' : s === '제출' ? 'ok' : s.indexOf('미제출') >= 0 ? 'danger' : 'ok';
function render() {
  const fc = $('#fClass').value, fs = $('#fStatus').value, fg = $('#fGrade').value, q = $('#fSearch').value.trim();
  const rows = LIST.filter(s => (!fc || String(s.cls) === fc) && (!fs || s.status === fs) &&
    (!fg || (fg === '대기' ? (s.grade === '대기' || String(s.grade).indexOf('임시') === 0) : String(s.grade).indexOf('완료') === 0)) && (!q || String(s.name).includes(q) || String(s.sid).includes(q)));
  const cnt = k => LIST.filter(s => s.status === k).length;
  $('#stats').replaceChildren(...[['전체', LIST.length], ['미접속', cnt('미접속')], ['작성 중', cnt('작성 중')],
    ['제출 완료', LIST.filter(s => s.status === '제출' || s.status === '시간종료').length], ['채점 대기', LIST.filter(s => s.grade === '대기' || String(s.grade).indexOf('임시') === 0).length],
    ['학번 미입력', LIST.filter(s => !s.sid).length]].map(([k, v]) => el('div', { class: 'stat' }, k, el('b', {}, v))));
  $('#rows').replaceChildren(...rows.map(s => el('tr', {},
    el('td', {}, s.cls), el('td', {}, s.team), el('td', {}, s.sid || '⚠ 없음'), el('td', {}, s.name),
    el('td', {}, s.roles.map(r => r.replace('AI 윤리·소통 담당', 'AI윤리').replace('프로젝트 매니저', 'PM').replace('도메인 분석가', '도메인').replace('데이터 엔지니어', '데이터').replace('모델 개발자', '모델')).join(' · ')),
    el('td', {}, s.minutes + '분'), el('td', {}, el('span', { class: 'chip ' + stateClass(s.status) }, s.status)),
    el('td', {}, s.grade || '-'), el('td', {}, s.total === '' ? '-' : `${r1(s.total)}/${s.max}`),
    el('td', { style: 'white-space:nowrap' }, s.status === '미접속' ? '-' : leaveCtl(s.sid, s.leaves || 0, s.leaveSec || 0)),
    el('td', { style: 'white-space:nowrap' }, el('button', { class: 'btn small ghost', onclick: () => openDetail(s.sid) }, '상세')))));
}
['fClass', 'fStatus', 'fGrade'].forEach(i => $('#' + i).onchange = render);
$('#fSearch').oninput = render; $('#reload').onclick = () => loadStatus();
$('#gradePending').onclick = async () => {
  const cls = $('#fClass').value, btn = $('#gradePending');
  const waiting = LIST.filter(s => (!cls || String(s.cls) === cls) && (s.grade === '대기' || String(s.grade).indexOf('임시') === 0)).length;
  if (!waiting) return note('#statusMsg', (cls ? cls + '반에' : '') + ' 채점할 답안이 없어요.', 'info');
  if (!confirm(`${cls ? cls + '반' : '전체'} 제출 답안 ${waiting}명을 지금 채점할까요? (AI 키를 사용해요)`)) return;
  btn.disabled = true; note('#statusMsg', '채점 중… (한 번에 약 3분까지 진행돼요. 창을 닫지 마세요)', 'info');
  const r = await adm('adminGradePending', { cls }, 330000);
  btn.disabled = false;
  note('#statusMsg', r.ok ? `${r.n}명을 채점했어요.` + (r.left ? ` 아직 ${r.left}명이 남았어요. [채점하기]를 한 번 더 눌러 주세요.` : ' 모두 끝났어요.') : r.error, r.ok ? 'okm' : 'err'); loadStatus(true);
};

/* ───── 상세 ───── */
async function openDetail(sid) {
  if (!sid) return;
  const body = $('#detailBody'); body.replaceChildren(el('p', {}, '불러오는 중…')); $('#mDetail').classList.remove('hidden');
  const r = await adm('adminDetail', { sid });
  if (!r.ok) { body.replaceChildren(el('div', { class: 'msg err' }, r.error), el('button', { class: 'btn gray', onclick: closeDetail }, '닫기')); return; }
  const ses = r.session;
  const sumLine = el('div', { class: 'sub', style: 'font-weight:700;margin-bottom:6px' }, ses && ses['원점수'] !== '' && ses['원점수'] != null ? `원점수 ${r1(ses['원점수'])} − 감점 ${r1(ses['감점'] || 0)} = 최종 ${r1(ses['총점'])} / ${ses['만점']}` : '');
  body.replaceChildren(
    el('h2', {}, `${r.cls}반 ${r.team}조 · ${r.name} (${r.sid})`),
    el('p', { class: 'sub' }, r.roles.join(', ') + (ses ? ` · 시작 ${ses['시작시각']} · 제출 ${ses['제출시각'] || '-'} · ${ses['상태']}` : ' · 아직 시작 전')),
    ses ? el('div', {}, sumLine, leaveBox(r, ses, sid, sumLine)) : null,
    ...r.items.map(it => el('div', { class: 'card' },
      el('div', { class: 'row', style: 'justify-content:space-between' }, el('b', {}, `[${it.role}] ${it.title}`), scoreCtl(sid, it, x => { sumLine.textContent = `원점수 ${r1(x.raw)} − 감점 ${r1(x.pen || 0)} = 최종 ${r1(x.total)} / ${x.sessMax}`; })),
      el('div', { class: 'sub' }, it.q),
      el('div', { class: 'myans' }, it.answer || '(작성 없음)'),
      it.feedback ? el('div', { class: 'fb' }, `💬 ${it.feedback} (${it.mode})`) : null,
      el('ul', { class: 'crit' }, it.rubric.map((t, i) => el('li', { class: it.hits[i] === 'O' ? 'hit' : '' }, t))))),
    el('div', { class: 'row' },
      el('button', { class: 'btn small', onclick: async () => { body.prepend(el('div', { class: 'msg info' }, '재채점 중…')); const x = await adm('adminRegrade', { sid }, 120000); x.ok ? (openDetail(sid), loadStatus(true)) : alert(x.error); } }, '다시 채점'),
      el('button', { class: 'btn small ghost', onclick: async () => { const m = prompt('몇 분을 더 줄까요? (지금부터 시작하는 시간)', '10'); if (!m) return; const x = await adm('adminExtend', { sid, minutes: Number(m) }); alert(x.ok ? '연장했어요. 학생이 다시 접속하면 이어서 쓸 수 있어요.' : x.error); closeDetail(); loadStatus(true); } }, '시간 연장 / 다시 열기'),
      el('button', { class: 'btn small ghost', onclick: async () => { if (!confirm(`${r.name} 학생의 비밀번호를 초기화할까요? 학생이 다음 접속 때 새로 만들어요.`)) return; const x = await adm('adminResetPw', { sid }); alert(x.ok ? '비밀번호를 초기화했어요.' : x.error); openDetail(sid); } }, r.hasPw ? '비밀번호 초기화' : '비밀번호 미설정'),
      el('button', { class: 'btn small danger', onclick: async () => { if (!confirm(`${r.name} 학생의 시간과 답안을 모두 지울까요? 되돌릴 수 없어요.`)) return; const x = await adm('adminReset', { sid }); alert(x.ok ? '초기화했어요.' : x.error); closeDetail(); loadStatus(true); } }, '초기화(처음부터)'),
      el('button', { class: 'btn small gray', onclick: closeDetail }, '닫기')));
}
// ── 화면 이탈: 표와 상세 창 어디서든 −/+ 로 바로 고침 (서버에 즉시 저장, 점수 자동 재계산)
const fmtSec = s => { s = Math.round(Number(s) || 0); return s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`; };
let lastEditAt = 0;
function toast(text, bad) {
  const t = el('div', { class: 'msg ' + (bad ? 'err' : 'okm'), style: 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99;box-shadow:0 4px 18px rgba(0,0,0,.25);max-width:90vw' }, text);
  document.body.append(t); setTimeout(() => t.remove(), bad ? 7000 : 2200);
}
// 화면에 먼저 반영하고(바로 줄어듦) 서버에 저장. 실패하면 되돌리고 이유를 알려 줌
async function setLeaves(sid, to, after) {
  if (to < 0) return;
  const s = LIST.find(x => x.sid === sid);
  const prev = s ? { leaves: s.leaves, leaveSec: s.leaveSec, total: s.total } : null;
  lastEditAt = Date.now();
  if (s) { s.leaves = to; if (to === 0) s.leaveSec = 0; render(); renderMonitor(); }
  const r = await adm('adminSetLeaves', { sid, count: to });
  if (!r.ok) {
    if (s && prev) { Object.assign(s, prev); render(); renderMonitor(); }
    return toast('이탈 횟수를 저장하지 못했어요: ' + (r.error || '서버 응답 없음'), true);
  }
  lastEditAt = Date.now();
  if (s) { s.leaves = r.leaves; s.leaveSec = r.leaveSec; if (s.total !== '' && r.total !== '' && r.total != null) s.total = r.total; render(); renderMonitor(); }
  if (after) after(r);
}
function leaveCtl(sid, n, sec, after, big) {
  let busy = false;
  const go = async d => { if (busy) return; busy = true; await setLeaves(sid, n + d, after); busy = false; };
  return el('span', { class: 'stepper' + (big ? ' big' : ''), title: '실수로 이탈한 경우 − 로 줄이세요' },
    el('button', { class: 'step', disabled: n <= 0, onclick: () => go(-1) }, '−'),
    el('span', { class: 'chip ' + (n ? 'danger' : 'ok') }, n ? `${n}회 · ${fmtSec(sec)}` : '0회'));
}
// ── 문항 점수: 점수 옆 −/+ (0.5점씩, 0~만점 사이) → 부분 점수
function scoreCtl(sid, it, onTotals) {
  const lab = el('span', { class: 'chip' }), dl = el('span', { class: 'sub', style: 'margin-left:6px' });
  let cur = it.score, busy = false;
  const paint = () => { lab.textContent = cur == null ? '미채점' : `${r1(cur)} / ${it.max}`; dl.textContent = it.delta ? `(교사 조정 ${it.delta > 0 ? '+' : ''}${r1(it.delta)})` : ''; };
  const go = async d => {
    if (busy) return; if (cur == null) return alert('아직 채점되지 않은 문항이에요. 먼저 [다시 채점]을 눌러 주세요.');
    busy = true;
    const r = await adm('adminAdjustScore', { sid, qid: it.id, delta: d });
    busy = false;
    if (!r.ok) return alert(r.error);
    cur = r.score; it.delta = r.delta; paint();
    const s = LIST.find(x => x.sid === sid); if (s) { s.total = r.total; render(); }
    if (onTotals) onTotals(r);
  };
  paint();
  return el('span', { class: 'stepper' },
    el('button', { class: 'step', onclick: () => go(-0.5) }, '−'), lab,
    el('button', { class: 'step', onclick: () => go(0.5) }, '+'), dl);
}
function leaveBox(r, ses, sid, sumEl) {
  const log = String(ses['이탈기록'] || '');
  const holder = el('div', { class: 'card' });
  const draw = (n, sec, logText) => {
    holder.replaceChildren(
      el('div', { class: 'row', style: 'justify-content:space-between' },
        el('b', {}, '화면 이탈 (횟수 · 벗어난 시간)'),
        leaveCtl(sid, n, sec, x => { draw(x.leaves, x.leaveSec, logText + '\n↺ 교사가 수정'); setSum(x); }, true)),
      n ? el('div', { class: 'sub' }, `감점 −${n * r.penaltyUnit}점 (1회당 ${r.penaltyUnit}점). 실수라면 − 버튼으로 횟수를 줄이세요. 0회가 되면 이탈 시간도 0으로 초기화돼요.`) : el('div', { class: 'sub' }, '이탈 기록이 없어요.'),
      logText ? el('pre', { class: 'myans', style: 'white-space:pre-wrap;margin:6px 0' }, logText) : null);
  };
  const setSum = x => { if (sumEl && x && x.total !== '' && x.total != null) sumEl.textContent = `원점수 ${r1(x.raw)} − 감점 ${r1(x.pen || 0)} = 최종 ${r1(x.total)} / ${x.max || x.sessMax}`; };
  holder._setSum = setSum;
  draw(Number(ses['이탈횟수']) || 0, Number(ses['이탈시간(초)']) || 0, log);
  return holder;
}
function closeDetail() { $('#mDetail').classList.add('hidden'); }
$('#mDetail').addEventListener('click', e => { if (e.target.id === 'mDetail') closeDetail(); });

/* ───── 설정 · 키 ───── */
async function loadSettings() {
  const r = await adm('adminSettings');
  if (!r.ok) return;
  ['MINUTES_1', 'MINUTES_2', 'MINUTES_3', 'MAX_CHARS', 'GRACE_SEC', 'LEAVE_PENALTY', 'SHOW_RESULT', 'GEMINI_MODEL'].forEach(k => { $('#s_' + k).value = r.settings[k]; });
  renderKeys(r.keys);
  if (r.version) $('#serverVer').textContent = '서버 버전 ' + r.version;
}
function renderKeys(keys) {
  $('#keyList').replaceChildren(keys.length ? el('div', {}, el('b', {}, `등록된 키 ${keys.length}개`), ...keys.map(k => el('div', {}, `${k.id} — `, el('span', { class: 'chip ' + (k.status === '사용 가능' ? 'ok' : 'warn') }, k.status)))) : el('p', { class: 'sub' }, '등록된 키가 없어요.'));
}
$('#saveSettings').onclick = async () => {
  const s = {}; ['MINUTES_1', 'MINUTES_2', 'MINUTES_3', 'MAX_CHARS', 'GRACE_SEC', 'LEAVE_PENALTY', 'SHOW_RESULT', 'GEMINI_MODEL'].forEach(k => s[k] = $('#s_' + k).value);
  const r = await adm('adminSaveSettings', { settings: s });
  note('#settingsMsg', r.ok ? '저장했어요.' : r.error, r.ok ? 'okm' : 'err');
};
$('#saveKeys').onclick = async () => {
  const keys = $('#keysBox').value.split(/[\s,]+/).filter(k => k.length > 10);
  const r = await adm('adminSaveKeys', { keys });
  if (r.ok) { $('#keysBox').value = ''; renderKeys(r.keys); note('#keyMsg', `키 ${keys.length}개를 저장했어요.`, 'okm'); } else note('#keyMsg', r.error);
};
$('#testKeys').onclick = async () => {
  note('#keyMsg', '테스트 중…', 'info');
  const r = await adm('adminTestKeys', {}, 120000);
  if (r.keys) renderKeys(r.keys);
  note('#keyMsg', r.ok ? '✔ 연결 성공! Gemini가 응답했어요.' : r.error, r.ok ? 'okm' : 'err');
};

/* ───── 내보내기 ───── */
$('#exportBtn').onclick = async () => {
  note('#exportMsg', '만드는 중…', 'info');
  const r = await adm('adminExport', {}, 120000);
  if (!r.ok) return note('#exportMsg', r.error);
  const esc = v => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }; // 엑셀 수식 주입 방지
  const csv = '﻿' + [r.head, ...r.rows].map(row => row.map(esc).join(',')).join('\r\n');
  const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: `이해도점검_전체답안_${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
  note('#exportMsg', `${r.rows.length}개 답안을 내려받았어요.`, 'okm');
};

(function init() { const p = sessionStorage.getItem('apw'); if (p) { PW = p; adm('adminLogin').then(r => { if (r.ok) enter(); else sessionStorage.removeItem('apw'); }); } })();

/* ───── 실시간 감시 ───── */
let monOffset = 0, monLoading = false;
async function loadMonitor() {
  if (monLoading) return; monLoading = true;
  const t0 = Date.now();
  const r = await adm('adminOverview');
  monLoading = false;
  if (!r.ok) return;
  if (lastEditAt >= t0) return; // 불러오는 사이에 교사가 고쳤다면 옛 값으로 덮어쓰지 않음 (다음 갱신에 반영)
  LIST = r.list; monOffset = r.serverNow - Date.now();
  const sel = $('#mClass'), cur = sel.value, cls = [...new Set(LIST.map(s => s.cls))].sort((a, b) => a - b);
  sel.replaceChildren(el('option', { value: '' }, '전체 반'), ...cls.map(c => el('option', { value: c }, c + '반'))); sel.value = cur;
  $('#mUpdated').textContent = '마지막 갱신 ' + new Date().toLocaleTimeString('ko-KR');
  render(); renderMonitor();
}
const LOST_MS = 90000;
function monState(s, now) {
  if (s.status === '미접속') return 'idle';
  if (s.status === '작성 중') return s.awayMs ? 'away' : (s.lastMs && now - s.lastMs > LOST_MS ? 'lost' : 'ok');
  return 'done';
}
const mmss = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
const shortRole = r => r.replace('AI 윤리·소통 담당', 'AI윤리').replace('프로젝트 매니저', 'PM').replace('도메인 분석가', '도메인').replace('데이터 엔지니어', '데이터').replace('모델 개발자', '모델');
function renderMonitor() {
  if (!$('#tab-monitor') || $('#tab-monitor').classList.contains('hidden')) return;
  const now = Date.now() + monOffset, fc = $('#mClass').value, only = $('#mOnly').checked;
  const rank = { away: 0, lost: 1, ok: 2, done: 3, idle: 4 };
  const all = LIST.filter(s => !fc || String(s.cls) === fc).map(s => ({ s, st: monState(s, now) }));
  const cnt = k => all.filter(x => x.st === k).length;
  $('#mStats').replaceChildren(...[['작성 중', cnt('ok') + cnt('away') + cnt('lost')], ['🚨 이탈 중', cnt('away')], ['신호 끊김', cnt('lost')],
    ['이탈 이력 있음', all.filter(x => x.s.leaves > 0).length], ['제출 완료', cnt('done')], ['미접속', cnt('idle')]].map(([k, v]) => el('div', { class: 'stat' }, k, el('b', {}, v))));
  const rows = all.filter(x => !only || x.st === 'away' || x.st === 'lost' || x.s.leaves > 0)
    .sort((a, b) => rank[a.st] - rank[b.st] || (b.s.leaves - a.s.leaves) || String(a.s.sid).localeCompare(String(b.s.sid)));
  $('#mCards').replaceChildren(...rows.map(({ s, st }) => {
    const label = { away: '🚨 이탈 중', lost: '⚠ 신호 끊김', ok: '작성 중', done: s.status, idle: '미접속' }[st];
    const card = el('div', { class: 'mcard ' + st },
      el('div', { class: 'top' }, el('span', { class: 'nm', onclick: () => openDetail(s.sid) }, `${s.cls}반 ${s.team}조 ${s.name}`), el('span', { class: 'chip ' + (st === 'away' ? 'danger' : st === 'lost' ? 'warn' : st === 'ok' ? 'ok' : '') }, label)),
      el('div', { class: 'meta' }, s.sid + ' · ' + s.roles.map(shortRole).join('·')));
    if (st === 'idle') return card;
    if (st === 'done') card.append(el('div', { class: 'meta' }, `제출 ${String(s.submitted || '').slice(11)} · 점수 ${s.total === '' ? '채점 대기' : r1(s.total) + '/' + s.max}`));
    else {
      card.append(el('div', { class: 'top' }, el('span', { class: 'mt', 'data-end': s.endsAt }, mmss(s.endsAt - now)), el('span', { class: 'meta' }, `${s.chars}자 작성`)));
      card.append(el('div', { class: 'meta', 'data-last': s.lastMs || 0, 'data-away': s.awayMs || 0 }, ''));
    }
    const ctl = el('div', { class: 'row', style: 'gap:6px;align-items:center' }, leaveCtl(s.sid, s.leaves || 0, s.leaveSec || 0));
    if (st === 'away') ctl.append(el('button', { class: 'btn small ghost', title: '학생이 실제로는 화면을 보고 있는데 이탈 중으로 남아 있을 때 누르세요', onclick: async () => {
      const x = await adm('adminClearAway', { sid: s.sid });
      if (!x.ok) return toast('해제하지 못했어요: ' + x.error, true);
      s.awayMs = 0; lastEditAt = Date.now(); renderMonitor(); toast('이탈 중 표시를 해제했어요.');
    } }, '이탈 중 해제'));
    card.append(ctl);
    return card;
  }));
  tickMonitor();
}
function tickMonitor() {
  const now = Date.now() + monOffset;
  document.querySelectorAll('#mCards .mt').forEach(n => { n.textContent = mmss(Number(n.dataset.end) - now); });
  document.querySelectorAll('#mCards [data-last]').forEach(n => {
    const a = Number(n.dataset.away), l = Number(n.dataset.last);
    n.textContent = a ? '지금 화면을 벗어난 지 ' + fmtSec((now - a) / 1000) : (l ? '마지막 신호 ' + fmtSec((now - l) / 1000) + ' 전' : '');
  });
}
$('#mClass').onchange = renderMonitor; $('#mOnly').onchange = renderMonitor;

/* ───── 이탈 모니터 화면 열기 (별도 창) ───── */
function openMonitorWindow() {
  const c = $('#fClass').value, st = LIST.find(x => String(x.cls) === c), key = st ? String(st.sid).slice(0, 2) : '';
  window.open('monitor.html' + (key ? '?class=' + key : ''), 'monitorWin', 'width=1280,height=820,resizable=yes,scrollbars=yes');
}
$('#openMonitor').onclick = openMonitorWindow;
$('#popMonitor').onclick = openMonitorWindow;
