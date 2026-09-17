(() => {
  const PENDING_KEY = 'tcv_pending_shortcut_v3';
  const STALE_PENDING_MS = 15000;
  let launching = false;
  let watchdog = null;

  function normalizePhone(raw = '') {
    let s = String(raw).trim().replace(/[^\d+]/g, '');
    if (!s) return '';
    if (s.startsWith('0033')) s = '+33' + s.slice(4);
    if (/^33\d+$/.test(s)) s = '+' + s;
    if (/^[67]\d{8}$/.test(s)) s = '+33' + s;
    if (/^0\d{9}$/.test(s)) s = '+33' + s.slice(1);
    return s;
  }

  function localPhone(raw = '') {
    const canonical = normalizePhone(raw);
    if (/^\+33\d{9}$/.test(canonical)) return '0' + canonical.slice(3);
    return canonical;
  }

  function readPending() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); }
    catch { return null; }
  }

  function getAllMissing() {
    const players = window.TCV?.state?.players || [];
    return players.filter(player => player.contactStatus === 'missing' && player.phone);
  }

  function getMissingForCurrentContext() {
    const tcv = window.TCV;
    const players = tcv?.state?.players || [];
    const selection = tcv?.state?.campaignSelection;
    if (selection && selection.size) {
      const selectedMissing = players.filter(player => selection.has(player.id) && player.contactStatus === 'missing' && player.phone);
      if (selectedMissing.length) return selectedMissing;
    }
    return getAllMissing();
  }

  // On envoie uniquement les champs réellement utiles à la création du contact.
  function buildPayload(players) {
    return players.map(player => ({
      firstName: player.firstName || '',
      lastName: player.lastName || '',
      phone: localPhone(player.phone),
      club: player.club || 'TENNIS CLUB DE VITROLLES',
      category: player.category || ''
    }));
  }

  function setButtonsBusy(busy) {
    document.querySelectorAll('[data-action="createMissingContacts"], [data-action="createContacts"]').forEach(button => {
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
    if (title) title.textContent = 'Création des contacts…';
    if (text) text.textContent = `${count} contact${count > 1 ? 's' : ''} à créer. Ouverture de Raccourcis…`;
    if (close) close.classList.add('hidden');
    if (overlay) overlay.classList.remove('hidden');

    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (document.visibilityState !== 'visible') return;
      if (text) text.textContent = 'Raccourcis met plus de temps que prévu. Tu peux fermer cette fenêtre sans perdre ta liste puis réessayer.';
      if (close) close.classList.remove('hidden');
    }, 2500);
  }

  function hideOverlay() {
    clearTimeout(watchdog);
    document.getElementById('shortcutOverlay')?.classList.add('hidden');
    setButtonsBusy(false);
    launching = false;
  }

  function launchCreateContacts() {
    if (launching) return;
    const tcv = window.TCV;
    const missing = getMissingForCurrentContext();
    if (!missing.length) {
      alert('Aucun contact manquant à créer.');
      return;
    }

    launching = true;
    setButtonsBusy(true);
    const payload = buildPayload(missing);
    localStorage.setItem(PENDING_KEY, JSON.stringify({ tag: 'createContacts', at: Date.now(), count: missing.length }));
    showOverlay(missing.length);

    const shortcutName = tcv?.state?.settings?.contactsShortcut || 'TCV - Créer contacts';
    const success = `${location.origin}${location.pathname}?shortcut=${encodeURIComponent('createContacts')}`;
    const cancel = `${location.origin}${location.pathname}?shortcut=${encodeURIComponent('createContacts-cancel')}`;
    const url = `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(shortcutName)}&input=text&text=${encodeURIComponent(JSON.stringify(payload))}&x-success=${encodeURIComponent(success)}&x-cancel=${encodeURIComponent(cancel)}`;

    setTimeout(() => { location.href = url; }, 80);
  }

  function recoverOnReturn() {
    if (document.visibilityState !== 'visible') return;
    const params = new URLSearchParams(location.search);
    const shortcut = params.get('shortcut') || '';
    if (shortcut.startsWith('createContacts')) return;

    const pending = readPending();
    if (!pending || pending.tag !== 'createContacts') {
      hideOverlay();
      return;
    }

    if (Date.now() - Number(pending.at || 0) > 1200) {
      setTimeout(() => {
        const again = readPending();
        if (again?.tag === 'createContacts') {
          localStorage.removeItem(PENDING_KEY);
          hideOverlay();
        }
      }, 300);
    }
  }

  function clearStalePending() {
    const pending = readPending();
    if (pending?.tag === 'createContacts' && Date.now() - Number(pending.at || 0) > STALE_PENDING_MS) {
      localStorage.removeItem(PENDING_KEY);
      hideOverlay();
    }
  }

  function injectPlayersButton() {
    const tcv = window.TCV;
    if (!tcv?.state || tcv.state.route !== 'players') return;
    const missing = getAllMissing();
    const actions = document.querySelector('.row-actions');
    if (!actions) return;

    let button = actions.querySelector('[data-action="createMissingContacts"]');
    if (!missing.length) {
      if (button) button.remove();
      document.getElementById('createContactsHint')?.remove();
      return;
    }

    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-primary btn-full';
      button.dataset.action = 'createMissingContacts';
      actions.appendChild(button);
    }
    if (!launching) button.textContent = `➕ Créer ${missing.length} contact${missing.length > 1 ? 's' : ''} manquant${missing.length > 1 ? 's' : ''}`;

    if (!document.getElementById('createContactsHint')) {
      const hint = document.createElement('div');
      hint.id = 'createContactsHint';
      hint.className = 'banner banner--warn section';
      hint.innerHTML = '<strong>Contacts manquants détectés</strong>Crée-les avec le raccourci iPhone, puis relance « Vérifier Contacts iPhone » pour confirmer.';
      actions.insertAdjacentElement('afterend', hint);
    }
  }

  function fixContactsScreenButton() {
    const tcv = window.TCV;
    if (!tcv?.state || tcv.state.route !== 'contacts') return;
    const button = document.querySelector('[data-action="createContacts"]');
    if (!button) return;
    const missing = getMissingForCurrentContext();
    button.disabled = !missing.length || launching;
    if (missing.length && !launching) button.textContent = `📇 Créer ${missing.length} contact${missing.length > 1 ? 's' : ''} manquant${missing.length > 1 ? 's' : ''}`;
  }

  function refresh() {
    injectPlayersButton();
    fixContactsScreenButton();
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-action="createMissingContacts"], [data-action="createContacts"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    launchCreateContacts();
  }, true);

  document.getElementById('overlayCloseBtn')?.addEventListener('click', () => {
    const pending = readPending();
    if (pending?.tag === 'createContacts') localStorage.removeItem(PENDING_KEY);
    hideOverlay();
  }, true);

  window.addEventListener('pageshow', () => setTimeout(recoverOnReturn, 120));
  window.addEventListener('focus', () => setTimeout(recoverOnReturn, 120));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(recoverOnReturn, 120);
  });

  const observer = new MutationObserver(() => refresh());
  const view = document.getElementById('view');
  if (view) observer.observe(view, { childList: true, subtree: true });

  clearStalePending();
  refresh();
})();