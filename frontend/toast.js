/**
 * Meridian Toast & Confirm — design-aligned notification system.
 *
 * Usage:
 *   toast.success('Post published!');
 *   toast.error('Something went wrong');
 *   toast.info('Already subscribed');
 *   const ok = await toast.confirm('Delete this post?');
 */
(function () {
  // ── Container ──────────────────────────────────────────────
  const container = document.createElement('div');
  container.id = 'toast-container';
  container.style.cssText =
    'position:fixed;top:1.5rem;right:1.5rem;z-index:9999;display:flex;flex-direction:column;gap:0.75rem;pointer-events:none;max-width:24rem;width:100%;';
  document.body.appendChild(container);

  // ── Styles (injected once) ─────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .m-toast {
      pointer-events: auto;
      display: flex; align-items: flex-start; gap: 0.625rem;
      padding: 0.875rem 1rem;
      border-radius: 2px;
      font-family: Inter, -apple-system, sans-serif;
      font-size: 0.875rem; line-height: 1.4;
      color: #1A1A1A;
      background: #FAF9F6;
      border: 1.5px solid #1A1A1A;
      box-shadow: 3px 3px 0 #1A1A1A;
      transform: translateX(110%);
      transition: transform .3s cubic-bezier(.22,1,.36,1), opacity .25s ease;
      opacity: 0;
    }
    .m-toast.show { transform: translateX(0); opacity: 1; }
    .m-toast.hide { transform: translateX(110%); opacity: 0; }
    .m-toast-icon { flex-shrink: 0; width: 1.125rem; height: 1.125rem; margin-top: 1px; }
    .m-toast-body { flex: 1; word-break: break-word; }
    .m-toast-close {
      flex-shrink: 0; background: none; border: none; cursor: pointer;
      color: #6B6B6B; font-size: 1rem; line-height: 1; padding: 0; margin-top: -2px;
    }
    .m-toast-close:hover { color: #1A1A1A; }
    .m-toast.success { border-color: #2D5016; }
    .m-toast.success .m-toast-icon { color: #2D5016; }
    .m-toast.error { border-color: #C41E3A; }
    .m-toast.error .m-toast-icon { color: #C41E3A; }
    .m-toast.info { border-color: #B8860B; }
    .m-toast.info .m-toast-icon { color: #B8860B; }

    /* Confirm overlay */
    .m-confirm-overlay {
      position: fixed; inset: 0; z-index: 10000;
      background: rgba(26,26,26,.45);
      display: flex; align-items: center; justify-content: center;
      font-family: Inter, -apple-system, sans-serif;
    }
    .m-confirm-box {
      background: #FAF9F6; border: 1.5px solid #1A1A1A;
      box-shadow: 4px 4px 0 #1A1A1A; border-radius: 2px;
      padding: 1.75rem 2rem; max-width: 26rem; width: 90%;
    }
    .m-confirm-msg {
      font-size: 0.9375rem; color: #1A1A1A; margin-bottom: 1.5rem; line-height: 1.5;
    }
    .m-confirm-actions { display: flex; justify-content: flex-end; gap: 0.75rem; }
    .m-confirm-btn {
      padding: 0.5rem 1.25rem; font-size: 0.8125rem; font-weight: 500;
      border-radius: 2px; cursor: pointer; border: 1.5px solid #1A1A1A;
      transition: background .15s, color .15s;
    }
    .m-confirm-cancel { background: #FAF9F6; color: #1A1A1A; }
    .m-confirm-cancel:hover { background: #F2F0EB; }
    .m-confirm-ok { background: #1A1A1A; color: #FAF9F6; }
    .m-confirm-ok:hover { background: #333; }
    .m-confirm-ok.destructive { background: #C41E3A; border-color: #C41E3A; }
    .m-confirm-ok.destructive:hover { background: #a3182f; border-color: #a3182f; }
  `;
  document.head.appendChild(style);

  // ── SVG icons ──────────────────────────────────────────────
  const icons = {
    success:
      '<svg class="m-toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>',
    error:
      '<svg class="m-toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/></svg>',
    info:
      '<svg class="m-toast-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>',
  };

  // ── Show toast ─────────────────────────────────────────────
  function show(message, type = 'info', duration = 4000) {
    const el = document.createElement('div');
    el.className = 'm-toast ' + type;
    el.innerHTML = (icons[type] || '') +
      '<span class="m-toast-body">' + escapeHtml(message) + '</span>' +
      '<button class="m-toast-close" aria-label="Close">&times;</button>';
    container.appendChild(el);

    el.querySelector('.m-toast-close').onclick = () => dismiss(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));

    if (duration > 0) {
      setTimeout(() => dismiss(el), duration);
    }
  }

  function dismiss(el) {
    if (el._dismissed) return;
    el._dismissed = true;
    el.classList.remove('show');
    el.classList.add('hide');
    setTimeout(() => el.remove(), 300);
  }

  // ── Confirm dialog ─────────────────────────────────────────
  function confirm(message, opts = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'm-confirm-overlay';
      const destructive = opts.destructive !== false;
      overlay.innerHTML = '<div class="m-confirm-box">' +
        '  <div class="m-confirm-msg">' + escapeHtml(message) + '</div>' +
        '  <div class="m-confirm-actions">' +
        '    <button class="m-confirm-btn m-confirm-cancel">' + (opts.cancelText || 'Cancel') +
        '</button>' +
        '    <button class="m-confirm-btn m-confirm-ok' + (destructive ? ' destructive' : '') +
        '">' + (opts.okText || 'Confirm') + '</button>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(overlay);

      const close = (val) => {
        overlay.remove();
        resolve(val);
      };
      overlay.querySelector('.m-confirm-cancel').onclick = () => close(false);
      overlay.querySelector('.m-confirm-ok').onclick = () => close(true);
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close(false);
      });
      overlay.querySelector('.m-confirm-ok').focus();
    });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ── Public API ─────────────────────────────────────────────
  window.toast = {
    success: (msg, dur) => show(msg, 'success', dur),
    error: (msg, dur) => show(msg, 'error', dur ?? 6000),
    info: (msg, dur) => show(msg, 'info', dur),
    confirm,
  };
})();
