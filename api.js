// 서버(Apps Script) 호출 · text/plain 으로 보내면 CORS 사전요청 없이 동작합니다.
async function api(action, payload, timeoutMs) {
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
