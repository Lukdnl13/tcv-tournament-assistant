(() => {
  const PENDING_KEY = 'tcv_pending_shortcut_v3';

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

  function buildPayload(players) {
    return players.map(player => ({
      id: player.id,
      firstName: player.firstName || '',
      lastName: player.lastName || '',
      phone: localPhone(player.phone),
      canonicalPhone: normalizePhone(player.phone),
      club: player.club || 'TENNIS CLUB DE VITROLLES',
      category: player.category || ''
    }));
  }

  function showOverlay(count) {
    const overlay = document.getElementById('shortcutOverlay');
    const title = document.getElementById('overlayTitle');
    const text = document.getElementById('overlayText');
    const close = document.getElementById('overlayCloseBtn');
    if (title) title.textContent = 'Création des contacts…';
    if (text) text.textContent = `Ouverture du raccourci iPhone pour ${count} contact(s) manquant(s).`;
    if (close) close.classList.add('hidden');
    if (overlay) overlay.classList.remove('hidden');
  }

  function launchCreateContacts() {
    const tcv = window.TCV;
    const missing = getMissingForCurrentContext();
    if (!missing.length) {
      alert('Aucun contact manquant à créer.');
      return;
    }

    const payload = buildPayload(missing);
    localStorage.setItem(PENDING_KEY, JSON.stringify({ tag: 'createContacts', at: Date.now() }));
    showOverlay(missing.length);

    const shortcutName = tcv?.state?.settings?.contactsShortcut || 'TCV - Créer contacts';
    const success = `${location.origin}${location.pathname}?shortcut=${encodeURIComponent('createContacts')}`;
    const url = `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(shortcutName)}&input=text&text=${encodeURIComponent(JSON.stringify(payload))}&x-success=${encodeURIComponent(success)}`;

    setTimeout(() => {
      location.href = url;
    }, 120);
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
    button.textContent = `➕ Créer ${missing.length} contact${missing.length > 1 ? 's' : ''} manquant${missing.length > 1 ? 's' : ''}`;

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
    button.disabled = !missing.length;
    if (missing.length) button.textContent = `📇 Créer ${missing.length} contact${missing.length > 1 ? 's' : ''} manquant${missing.length > 1 ? 's' : ''}`;
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

  const observer = new MutationObserver(() => refresh());
  const view = document.getElementById('view');
  if (view) observer.observe(view, { childList: true, subtree: true });

  refresh();
})();
