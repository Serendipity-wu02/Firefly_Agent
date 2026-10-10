import type { BrowserDomInput } from "../../shared/manual-browser";
/** Fixed source in an isolated world. Only JSON data crosses this boundary;
 * callers cannot supply JavaScript, selectors, evaluation expressions or a CDP command.
 */
const operation = String.raw`(input => {
  const denied = () => ({ok:false});
  if (location.href !== input.url || location.protocol !== 'https:') return denied();
  const sensitive = /password|passwd|secret|token|credit|card.?number|security.?code|one.?time|otp|social.?security/i;
  const account = /(?:^|\/)(?:login|log-in|signin|sign-in|signup|sign-up|logout|session|sessions|oauth|authorize|settings)(?:\/|$)/i;
  const safeUrl = value => {
    try { const u = new URL(value, location.href); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && !account.test(decodeURIComponent(u.pathname)) && (!input.hosts || input.hosts.includes(u.hostname)); }
    catch { return false; }
  };
  const visible = el => {
    if (!el.isConnected || el.closest('[hidden],[inert]')) return false;
    for (let node = el; node; node = node.parentElement) { const style = getComputedStyle(node); if (style.display === 'none' || style.visibility === 'hidden') return false; }
    return true;
  };
  const textInput = el => (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && ['text','search','url'].includes(el.type)))
    && !el.disabled && !el.readOnly && !sensitive.test([el.name,el.id,el.autocomplete,el.getAttribute('aria-label'),el.getAttribute('placeholder')].join(' '))
    && !el.closest('form')?.querySelector('input[type=password],input[autocomplete=one-time-code],input[type=file]');
  const clickable = el => {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[download]') || /sign[ -]?in|log[ -]?in|sign[ -]?up|log[ -]?out|登录|登陆|注册|密码/i.test(el.getAttribute('aria-label') || el.innerText || el.textContent || '')) return false;
    const a = el.closest('a[href]');
    if (a) return safeUrl(a.href) && !a.download && (!a.target || a.target === '_self');
    if (el.tagName === 'BUTTON' && el.type === 'submit' && el.form) return false;
    if (el.tagName === 'INPUT') return false;
    return ['BUTTON','SUMMARY'].includes(el.tagName) || el.getAttribute('role') === 'button';
  };
  if (input.kind === 'observe') {
    const refs = new Map(), elements = [];
    for (const el of document.querySelectorAll('a[href],button,input,textarea,summary,[role=button]')) {
      if (elements.length >= 160) break;
      if (!visible(el) || !(textInput(el) || clickable(el))) continue;
      const ref = String(elements.length + 1); refs.set(ref, el);
      const name = (el.getAttribute('aria-label') || el.innerText || el.textContent || el.getAttribute('placeholder') || el.name || '').trim().slice(0,200);
      elements.push({ref,tag:el.tagName.toLowerCase(),role:el.getAttribute('role') || (textInput(el)?'textbox':el.tagName==='A'?'link':'button'),name,
        ...(textInput(el)?{value:el.value.slice(0,1000)}:{}), ...(el.tagName==='A'?{href:el.href.slice(0,2048)}:{})});
    }
    globalThis.__fireflyBrowserDom = {snapshotId:input.snapshotId,document,refs};
    const body = document.body;
    let text = body?.innerText;
    if (text === undefined && body) { const copy = body.cloneNode(true); for(const hidden of copy.querySelectorAll('script,style,noscript,template,[hidden]')) hidden.remove(); text=copy.textContent; }
    return {snapshotId:input.snapshotId,url:location.href,title:document.title.slice(0,500),text:(text || '').slice(0,20000),elements};
  }
  const state = globalThis.__fireflyBrowserDom;
  if (!state || state.document !== document || state.snapshotId !== input.snapshotId) return denied();
  const el = state.refs.get(input.ref);
  if (!el || !visible(el)) return denied();
  if (input.kind === 'click' && clickable(el)) { el.click(); return {ok:true}; }
  if (input.kind === 'type' && textInput(el) && typeof input.text === 'string' && input.text.length <= 4000) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto,'value').set.call(el,input.text);
    el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return {ok:true};
  }
  return denied();
})`;
export function browserDomScript(input: BrowserDomInput): string { return `${operation}(${JSON.stringify(input)})`; }
