import { useState } from 'react';
import './thirdPartyNotices.css';
export default function ThirdPartyNoticesPanel() {
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  async function load() {
    if (state === 'loading') return;
    setState('loading');
    try {
      const url = new URL('/third-party-notices.txt', location.origin).href;
      const response = await fetch(url, { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (response.status !== 200 || response.url !== url || !response.body || !/^text\/plain(?:;|$)/i.test(response.headers.get('Content-Type') ?? '')) throw Error('notice response');
      const reader = response.body.getReader(); const data = new Uint8Array(65536); let size = 0, done = false;
      try { while (true) { const part = await reader.read(); if (part.done) { done = true; break; }
        if (size + part.value.length > data.length) throw Error('notice size'); data.set(part.value, size); size += part.value.length; }
      } finally { if (!done) await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(0, size));
      if (!decoded.startsWith('BODYFORGE / THIRD-PARTY NOTICES\n')) throw Error('notice format');
      setText(decoded); setState('ready');
    } catch { setText(''); setState('error'); }
  }
  return <details className="bf-faq-item" data-help-topic="third-party-notices" data-notice-state={state}>
    <summary>Лицензии и авторы</summary>
    <p>Уведомления о сторонних библиотеках, модели и шрифтах.</p>
    <button type="button" className="bf-small-action" data-action="load-third-party-notices" disabled={state === 'loading'} onClick={() => void load()}>Открыть тексты лицензий</button>
    {state === 'loading' && <p role="status">Загрузка…</p>}
    {state === 'error' && <p role="status">Не удалось прочитать файл. Попробуй позже.</p>}
    {state === 'ready' && <pre className="bf-third-party-notices" tabIndex={0} aria-label="Third-party license texts">{text}</pre>}
  </details>;
}
