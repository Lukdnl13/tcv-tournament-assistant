(() => {
  const PLAYERS_KEY = 'tcv_players_v1';
  const VERIFY_STATUS_KEY = 'tcv_verify_status_v1';
  const PENDING_KEY = 'tcv_pending_shortcut_v3';
  const OPEN_DELAY_MS = 80;
  const STALE_PENDING_MS = 12000;
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
    if (/^\+33[67]\d{8}$/.test(canonical)) return '0' + canonical.slice(3);
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

  // Payload volontairement minimal : le raccourci n'a besoin que de l'id et du téléphone.
  // Cela réduit le texte envoyé à Raccourcis et accélère le décodage JSON.
  function buildVerifyPayload(players) {
    const payload = {};
    const seen = new Set();
    let index = 1;
    players.forEach(player => {
      const canonical = normalizePhone(player.phone);
      if (!canonical || seen.has(`${player.id}|${canonical}`)) return;
      seen.add(`${player.id}|${canonical}`);
      payload[String(index++)] = {
        id: player.id,
        phone: lookupPhone(canonical)
      };
    });
    return payload;
  }

  function setVerifyButtonsBusy(busy) {
    document.querySelectorAll('[data-action="verifyContacts"]').forEach(button => {
      if (busy) {
        if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
        button.disabled = true;
        button.textContent = '⏳ Ouverture…';
      } else {
        button.disabled = false;
        if (button.dataset.originalLabel) button.textContent = button.dataset.originalLabel;
      }
    });
  }

  function showOverlay(count) {
    const overlay = document.getElementById('shortcutOverlay');
    const title = document.getElementById('overlayTitle');
    const text = document.getElementById('overlayText');
    const close = document.getElementById('overlayCloseBtn');
    if (title) title.textContent = 'Vérification Contacts…';
    if (text) text.textContent = `${count} joueur${count > 1 ? 's' : ''} transmis à Raccourcis. Ouverture en cours…`;
    if (close) close.classList.add('hidden');
    if (overlay) overlay.classList.remove('hidden');

    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      if (text) text.textContent = 'Raccourcis met plus de temps que prévu. Tu peux fermer cette fenêtre et réessayer : l’application ne restera plus bloquée.';
      if (close) close.classList.remove('hidden');
    }, 2500);
  }

  function hideOverlay() {
    clearTimeout(watchdog);
    const overlay = document.getElementById('shortcutOverlay');
    if (overlay) overlay.classList.add('hidden');
    setVerifyButtonsBusy(false);
    launching = false;
  }

  function clearStalePending() {
    const pending = readPending();
    if (!pending || pending.tag !== 'contacts') return;
    if (Date.now() - Number(pending.at || 0) < STALE_PENDING_MS) return;
    localStorage.removeItem(PENDING_KEY);
    hideOverlay();
    setStatus('warn', 'Vérification Contacts', 'La vérification précédente n’a pas renvoyé de résultat. Rien n’a été modifié : tu peux simplement relancer le bouton.');
  }

  function recoverWhenReturning() {
    if (document.visibilityState !== 'visible') return;
    const params = new URLSearchParams(location.search);
    if (params.get('shortcut') === 'contacts') return; // app.js traite le vrai callback.

    const pending = readPending();
    if (!pending || pending.tag !== 'contacts') {
      hideOverlay();
      return;
    }

    // Si on revient manuellement depuis Raccourcis sans callback, on ne laisse pas tourner le spinner.
    if (Date.now() - Number(pending.at || 0) > 1200) {
      setTimeout(() => {
        const nowPending = readPending();
        const nowParams = new URLSearchParams(location.search);
        if (nowParams.get('shortcut') === 'contacts') return;
        if (nowPending?.tag === 'contacts') {
          localStorage.removeItem(PENDING_KEY);
          hideOverlay();
          setStatus('warn', 'Vérification Contacts', 'Retour détecté sans résultat. Le raccourci a peut-être été interrompu ; relance la vérification si les statuts n’ont pas changé.');
          if (window.TCV?.state?.route === 'players') window.TCV.route('players');
        }
      }, 350);
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
    setStatus('info', 'Vérification Contacts', `Vérification de ${players.length} joueur${players.length > 1 ? 's' : ''}…`);

    const payload = buildVerifyPayload(players);
    const count = Object.keys(payload).length;
    localStorage.setItem(PENDING_KEY, JSON.stringify({ tag: 'contacts', at: Date.now(), count }));
    showOverlay(count);

    const shortcutName = tcv.state.settings?.verifyShortcut || 'TCV - Vérifier contacts';
    const success = `${location.origin}${location.pathname}?shortcut=${encodeURIComponent('contacts')}`;
    const cancel = `${location.origin}${location.pathname}?shortcut=${encodeURIComponent('contacts-cancel')}`;
    const url = `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(shortcutName)}&input=text&text=${encodeURIComponent(JSON.stringify(payload))}&x-success=${encodeURIComponent(success)}&x-cancel=${encodeURIComponent(cancel)}`;

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

  // Le bouton Fermer de l'overlay doit réellement débloquer l'interface.
  document.getElementById('overlayCloseBtn')?.addEventListener('click', () => {
    const pending = readPending();
    if (pending?.tag === 'contacts') localStorage.removeItem(PENDING_KEY);
    hideOverlay();
  }, true);

  window.addEventListener('pageshow', () => setTimeout(recoverWhenReturning, 120));
  window.addEventListener('focus', () => setTimeout(recoverWhenReturning, 120));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(recoverWhenReturning, 120);
  });

  const changed = migrateStoredPhones();
  clearStalePending();
  if (changed && window.TCV?.route && window.TCV?.state?.route) window.TCV.route(window.TCV.state.route);
})();