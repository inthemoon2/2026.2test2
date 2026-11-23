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
function enter() { $('#loginView').classList.add('hidden'); $('#mainView').classList.remove('hidden'); loadStatus(); loadSettings(); pollTimer = setInterval(() => { if (!$('#tab-status').classList.contains('hidden')) loadStatus(true); }, 30000); }

document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  ['status', 'settings', 'export'].forEach(t => $('#tab-' + t).classList.toggle('hidden', t !== b.dataset.tab));
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
    el('td', { style: 'white-space:nowrap' }, el('button', { class: 'btn small ghost', onclick: () => openDetail(s.sid) }, '상세')))));
}
['fClass', 'fStatus', 'fGrade'].forEach(i => $('#' + i).onchange = render);
$('#fSearch').oninput = render; $('#reload').onclick = () => loadStatus();
$('#gradePending').onclick = async () => {
  note('#statusMsg', '채점 중… (학생 수에 따라 몇 분 걸릴 수 있어요)', 'info');
  const r = await adm('adminGradePending', {}, 300000);
  note('#statusMsg', r.ok ? `${r.n}명 채점했어요.` : r.error, r.ok ? 'okm' : 'err'); loadStatus(true);
};

/* ───── 상세 ───── */
async function openDetail(sid) {
  if (!sid) return;
  const body = $('#detailBody'); body.replaceChildren(el('p', {}, '불러오는 중…')); $('#mDetail').classList.remove('hidden');
  const r = await adm('adminDetail', { sid });
  if (!r.ok) { body.replaceChildren(el('div', { class: 'msg err' }, r.error), el('button', { class: 'btn gray', onclick: closeDetail }, '닫기')); return; }
  const ses = r.session;
  body.replaceChildren(
    el('h2', {}, `${r.cls}반 ${r.team}조 · ${r.name} (${r.sid})`),
    el('p', { class: 'sub' }, r.roles.join(', ') + (ses ? ` · 시작 ${ses['시작시각']} · 제출 ${ses['제출시각'] || '-'} · ${ses['상태']}` : ' · 아직 시작 전')),
    ...r.items.map(it => el('div', { class: 'card' },
      el('div', { class: 'row', style: 'justify-content:space-between' }, el('b', {}, `[${it.role}] ${it.title}`), el('span', { class: 'chip' }, it.score == null ? '미채점' : `${r1(it.score)} / ${it.max}`)),
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
function closeDetail() { $('#mDetail').classList.add('hidden'); }
$('#mDetail').addEventListener('click', e => { if (e.target.id === 'mDetail') closeDetail(); });

/* ───── 설정 · 키 ───── */
async function loadSettings() {
  const r = await adm('adminSettings');
  if (!r.ok) return;
  ['MINUTES_1', 'MINUTES_2', 'MINUTES_3', 'MAX_CHARS', 'GRACE_SEC', 'SHOW_RESULT', 'GEMINI_MODEL'].forEach(k => { $('#s_' + k).value = r.settings[k]; });
  renderKeys(r.keys);
}
function renderKeys(keys) {
  $('#keyList').replaceChildren(keys.length ? el('div', {}, el('b', {}, `등록된 키 ${keys.length}개`), ...keys.map(k => el('div', {}, `${k.id} — `, el('span', { class: 'chip ' + (k.status === '사용 가능' ? 'ok' : 'warn') }, k.status)))) : el('p', { class: 'sub' }, '등록된 키가 없어요.'));
}
$('#saveSettings').onclick = async () => {
  const s = {}; ['MINUTES_1', 'MINUTES_2', 'MINUTES_3', 'MAX_CHARS', 'GRACE_SEC', 'SHOW_RESULT', 'GEMINI_MODEL'].forEach(k => s[k] = $('#s_' + k).value);
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
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv = '﻿' + [r.head, ...r.rows].map(row => row.map(esc).join(',')).join('\r\n');
  const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: `이해도점검_전체답안_${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
  note('#exportMsg', `${r.rows.length}개 답안을 내려받았어요.`, 'okm');
};

(function init() { const p = sessionStorage.getItem('apw'); if (p) { PW = p; adm('adminLogin').then(r => { if (r.ok) enter(); else sessionStorage.removeItem('apw'); }); } })();
