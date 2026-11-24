// 서버(Apps Script) 호출 · text/plain 으로 보내면 CORS 사전요청 없이 동작합니다.
// 서버가 "잠금 시간 초과"처럼 일시적으로 바쁠 때는 잠깐 쉬었다가 자동으로 다시 시도합니다.
const BUSY_RE = /잠금|[Ll]ock|too many|동시|일시적|busy/;
async function api(action, payload, timeoutMs) {
  let r = null;
  for (let i = 0; i < 5; i++) {
    r = await apiOnce(action, payload, timeoutMs);
    if (r && r.ok === false && !r.network && typeof r.error === 'string' && BUSY_RE.test(r.error) && i < 4) {
      await new Promise(res => setTimeout(res, 1500 * (i + 1) + Math.random() * 2500)); continue;
    }
    break;
  }
  if (r && r.ok === false && !r.network && typeof r.error === 'string' && BUSY_RE.test(r.error)) {
    r.error = '지금 접속자가 많아 서버가 바빠요. 잠시 뒤 다시 시도해 주세요. (내용은 이 컴퓨터에 보관 중)'; r.network = true;
  }
  return r;
}
async function apiOnce(action, payload, timeoutMs) {
  if (!CONFIG.API_URL || CONFIG.API_URL.indexOf('여기에') >= 0) {
    return { ok: false, error: 'js/config.js 에 서버 주소(API_URL)가 아직 설정되지 않았어요.' };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 90000);
  try {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action }, payload || {})), signal: ctrl.signal
    });
    return await res.json();
  } catch (e) {
    return { ok: false, network: true, error: '인터넷 연결을 확인해 주세요. (' + (e.name === 'AbortError' ? '시간 초과' : '연결 실패') + ')' };
  } finally { clearTimeout(timer); }
}

function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const k in (attrs || {})) {
    if (k === 'class') n.className = attrs[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
  }
  kids.flat().forEach(c => { if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c)); });
  return n;
}
const $ = s => document.querySelector(s);
