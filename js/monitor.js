/* 이탈 현황 모니터 (교사용 별도 창) */
(function () {
  let PW = '', ROWS = [], skew = 0, lastEdit = 0, loading = false;
  let CLS = new URLSearchParams(location.search).get('class') || '';
  const LOST_MS = 90000;
  const pad = n => String(n).padStart(2, '0');
  const clock = sec => { sec = Math.max(0, Math.round(sec)); return pad(Math.floor(sec / 60)) + ':' + pad(sec % 60); };
  const clsLabel = k => k.charAt(0) + '학년 ' + k.slice(1) + '반';   // 학번 1701 → "1학년 7반" (키 = '17')
  const clsOf = sid => String(sid).slice(0, 2);

  function toast(text) { const t = el('div', { class: 'toast' }, text); document.body.append(t); setTimeout(() => t.remove(), 6000); }

  async function start(pw) {
    const r = await api('adminMonitor', { pw });
    if (!r.ok) throw new Error(r.error || '열 수 없어요.');
    PW = pw; try { sessionStorage.setItem('apw', pw); } catch (e) { }
    $('#gate').classList.add('hidden'); $('#mon').classList.remove('hidden');
    apply(r);
    setInterval(poll, 4000); setInterval(tick, 1000);
  }
  async function poll() {
    if (loading) return; loading = true;
    const t0 = Date.now();
    const r = await api('adminMonitor', { pw: PW });
    loading = false;
    if (!r.ok) { $('#upd').textContent = '⚠ 갱신 실패: ' + (r.error || ''); return; }
    if (lastEdit >= t0) return; // 불러오는 사이에 고쳤다면 옛 값으로 덮어쓰지 않음
    apply(r);
  }
  function apply(r) { ROWS = r.rows; skew = r.serverNow - Date.now(); $('#upd').textContent = '갱신 ' + new Date().toLocaleTimeString('ko-KR'); fillSelect(); draw(); }

  function fillSelect() {
    const keys = [...new Set(ROWS.map(s => clsOf(s.sid)))].sort();
    const sel = $('#cls');
    if (!CLS || (keys.length && keys.indexOf(CLS) < 0)) {
      const busy = keys.find(k => ROWS.some(s => clsOf(s.sid) === k && s.status === '작성 중'));
      CLS = busy || keys[0] || '';
    }
    sel.replaceChildren(...keys.map(k => el('option', { value: k }, clsLabel(k))));
    sel.value = CLS;
  }
  $('#cls').onchange = function () { CLS = this.value; draw(); };

  function stateOf(s, now) {
    if (s.status !== '작성 중') return 'fin';
    if (s.awayMs) return 'away';
    return s.lastMs && now - s.lastMs > LOST_MS ? 'lost' : 'ok';
  }

  function draw() {
    if (!CLS) { $('#grid').replaceChildren(el('div', { class: 'empty' }, '아직 입장한 학생이 없습니다.')); return; }
    const now = Date.now() + skew;
    $('#title').textContent = clsLabel(CLS) + ' 페이지 이탈 현황'; document.title = clsLabel(CLS) + ' 이탈 현황';
    const rows = ROWS.filter(s => clsOf(s.sid) === CLS).sort((a, b) => (a.sid < b.sid ? -1 : 1));
    const n = k => rows.filter(s => stateOf(s, now) === k).length;
    $('#pills').replaceChildren(
      el('span', { class: 'pill' }, '입장', el('b', {}, rows.length)),
      el('span', { class: 'pill' }, '작성 중', el('b', {}, n('ok') + n('away') + n('lost'))),
      el('span', { class: 'pill' + (n('away') ? ' bad' : '') }, '지금 이탈 중', el('b', {}, n('away'))),
      el('span', { class: 'pill' }, '이탈 기록 있음', el('b', {}, rows.filter(s => s.leaves > 0).length)),
      el('span', { class: 'pill' }, '제출', el('b', {}, n('fin'))));
    if (!rows.length) { $('#grid').replaceChildren(el('div', { class: 'empty' }, '아직 입장한 학생이 없습니다.')); return; }
    $('#grid').replaceChildren(...rows.map(s => {
      const st = stateOf(s, now), lv = s.leaves >= 3 ? 'l2' : s.leaves >= 1 ? 'l1' : '';
      const card = el('div', { class: `card ${lv} ${st}` },
        el('div', { class: 'sid' }, s.sid),
        el('div', { class: 'cnt' }, s.leaves, el('small', {}, '회')),
        el('div', { class: 'tm', 'data-sec': s.leaveSec, 'data-away': s.awayMs || 0 }, clock(s.leaveSec)),
        el('span', { class: 'tag' }, { away: '⚠ 지금 이탈 중', lost: '신호 끊김', fin: s.status === '시간종료' ? '시간 종료' : '제출 완료', ok: '' }[st]));
      const fix = el('div', { class: 'fix' });
      if (s.leaves > 0) fix.append(el('button', { class: 'minus', title: '실수로 기록된 이탈 1회 줄이기', onclick: () => minus(s) }, '−'));
      if (st === 'away') fix.append(el('button', { class: 'clr', title: '학생이 실제로는 화면을 보고 있는데 이탈 중으로 남아 있을 때', onclick: () => clearAway(s) }, '이탈 중 해제'));
      if (fix.childNodes.length) card.append(fix);
      return card;
    }));
    tick();
  }
  function tick() {
    const now = Date.now() + skew;
    document.querySelectorAll('.tm').forEach(t => {
      const a = Number(t.dataset.away), base = Number(t.dataset.sec);
      t.textContent = clock(base + (a ? (now - a) / 1000 : 0));
    });
  }

  // 화면에 먼저 반영하고 서버에 저장. 실패하면 되돌리고 이유를 알려 줌
  async function minus(s) {
    if (s.leaves <= 0) return;
    const prev = { leaves: s.leaves, leaveSec: s.leaveSec };
    s.leaves -= 1; if (s.leaves === 0) s.leaveSec = 0;
    lastEdit = Date.now(); draw();
    const r = await api('adminSetLeaves', { pw: PW, sid: s.sid, count: s.leaves });
    lastEdit = Date.now();
    if (!r.ok) { Object.assign(s, prev); draw(); toast('저장하지 못했어요: ' + (r.error || '서버 응답 없음')); }
  }
  async function clearAway(s) {
    const prev = s.awayMs; s.awayMs = 0; lastEdit = Date.now(); draw();
    const r = await api('adminClearAway', { pw: PW, sid: s.sid });
    lastEdit = Date.now();
    if (!r.ok) { s.awayMs = prev; draw(); toast('해제하지 못했어요: ' + (r.error || '서버 응답 없음')); }
  }

  $('#pwBtn').onclick = () => { $('#pwErr').textContent = ''; start($('#pw').value).catch(e => { $('#pwErr').textContent = e.message; }); };
  $('#pw').addEventListener('keydown', e => { if (e.key === 'Enter') $('#pwBtn').click(); });
  let saved = ''; try { saved = sessionStorage.getItem('apw') || ''; } catch (e) { }
  if (saved) start(saved).catch(() => $('#gate').classList.remove('hidden')); else $('#gate').classList.remove('hidden');
})();
