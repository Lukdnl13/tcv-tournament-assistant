(() => {
  const PLAYERS_KEY = 'tcv_players_v1';
  const CONTACTS_KEY = 'tcv_contacts_vcf_index_v1';
  const STATUS_KEY = 'tcv_verify_status_v1';
  let syncing = false;

  function normalizePhone(raw = '') {
    let s = String(raw ?? '').trim().replace(/^tel:/i, '').replace(/[^\d+]/g, '');
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

  function loadIndex() {
    try {
      const data = JSON.parse(localStorage.getItem(CONTACTS_KEY) || 'null');
      if (!data || !Array.isArray(data.phones)) return null;
      return data;
    } catch {
      return null;
    }
  }

  function saveIndex(phones, sourceName = '') {
    const unique = [...new Set(phones.map(normalizePhone).filter(Boolean))];
    const data = {
      phones: unique,
      count: unique.length,
      importedAt: new Date().toISOString(),
      sourceName
    };
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(data));
    return data;
  }

  function parseVCard(text) {
    const unfolded = String(text || '').replace(/\r?\n[ \t]/g, '');
    const phones = [];
    const re = /(?:^|\r?\n)(?:item\d+\.)?TEL[^:]*:(.*)$/gim;
    let match;
    while ((match = re.exec(unfolded))) {
      const value = match[1].trim();
      const phone = normalizePhone(value);
      if (phone) phones.push(phone);
    }
    return [...new Set(phones)];
  }

  function setStatus(type, title, message) {
    const status = { type, title, message };
    localStorage.setItem(STATUS_KEY, JSON.stringify(status));
    if (window.TCV?.state) window.TCV.state.verifyStatus = status;
  }

  function getPlayers() {
    return Array.isArray(window.TCV?.state?.players) ? window.TCV.state.players : [];
  }

  function syncPlayerStatuses({ rerender = true } = {}) {
    if (syncing) return { changed: false, found: 0, missing: 0 };
    const index = loadIndex();
    if (!index) return { changed: false, found: 0, missing: 0 };

    const contacts = new Set(index.phones.map(normalizePhone));
    const players = getPlayers();
    let changed = false;
    let found = 0;
    let missing = 0;

    syncing = true;
    try {
      for (const player of players) {
        if (!player.phone) continue;
        const exists = contacts.has(normalizePhone(player.phone));
        const next = exists ? 'exists' : 'missing';
        if (player.contactStatus !== next) {
          player.contactStatus = next;
          changed = true;
        }
        exists ? found++ : missing++;
      }
      if (changed) localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
    } finally {
      syncing = false;
    }

    if (changed && rerender && window.TCV?.route && window.TCV?.state?.route) {
      setTimeout(() => window.TCV.route(window.TCV.state.route), 0);
    }
    return { changed, found, missing };
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '';
    }
  }

  function ensureInput() {
    let input = document.getElementById('contactsVcfInput');
    if (input) return input;
    input = document.createElement('input');
    input.id = 'contactsVcfInput';
    input.type = 'file';
    input.accept = '.vcf,text/vcard,text/x-vcard';
    input.hidden = true;
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;

      try {
        const text = await file.text();
        const phones = parseVCard(text);
        if (!phones.length) {
          alert("Aucun numéro de téléphone n'a été trouvé dans ce fichier .vcf.");
          return;
        }
        const data = saveIndex(phones, file.name);
        const result = syncPlayerStatuses({ rerender: false });
        setStatus(
          'success',
          'Contacts iPhone importés',
          `${data.count} numéro(s) indexé(s) localement. Comparaison terminée : ${result.found} joueur(s) déjà dans Contacts, ${result.missing} à ajouter.`
        );
        if (window.TCV?.route) window.TCV.route('players');
      } catch (error) {
        alert('Impossible de lire le fichier Contacts : ' + (error?.message || error));
      }
    });
    return input;
  }

  function openVcfImport() {
    ensureInput().click();
  }

  function vCardEscape(value = '') {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  function missingPlayersForContext() {
    const players = getPlayers();
    const selection = window.TCV?.state?.campaignSelection;
    if (selection && selection.size) {
      const selected = players.filter(p => selection.has(p.id) && p.contactStatus === 'missing' && p.phone);
      if (selected.length) return selected;
    }
    return players.filter(p => p.contactStatus === 'missing' && p.phone);
  }

  function buildMissingVcf(players) {
    const seen = new Set();
    const cards = [];
    for (const player of players) {
      const phone = normalizePhone(player.phone);
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      const first = vCardEscape(player.firstName || '');
      const last = vCardEscape(player.lastName || '');
      const full = vCardEscape(`${player.firstName || ''} ${player.lastName || ''}`.trim() || phone);
      const org = vCardEscape(player.club || 'TENNIS CLUB DE VITROLLES');
      const note = vCardEscape(`TCV - Catégorie : ${player.category || 'Non renseignée'}`);
      cards.push([
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${last};${first};;;`,
        `FN:${full}`,
        `ORG:${org}`,
        `TEL;TYPE=CELL:${localPhone(phone)}`,
        `NOTE:${note}`,
        'END:VCARD'
      ].join('\r\n'));
    }
    return cards.join('\r\n');
  }

  async function shareOrDownloadVcf() {
    const missing = missingPlayersForContext();
    if (!missing.length) {
      alert('Aucun contact manquant à générer.');
      return;
    }

    const vcf = buildMissingVcf(missing);
    if (!vcf) {
      alert('Aucun contact valide à générer.');
      return;
    }

    const date = new Date().toISOString().slice(0, 10);
    const filename = `TCV_contacts_manquants_${date}.vcf`;
    const file = new File([vcf], filename, { type: 'text/vcard;charset=utf-8' });

    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Contacts TCV manquants',
          text: `${missing.length} contact(s) à ajouter dans l’iPhone.`
        });
        return;
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }

    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function makeContactsPanel() {
    const index = loadIndex();
    const players = getPlayers();
    const found = players.filter(p => p.phone && p.contactStatus === 'exists').length;
    const missing = players.filter(p => p.phone && p.contactStatus === 'missing').length;
    const panel = document.createElement('div');
    panel.id = 'vcfContactsPanel';
    panel.className = 'card section';
    panel.innerHTML = `
      <h3 class="card__title">Contacts iPhone</h3>
      <p class="card__text">${index
        ? `${index.count} numéro(s) importé(s) depuis <b>${escapeHtml(index.sourceName || 'un fichier VCF')}</b> • ${escapeHtml(formatDate(index.importedAt))}`
        : 'Importe une fois l’export .vcf de tes Contacts iPhone. La comparaison avec MOJA se fera ensuite directement dans l’application.'}</p>
      ${index ? `
        <div class="kpi-grid section" style="margin-top:14px">
          <div class="kpi"><div class="kpi__value">${found}</div><div class="kpi__label">déjà dans Contacts</div></div>
          <div class="kpi"><div class="kpi__value">${missing}</div><div class="kpi__label">à ajouter</div></div>
          <div class="kpi"><div class="kpi__value">${index.count}</div><div class="kpi__label">numéros indexés</div></div>
        </div>` : ''}
      <div class="row-actions">
        <button type="button" class="btn btn-primary btn-full" data-vcf-action="import">📇 ${index ? 'Actualiser mes Contacts iPhone (.vcf)' : 'Importer mes Contacts iPhone (.vcf)'}</button>
        ${index && missing ? `<button type="button" class="btn btn-success btn-full" data-vcf-action="generate">➕ Générer ${missing} contact${missing > 1 ? 's' : ''} manquant${missing > 1 ? 's' : ''} (.vcf)</button>` : ''}
      </div>
      <div class="banner banner--info" style="margin-top:12px"><strong>100 % local</strong>Le fichier Contacts et la comparaison restent sur cet appareil. Aucun contact n’est envoyé sur Internet.</div>
    `;
    return panel;
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
  }

  function enhancePlayers() {
    if (window.TCV?.state?.route !== 'players') return;
    syncPlayerStatuses({ rerender: false });

    const oldVerify = document.querySelector('[data-action="verifyContacts"]');
    if (oldVerify) {
      oldVerify.textContent = '📇 Importer / actualiser mes Contacts iPhone';
      oldVerify.dataset.vcfAction = 'import';
      oldVerify.removeAttribute('data-action');
      oldVerify.onclick = openVcfImport;
    }

    document.querySelectorAll('[data-action="createMissingContacts"]').forEach(el => el.remove());
    document.getElementById('createContactsHint')?.remove();

    let panel = document.getElementById('vcfContactsPanel');
    if (!panel) {
      const toolbar = document.querySelector('.toolbar');
      panel = makeContactsPanel();
      if (toolbar) toolbar.insertAdjacentElement('afterend', panel);
      else document.getElementById('view')?.prepend(panel);
    }

    const infoBanner = [...document.querySelectorAll('.banner--info')].find(el => el.textContent.includes('Après l’import'));
    if (infoBanner) {
      infoBanner.innerHTML = '<strong>Nouveau fonctionnement</strong>La vérification se fait localement à partir de ton export Contacts .vcf. Plus besoin du raccourci « TCV - Vérifier contacts ».';
    }
  }

  function enhanceContactsRoute() {
    if (window.TCV?.state?.route !== 'contacts') return;
    const banner = document.querySelector('#view .banner--warn');
    if (banner) {
      banner.className = 'banner banner--info';
      banner.innerHTML = '<strong>Ajout des contacts par fichier vCard</strong>Génère un seul fichier .vcf contenant tous les joueurs manquants, puis ouvre-le sur l’iPhone pour les ajouter dans Contacts.';
    }

    const button = document.querySelector('[data-action="createContacts"]');
    if (button) {
      const count = missingPlayersForContext().length;
      button.removeAttribute('data-action');
      button.dataset.vcfAction = 'generate';
      button.disabled = !count;
      button.textContent = count ? `📇 Générer ${count} contact${count > 1 ? 's' : ''} manquant${count > 1 ? 's' : ''} (.vcf)` : '✓ Aucun contact manquant';
      button.onclick = shareOrDownloadVcf;
    }
  }

  function enhanceHome() {
    if (window.TCV?.state?.route !== 'home') return;
    const firstCard = document.querySelector('#view .card');
    if (!firstCard || firstCard.querySelector('[data-vcf-action="import"]')) return;
    const index = loadIndex();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quick-action is-blue';
    button.dataset.vcfAction = 'import';
    button.innerHTML = `<span class="quick-action__icon">📇</span><span class="quick-action__copy"><strong>${index ? 'Actualiser mes Contacts iPhone' : 'Importer mes Contacts iPhone'}</strong><small>Fichier .vcf • comparaison locale instantanée</small></span><span class="quick-action__arrow">›</span>`;
    firstCard.appendChild(button);
  }

  function refresh() {
    ensureInput();
    enhanceHome();
    enhancePlayers();
    enhanceContactsRoute();
  }

  document.addEventListener('click', event => {
    const action = event.target.closest?.('[data-vcf-action]')?.dataset.vcfAction;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action === 'import') openVcfImport();
    if (action === 'generate') shareOrDownloadVcf();
  }, true);

  const view = document.getElementById('view');
  if (view) {
    new MutationObserver(() => requestAnimationFrame(refresh)).observe(view, { childList: true, subtree: true });
  }

  window.addEventListener('pageshow', () => setTimeout(refresh, 80));
  setTimeout(refresh, 80);
})();
