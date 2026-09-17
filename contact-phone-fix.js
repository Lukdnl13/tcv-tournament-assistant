(() => {
  const PLAYERS_KEY = 'tcv_players_v1';
  const VERIFY_STATUS_KEY = 'tcv_verify_status_v1';
  const PENDING_KEY = 'tcv_pending_shortcut_v3';
  const OPEN_DELAY_MS = 60;
  const STALE_PENDING_MS = 180000;
  let launching = false;
  let watchdog = null;

  function normalizePhone(raw = '') {
    let s = String(raw).trim().replace(/[^\d+]/g, '');
    if (!s) return '';
    if (s.startsWith('0033')) s = '+33' + s.slice(4);
    if (/^33\d+$/.test(s)) s = '+' + s;
    if (/^[67]\d{8}$/.test(s)) s = '+33' + s;
    if (/^0[67]\d{8}$/.test(s)) s = '+33' + s.slice(1);
    if (/^0\d{9}$/.test(s)) s = '+33' + s.slice(1);
    return s;
  }

  function lookupPhone(raw = '') {
    const canonical = normalizePhone(raw);
    if (/^\+33\d{9}$/.test(canonical)) return '0' + canonical.slice(3);
    return canonical;
  }

  function readPending() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); }
    catch { return null; }
  }

  function setStatus(type, title, message) {
    const status = { type, title, message };
    if (window.TCV?.state) window.TCV.state.verifyStatus = status;
    localStorage.setItem(VERIFY_STATUS_KEY, JSON.stringify(status));
  }

  function migrateStoredPhones() {
    if (!window.TCV?.state?.players) return false;
    let changed = false;
    window.TCV.state.players.forEach(player => {
      const normalized = normalizePhone(player.phone);
      if (normalized && normalized !== player.phone) {
        player.phone = normalized;
        changed = true;
      }
    });
    if (changed) localStorage.setItem(PLAYERS_KEY, JSON.stringify(window.TCV.state.players));
    return changed;
  }

  // Version bulk rapide : une simple ligne par numéro.
  // Plus de JSON à décoder dans Raccourcis et plus de recherches Contacts joueur par joueur côté web.
  function buildVerifyPhones(players) {
    const seen = new Set();
    const lines = [];
    players.forEach(player => {
      const local = lookupPhone(player.phone);
      if (!local || seen.has(local)) return;
      seen.add(local);
      lines.push(local);
    });
    return lines;
  }

  function getCallbackTarget() {
    return /CriOS/i.test(navigator.userAgent) ? 'chrome' : 'web';
  }

  function callbackUrl(tag) {
    const base = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}callback.html`;
    const params = new URLSearchParams({ tag, target: getCallbackTarget() });
    return `${base}?${params.toString()}`;
  }

  function setVerifyButtonsBusy(busy) {
    document.querySelectorAll('[data-action="verifyContacts"]').forEach(button => {
      if (busy) {
        if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
        button.disabled = true;
        if (button.textContent !== '⏳ Vérification…') button.textContent = '⏳ Vérification…';
      } else {
        button.disabled = false;
        if (button.dataset.originalLabel && button.textContent !== button.dataset.originalLabel) button.textContent = button.dataset.originalLabel;
      }
    });
  }

  function showOverlay(count) {
    const overlay = document.getElementById('shortcutOverlay');
    const title = document.getElementById('overlayTitle');
    const text = document.getElementById('overlayText');
    const close = document.getElementById('overlayCloseBtn');
    if (title) title.textContent = 'Vérification Contacts…';
    if (text) text.textContent = `${count} numéro${count > 1 ? 's' : ''} envoyé${count > 1 ? 's' : ''} au raccourci rapide.`;
    if (close) close.classList.add('hidden');
    if (overlay) overlay.classList.remove('hidden');

    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      if (text) text.textContent = 'Le retour automatique tarde. Tu peux fermer cette fenêtre puis réessayer.';
      if (close) close.classList.remove('hidden');
    }, 15000);
  }

  function hideOverlay() {
    clearTimeout(watchdog);
    document.getElementById('shortcutOverlay')?.classList.add('hidden');
    setVerifyButtonsBusy(false);
    launching = false;
  }

  function clearStalePending() {
    const pending = readPending();
    if (!pending || pending.tag !== 'contacts') return;
    if (Date.now() - Number(pending.at || 0) < STALE_PENDING_MS) return;
    localStorage.removeItem(PENDING_KEY);
    hideOverlay();
    setStatus('warn', 'Vérification Contacts', 'La vérification précédente n’a pas renvoyé de résultat. Rien n’a été modifié.');
  }

  function recoverWhenReturning() {
    if (document.visibilityState !== 'visible') return;
    const params = new URLSearchParams(location.search);
    if (params.get('shortcut') === 'contacts') return;

    const pending = readPending();
    if (!pending || pending.tag !== 'contacts') {
      hideOverlay();
      return;
    }

    if (Date.now() - Number(pending.at || 0) > STALE_PENDING_MS) {
      localStorage.removeItem(PENDING_KEY);
      hideOverlay();
      setStatus('warn', 'Vérification Contacts', 'Retour détecté sans résultat après plusieurs minutes. Tu peux relancer la vérification.');
      if (window.TCV?.state?.route === 'players') window.TCV.route('players');
    }
  }

  function launchVerification() {
    if (launching) return;
    const tcv = window.TCV;
    const players = Array.isArray(tcv?.state?.players) ? tcv.state.players.filter(p => p.phone) : [];
    if (!players.length) return;

    launching = true;
    migrateStoredPhones();
    setVerifyButtonsBusy(true);

    const phones = buildVerifyPhones(players);
    const count = phones.length;
    if (!count) {
      launching = false;
      setVerifyButtonsBusy(false);
      return;
    }

    const inputText = phones.join('\n');
    setStatus('info', 'Vérification Contacts', `Vérification rapide de ${count} numéro${count > 1 ? 's' : ''}…`);
    localStorage.setItem(PENDING_KEY, JSON.stringify({ tag: 'contacts', at: Date.now(), count, phones }));
    showOverlay(count);

    const shortcutName = tcv.state.settings?.verifyShortcut || 'TCV - Vérifier contacts';
    const success = callbackUrl('contacts');
    const cancel = callbackUrl('contacts-cancel');
    const error = callbackUrl('contacts-error');
    const url = `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(shortcutName)}&input=text&text=${encodeURIComponent(inputText)}&x-success=${encodeURIComponent(success)}&x-cancel=${encodeURIComponent(cancel)}&x-error=${encodeURIComponent(error)}`;

    setTimeout(() => { location.href = url; }, OPEN_DELAY_MS);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-action="verifyContacts"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    launchVerification();
  }, true);

  document.getElementById('overlayCloseBtn')?.addEventListener('click', () => {
    const pending = readPending();
    if (pending?.tag === 'contacts') localStorage.removeItem(PENDING_KEY);
    hideOverlay();
  }, true);

  window.addEventListener('pageshow', () => setTimeout(recoverWhenReturning, 100));
  window.addEventListener('focus', () => setTimeout(recoverWhenReturning, 100));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(recoverWhenReturning, 100);
  });

  const changed = migrateStoredPhones();
  clearStalePending();
  if (changed && window.TCV?.route && window.TCV?.state?.route) window.TCV.route(window.TCV.state.route);
})();