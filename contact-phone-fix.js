(() => {
  const PLAYERS_KEY = 'tcv_players_v1';
  const VERIFY_STATUS_KEY = 'tcv_verify_status_v1';
  const PENDING_KEY = 'tcv_pending_shortcut_v3';

  function normalizePhone(raw = '') {
    let s = String(raw).trim().replace(/[^\d+]/g, '');
    if (!s) return '';
    if (s.startsWith('0033')) s = '+33' + s.slice(4);
    if (/^33\d+$/.test(s)) s = '+' + s;

    // Excel peut supprimer le zéro initial lorsqu'un portable est stocké comme nombre.
    // 612345678 -> +33612345678 ; 712345678 -> +33712345678.
    if (/^[67]\d{8}$/.test(s)) s = '+33' + s;

    // 06xxxxxxxx / 07xxxxxxxx -> format canonique +33.
    if (/^0[67]\d{8}$/.test(s)) s = '+33' + s.slice(1);

    // Autres numéros français à 10 chiffres.
    if (/^0\d{9}$/.test(s)) s = '+33' + s.slice(1);
    return s;
  }

  function lookupPhone(raw = '') {
    const canonical = normalizePhone(raw);
    // Le raccourci existant compare directement le champ téléphone.
    // Pour les portables français, on lui envoie 06/07, format le plus courant dans Contacts.
    if (/^\+33[67]\d{8}$/.test(canonical)) return '0' + canonical.slice(3);
    return canonical;
  }

  function migrateStoredPhones() {
    if (!window.TCV?.state?.players) return false;
    let changed = false;
    window.TCV.state.players.forEach((player) => {
      const normalized = normalizePhone(player.phone);
      if (normalized && normalized !== player.phone) {
        player.phone = normalized;
        changed = true;
      }
    });
    if (changed) {
      localStorage.setItem(PLAYERS_KEY, JSON.stringify(window.TCV.state.players));
    }
    return changed;
  }

  function buildVerifyPayload(players) {
    const payload = {};
    players.forEach((player, index) => {
      const canonicalPhone = normalizePhone(player.phone);
      payload[String(index + 1)] = {
        id: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        category: player.category,
        phone: lookupPhone(canonicalPhone),
        canonicalPhone
      };
    });
    return payload;
  }

  function showOverlay() {
    const overlay = document.getElementById('shortcutOverlay');
    const title = document.getElementById('overlayTitle');
    const text = document.getElementById('overlayText');
    const close = document.getElementById('overlayCloseBtn');
    if (title) title.textContent = 'Vérification des contacts…';
    if (text) text.textContent = 'Ouverture du raccourci iPhone avec des numéros normalisés pour Contacts.';
    if (close) close.classList.add('hidden');
    if (overlay) overlay.classList.remove('hidden');
  }

  function launchVerification() {
    const tcv = window.TCV;
    const players = Array.isArray(tcv?.state?.players) ? tcv.state.players : [];
    if (!players.length) return;

    migrateStoredPhones();

    const status = {
      type: 'info',
      title: 'Vérification Contacts',
      message: 'Vérification lancée avec normalisation des numéros…'
    };
    tcv.state.verifyStatus = status;
    localStorage.setItem(VERIFY_STATUS_KEY, JSON.stringify(status));

    const payload = buildVerifyPayload(players);
    localStorage.setItem(PENDING_KEY, JSON.stringify({ tag: 'contacts', at: Date.now() }));
    showOverlay();

    const shortcutName = tcv.state.settings?.verifyShortcut || 'TCV - Vérifier contacts';
    const success = `${location.origin}${location.pathname}?shortcut=${encodeURIComponent('contacts')}`;
    const url = `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(shortcutName)}&input=text&text=${encodeURIComponent(JSON.stringify(payload))}&x-success=${encodeURIComponent(success)}`;

    setTimeout(() => {
      location.href = url;
    }, 120);
  }

  // Intercepte seulement le bouton de vérification Contacts avant le onclick interne de l'app.
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-action="verifyContacts"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    launchVerification();
  }, true);

  // Corrige aussi les numéros déjà importés avant ce patch.
  const changed = migrateStoredPhones();
  if (changed && window.TCV?.route && window.TCV?.state?.route) {
    window.TCV.route(window.TCV.state.route);
  }
})();
