const App = (() => {
  const KEYS = {
    players: 'tcv_players_v1',
    campaigns: 'tcv_campaigns_v1',
    history: 'tcv_history_v1',
    settings: 'tcv_settings_v1',
    verifyStatus: 'tcv_verify_status_v1',
    pendingShortcut: 'tcv_pending_shortcut_v3'
  };

  const state = {
    route: 'home',
    players: load(KEYS.players, []),
    campaigns: load(KEYS.campaigns, []),
    history: load(KEYS.history, []),
    settings: load(KEYS.settings, {
      contactsShortcut: 'TCV - Créer contacts',
      verifyShortcut: 'TCV - Vérifier contacts',
      messagesShortcut: 'TCV - Envoyer messages'
    }),
    verifyStatus: load(KEYS.verifyStatus, null),
    audienceQuick: 'all',
    currentEligible: [],
    campaignSelection: new Set(),
    deferredInstall: null,
    isBusy: false
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function load(k, fallback) {
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function save(k, v) {
    localStorage.setItem(k, JSON.stringify(v));
  }

  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replaceAll('.', '');
  }

  function esc(v = '') {
    return String(v).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  }

  function normalizePhone(raw = '') {
    let s = String(raw).trim().replace(/[^\d+]/g, '');
    if (s.startsWith('0033')) s = '+33' + s.slice(4);
    if (s.startsWith('0') && s.length >= 10) s = '+33' + s.slice(1);
    if (/^33\d+$/.test(s)) s = '+' + s;
    return s;
  }

  function initials(p) {
    return `${(p.firstName || '')[0] || ''}${(p.lastName || '')[0] || ''}`.toUpperCase();
  }

  function toast(msg, ms = 2500) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), ms);
  }

  function showOverlay(title, text, closable = false) {
    $('#overlayTitle').textContent = title;
    $('#overlayText').textContent = text;
    $('#overlayCloseBtn').classList.toggle('hidden', !closable);
    $('#shortcutOverlay').classList.remove('hidden');
    state.isBusy = true;
  }

  function hideOverlay() {
    $('#shortcutOverlay').classList.add('hidden');
    state.isBusy = false;
  }

  function setVerifyStatus(type, title, message) {
    state.verifyStatus = { type, title, message };
    save(KEYS.verifyStatus, state.verifyStatus);
  }

  function clearVerifyStatus() {
    state.verifyStatus = null;
    save(KEYS.verifyStatus, null);
  }

  function categoryType(cat = '') {
    const s = String(cat).trim().toLowerCase();
    if (!s) return 'other';
    if (s.includes('senior')) return 'senior';
    if (['11-12 ans', '13-14 ans', '15-16 ans', '17-18 ans', '11/12 ans', '13/14 ans', '15/16 ans', '17/18 ans'].includes(s)) return 'youth';
    if (/\d{1,2}[\/-]\d{1,2}\s*ans/.test(s)) return 'youth';
    return 'other';
  }

  function uniqueCategories() {
    return [...new Set(state.players.map((p) => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  }

  function stats() {
    return {
      total: state.players.length,
      exists: state.players.filter((p) => p.contactStatus === 'exists').length,
      missing: state.players.filter((p) => p.contactStatus === 'missing').length
    };
  }

  function parseCSV(text) {
    const first = text.split(/\r?\n/)[0] || '';
    const delimiter = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
    const rows = [];
    let row = [];
    let cell = '';
    let q = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];
      if (ch === '"') {
        if (q && next === '"') {
          cell += '"';
          i++;
        } else {
          q = !q;
        }
      } else if (ch === delimiter && !q) {
        row.push(cell);
        cell = '';
      } else if ((ch === '\n' || ch === '\r') && !q) {
        if (ch === '\r' && next === '\n') i++;
        row.push(cell);
        cell = '';
        if (row.some((v) => String(v).trim() !== '')) rows.push(row);
        row = [];
      } else {
        cell += ch;
      }
    }
    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  function normHeader(h = '') {
    return String(h)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '');
  }

  function mapHeaders(headers) {
    const aliases = {
      firstName: ['prenom', 'firstname'],
      lastName: ['nom', 'lastname'],
      phone: ['telephoneportable', 'portable', 'telephone', 'tel', 'mobile', 'numerotelephone'],
      ranking: ['classement', 'classementinscription', 'ranking'],
      club: ['club', 'nomclub'],
      category: ['categoriedage', 'categorieage', 'categorie', 'category'],
      gender: ['sexe', 'genre', 'gender']
    };
    const map = {};
    headers.forEach((h, i) => {
      const n = normHeader(h);
      for (const [k, list] of Object.entries(aliases)) {
        if (map[k] === undefined && list.includes(n)) map[k] = i;
      }
    });
    return map;
  }

  function genderNorm(v = '') {
    const s = String(v).trim().toLowerCase();
    if (['f', 'femme', 'fille', 'female'].includes(s)) return 'F';
    if (['m', 'h', 'homme', 'garçon', 'garcon', 'male'].includes(s)) return 'H';
    return '';
  }

  async function importFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    let rows = [];

    if (ext === 'csv') {
      rows = parseCSV(await file.text());
    } else if (['xls', 'xlsx'].includes(ext)) {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    } else {
      throw new Error('Format non pris en charge. Utilise CSV, XLS ou XLSX.');
    }

    if (rows.length < 2) throw new Error('Le fichier ne contient pas assez de lignes.');

    const headers = rows[0];
    const map = mapHeaders(headers);
    if (map.lastName === undefined || map.phone === undefined) {
      throw new Error('Colonnes minimales introuvables : Nom et Téléphone portable.');
    }

    let created = 0, updated = 0, skipped = 0;
    rows.slice(1).forEach((r) => {
      const lastName = String(r[map.lastName] || '').trim();
      const firstName = map.firstName !== undefined ? String(r[map.firstName] || '').trim() : '';
      const phone = normalizePhone(r[map.phone] || '');
      if (!lastName || !phone) {
        skipped++;
        return;
      }
      const entry = {
        id: uid(),
        firstName,
        lastName,
        phone,
        ranking: map.ranking !== undefined ? String(r[map.ranking] || '').trim() : '',
        club: map.club !== undefined ? String(r[map.club] || '').trim() : 'TENNIS CLUB DE VITROLLES',
        category: map.category !== undefined ? String(r[map.category] || '').trim() : '',
        gender: map.gender !== undefined ? genderNorm(r[map.gender]) : '',
        contactStatus: 'unknown',
        importedAt: new Date().toISOString()
      };
      const existing = state.players.find((p) => normalizePhone(p.phone) === phone);
      if (existing) {
        Object.assign(existing, { ...entry, id: existing.id, contactStatus: existing.contactStatus || 'unknown' });
        updated++;
      } else {
        state.players.push(entry);
        created++;
      }
    });

    save(KEYS.players, state.players);
    return { created, updated, skipped, total: state.players.length };
  }

  function addDemo() {
    const demo = [
      { firstName: 'Lucas', lastName: 'DANIEL', phone: '+33782565405', category: 'Senior', ranking: '15/4', club: 'TENNIS CLUB DE VITROLLES', gender: 'H' },
      { firstName: 'Emma', lastName: 'MARTIN', phone: '+33612345610', category: '13-14 ans', ranking: '15/2', club: 'TC Vitrolles', gender: 'F' },
      { firstName: 'Jules', lastName: 'ROBERT', phone: '+33688443322', category: '15-16 ans', ranking: '15/3', club: 'TC Vitrolles', gender: 'H' },
      { firstName: 'Julie', lastName: 'GARCIA', phone: '+33672443920', category: 'Senior', ranking: '5/6', club: 'TC Aix', gender: 'F' }
    ];
    demo.forEach((p) => {
      if (!state.players.some((x) => normalizePhone(x.phone) === p.phone)) {
        state.players.push({ ...p, id: uid(), contactStatus: 'unknown', importedAt: new Date().toISOString() });
      }
    });
    save(KEYS.players, state.players);
    render();
    toast('Joueurs de démonstration ajoutés.');
  }

  function statusPill(player) {
    if (player.contactStatus === 'exists') return '<span class="pill pill--green">✓ Dans Contacts</span>';
    if (player.contactStatus === 'missing') return '<span class="pill pill--orange">À créer</span>';
    return '<span class="pill pill--gray">Non vérifié</span>';
  }

  function noticeBlock() {
    if (!state.verifyStatus) return '';
    const map = { info: 'banner--info', warn: 'banner--warn', success: 'banner--success', error: 'banner--error' };
    return `<div class="banner ${map[state.verifyStatus.type] || 'banner--info'}"><strong>${esc(state.verifyStatus.title)}</strong>${esc(state.verifyStatus.message)}</div>`;
  }

  function renderHome() {
    const st = stats();
    return `
      <section class="hero">
        <div class="hero__top">
          <div>
            <span class="chip">Communication club simplifiée</span>
            <h2>Importe, cible et communique sans te perdre.</h2>
            <p>Une interface plus simple pour gérer les joueurs, vérifier les contacts iPhone et préparer tes communications jeunes ou seniors.</p>
          </div>
          <div class="hero__logo"><img src="assets/tcv-logo.png" alt=""></div>
        </div>
        <div class="chip-row">
          <span class="chip">Jeunes</span>
          <span class="chip">Seniors</span>
          <span class="chip">Catégorie précise</span>
          <span class="chip">Raccourcis iPhone</span>
        </div>
      </section>
      <div class="kpi-grid section">
        <div class="kpi"><div class="kpi__value">${st.total}</div><div class="kpi__label">joueurs</div></div>
        <div class="kpi"><div class="kpi__value">${st.exists}</div><div class="kpi__label">contacts OK</div></div>
        <div class="kpi"><div class="kpi__value">${st.missing}</div><div class="kpi__label">à créer</div></div>
      </div>
      <section class="grid cols-2 section">
        <div class="card">
          <h3 class="card__title">Actions rapides</h3>
          <button class="quick-action is-blue" data-action="import"><span class="quick-action__icon">⇩</span><span class="quick-action__copy"><strong>Importer un fichier MOJA</strong><small>Formats CSV, XLS ou XLSX</small></span><span class="quick-action__arrow">›</span></button>
          <button class="quick-action is-green" data-action="players"><span class="quick-action__icon">👥</span><span class="quick-action__copy"><strong>Gérer les joueurs</strong><small>Recherche, statut contact, base locale</small></span><span class="quick-action__arrow">›</span></button>
          <button class="quick-action is-orange" data-action="campaign"><span class="quick-action__icon">🎯</span><span class="quick-action__copy"><strong>Préparer une campagne</strong><small>Jeunes, seniors ou catégorie précise</small></span><span class="quick-action__arrow">›</span></button>
        </div>
        <div class="card">
          <h3 class="card__title">Parcours conseillé</h3>
          <div class="banner banner--info"><strong>Étape 1</strong>Importe ton fichier MOJA.</div>
          <div style="height:10px"></div>
          <div class="banner banner--success"><strong>Étape 2</strong>Vérifie les numéros présents dans les Contacts iPhone.</div>
          <div style="height:10px"></div>
          <div class="banner banner--warn"><strong>Étape 3</strong>Crée les contacts manquants puis prépare la communication.</div>
        </div>
      </section>`;
  }

  function renderPlayers() {
    const cards = state.players.map((p) => `
      <article class="player-card" data-search="${esc(`${p.firstName} ${p.lastName} ${p.phone} ${p.club} ${p.category}`.toLowerCase())}">
        <div class="player-card__main">
          <div class="avatar">${esc(initials(p))}</div>
          <div style="flex:1;min-width:0">
            <h3>${esc(`${p.firstName} ${p.lastName}`.trim())}</h3>
            <div class="meta">
              ${p.category ? `<span class="pill pill--blue">${esc(p.category)}</span>` : ''}
              ${p.ranking ? `<span class="pill pill--gray">${esc(p.ranking)}</span>` : ''}
              ${p.gender ? `<span class="pill ${p.gender === 'F' ? 'pill--orange' : 'pill--green'}">${p.gender === 'F' ? 'Féminin' : 'Masculin'}</span>` : ''}
            </div>
            <div class="subline">${esc((p.club || '').toUpperCase())}</div>
            <div class="phone">${esc(p.phone)}</div>
          </div>
          <div class="status-wrap">${statusPill(p)}</div>
        </div>
      </article>`).join('');

    return `
      <section class="page-head"><div><h2>Joueurs</h2><p>${state.players.length} dans la base locale</p></div></section>
      <div class="toolbar"><input id="searchPlayers" class="search" type="search" placeholder="Nom, club ou téléphone"><button class="btn btn-primary" data-action="import">Importer</button></div>
      <div class="section">${noticeBlock()}</div>
      <div class="row-actions"><button class="btn btn-success btn-full" data-action="verifyContacts">🪪 Vérifier Contacts iPhone</button><button class="btn btn-secondary" data-action="demo">Ajouter démo</button><button class="btn btn-danger" data-action="clearPlayers">Vider la base</button></div>
      <div class="banner banner--info section"><strong>Astuce</strong>Après l’import, lance <b>Vérifier Contacts iPhone</b>. Les fiches passeront automatiquement à <b>✓ Dans Contacts</b> ou <b>À créer</b>.</div>
      <div id="playerList" class="player-list">${cards || '<div class="empty">Aucun joueur importé pour le moment.</div>'}</div>`;
  }

  function renderCampaign() {
    const labels = { all: 'Tous', youth: 'Jeunes', senior: 'Seniors', category: 'Catégorie' };
    const active = state.audienceQuick;
    const catOpts = uniqueCategories().map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    return `
      <section class="page-head"><div><h2>Campagne</h2><p>Cible rapidement les bons joueurs</p></div></section>
      <div class="segmented section" id="quickAudience">${['all', 'youth', 'senior', 'category'].map((v) => `<button type="button" data-audience="${v}" class="${active === v ? 'active' : ''}">${labels[v]}</button>`).join('')}</div>
      <div class="card section">
        <form id="campaignForm" class="field-grid">
          <div class="field full"><label>Nom de la campagne</label><input id="campaignName" value="Communication Club" placeholder="Ex. TMC Dames, Tournoi jeunes, Portes ouvertes"></div>
          <div class="field"><label>Public</label>
            <select id="audienceSelect">
              <option value="all" ${active === 'all' ? 'selected' : ''}>Tous</option>
              <option value="youth" ${active === 'youth' ? 'selected' : ''}>Jeunes</option>
              <option value="senior" ${active === 'senior' ? 'selected' : ''}>Seniors</option>
              <option value="category" ${active === 'category' ? 'selected' : ''}>Catégorie précise</option>
            </select>
          </div>
          <div class="field"><label>Sexe</label><select id="genderSelect"><option value="ALL">Tous</option><option value="F">Filles / Femmes</option><option value="H">Garçons / Hommes</option></select></div>
          <div class="field full" id="categoryField" ${active === 'category' ? '' : 'hidden'}><label>Catégorie du fichier MOJA</label><select id="categorySelect"><option value="">Choisir</option>${catOpts}</select></div>
          <div class="field full"><button class="btn btn-primary btn-full" type="submit">Trouver les destinataires</button></div>
        </form>
      </div>
      <div id="eligibleArea" class="section"></div>`;
  }

  function buildEligible(filter) {
    const list = state.players.filter((p) => {
      const type = categoryType(p.category);
      if (filter.audience === 'youth' && type !== 'youth') return false;
      if (filter.audience === 'senior' && type !== 'senior') return false;
      if (filter.audience === 'category' && filter.category && p.category !== filter.category) return false;
      if (filter.gender !== 'ALL' && p.gender && p.gender !== filter.gender) return false;
      return true;
    });
    state.currentEligible = list;
    state.campaignSelection = new Set(list.map((p) => p.id));

    const rows = list.map((p) => `
      <label class="player-card">
        <div class="player-card__main">
          <input class="recipientCheck" type="checkbox" data-id="${p.id}" checked style="width:22px;height:22px;accent-color:#0B4F8A;margin-top:25px;flex:0 0 auto">
          <div class="avatar">${esc(initials(p))}</div>
          <div style="flex:1;min-width:0">
            <h3 style="font-size:18px">${esc(`${p.firstName} ${p.lastName}`.trim())}</h3>
            <div class="meta">${p.category ? `<span class="pill pill--blue">${esc(p.category)}</span>` : ''}${p.ranking ? `<span class="pill pill--gray">${esc(p.ranking)}</span>` : ''}</div>
            <div class="phone" style="font-size:16px">${esc(p.phone)}</div>
          </div>
        </div>
      </label>`).join('');

    return `<div class="card"><h3 class="card__title">Résultat du ciblage</h3><p class="card__text">${list.length} joueur(s) correspondent à ce filtre.</p><div class="player-list" style="margin-top:14px">${rows || '<div class="empty">Aucun joueur ne correspond à ces critères.</div>'}</div>${list.length ? '<div class="row-actions"><button class="btn btn-primary btn-full" data-action="composeMessage">Préparer le message</button></div>' : ''}</div>`;
  }

  function renderComposer() {
    const selected = state.players.filter((p) => state.campaignSelection.has(p.id));
    return `
      <section class="page-head"><div><h2>Message</h2><p>${selected.length} destinataire(s) sélectionné(s)</p></div></section>
      <div class="card">
        <div class="field-grid">
          <div class="field full"><label>Message</label><textarea id="messageText">Bonjour,\n\nLe Tennis Club de Vitrolles vous informe d'une nouvelle actualité / compétition / animation. 🎾\n\nN'hésitez pas à nous contacter pour plus d'informations.\n\nSportivement,\nLe TC Vitrolles</textarea></div>
          <div class="field full"><button class="btn btn-primary btn-full" data-action="sendMessages">📩 Ouvrir le raccourci Messages</button></div>
          <div class="field full"><button class="btn btn-secondary btn-full" data-action="goContacts">Vérifier les contacts avant</button></div>
        </div>
      </div>`;
  }

  function renderContacts() {
    const selected = state.players.filter((p) => state.campaignSelection.has(p.id));
    const missing = selected.filter((p) => p.contactStatus === 'missing');
    return `
      <section class="page-head"><div><h2>Contacts</h2><p>${missing.length} contact(s) à créer</p></div></section>
      <div class="banner banner--warn"><strong>Création via Raccourcis</strong>iPhone ne permet pas à la web app d’écrire directement dans les Contacts. La création passe donc par un raccourci dédié.</div>
      <div class="row-actions section"><button class="btn btn-success btn-full" data-action="createContacts" ${missing.length ? '' : 'disabled'}>📇 Ouvrir le raccourci Contacts</button></div>
      <div class="player-list section">${selected.map((p) => `
        <article class="player-card"><div class="player-card__main"><div class="avatar">${esc(initials(p))}</div><div style="flex:1"><h3 style="font-size:18px">${esc(`${p.firstName} ${p.lastName}`.trim())}</h3><div class="phone" style="font-size:16px">${esc(p.phone)}</div></div><div class="status-wrap">${statusPill(p)}</div></div></article>
      `).join('') || '<div class="empty">Aucune campagne active.</div>'}</div>`;
  }

  function renderHistory() {
    const rows = [...state.history].reverse().map((h) => `<article class="player-card"><div class="player-card__main"><div class="avatar">🕘</div><div style="flex:1"><h3 style="font-size:18px">${esc(h.name)}</h3><div class="subline">${new Date(h.date).toLocaleString('fr-FR')}</div></div><div class="status-wrap"><span class="pill pill--blue">${h.count} destinataires</span></div></div></article>`).join('');
    return `<section class="page-head"><div><h2>Historique</h2><p>Suivi local des campagnes</p></div></section><div class="player-list">${rows || '<div class="empty">Aucune campagne enregistrée.</div>'}</div>`;
  }

  function render() {
    const page = ({ home: renderHome, players: renderPlayers, campaign: renderCampaign, contacts: renderContacts, history: renderHistory })[state.route] || renderHome;
    $('#view').innerHTML = page();
    bind();
  }

  function route(name) {
    state.route = name;
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.route === name));
    render();
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bind() {
    $$('[data-action="import"]').forEach((b) => b.onclick = () => $('#fileInput').click());
    $$('[data-action="players"]').forEach((b) => b.onclick = () => route('players'));
    $$('[data-action="campaign"]').forEach((b) => b.onclick = () => route('campaign'));
    $$('[data-action="verifyContacts"]').forEach((b) => b.onclick = verifyContacts);
    $$('[data-action="demo"]').forEach((b) => b.onclick = addDemo);
    $$('[data-action="clearPlayers"]').forEach((b) => b.onclick = () => {
      if (confirm('Supprimer tous les joueurs de la base locale ?')) {
        state.players = [];
        save(KEYS.players, state.players);
        clearVerifyStatus();
        render();
      }
    });
    $$('[data-action="composeMessage"]').forEach((b) => b.onclick = () => {
      $('#view').innerHTML = renderComposer();
      bind();
      scrollTo({ top: 0, behavior: 'smooth' });
    });
    $$('[data-action="goContacts"]').forEach((b) => b.onclick = () => route('contacts'));
    $$('[data-action="createContacts"]').forEach((b) => b.onclick = runContactsShortcut);
    $$('[data-action="sendMessages"]').forEach((b) => b.onclick = runMessagesShortcut);

    const search = $('#searchPlayers');
    if (search) {
      search.oninput = () => {
        const q = search.value.trim().toLowerCase();
        $$('.player-card[data-search]').forEach((card) => {
          card.hidden = q && !card.dataset.search.includes(q);
        });
      };
    }

    const seg = $('#quickAudience');
    if (seg) {
      seg.querySelectorAll('button').forEach((btn) => btn.onclick = () => {
        state.audienceQuick = btn.dataset.audience;
        route('campaign');
      });
    }

    const sel = $('#audienceSelect');
    if (sel) {
      sel.onchange = () => {
        state.audienceQuick = sel.value;
        route('campaign');
      };
    }

    const form = $('#campaignForm');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const filter = {
          audience: $('#audienceSelect').value,
          gender: $('#genderSelect').value,
          category: $('#categorySelect')?.value || ''
        };
        $('#eligibleArea').innerHTML = buildEligible(filter);
        bind();
        $$('.recipientCheck').forEach((ch) => ch.onchange = () => {
          if (ch.checked) state.campaignSelection.add(ch.dataset.id);
          else state.campaignSelection.delete(ch.dataset.id);
        });
        state.campaigns.push({ id: uid(), name: $('#campaignName').value.trim() || 'Communication Club', date: new Date().toISOString(), filter });
        save(KEYS.campaigns, state.campaigns);
      };
    }

    $('#overlayCloseBtn').onclick = () => hideOverlay();
  }

  function buildVerifyPayload(players) {
    const payload = {};
    players.forEach((p, i) => {
      payload[String(i + 1)] = { id: p.id, firstName: p.firstName, lastName: p.lastName, category: p.category, phone: p.phone };
    });
    return payload;
  }

  function buildContactsPayload() {
    return state.players
      .filter((p) => state.campaignSelection.has(p.id) && p.contactStatus === 'missing')
      .map((p) => ({ firstName: p.firstName, lastName: p.lastName, phone: p.phone, club: p.club }));
  }

  function buildMessagesPayload(message) {
    return {
      recipients: state.players
        .filter((p) => state.campaignSelection.has(p.id) && p.phone)
        .map((p) => ({ name: `${p.firstName} ${p.lastName}`.trim(), phone: p.phone })),
      message
    };
  }

  function launchShortcut(shortcutName, payload, returnTag) {
    const text = JSON.stringify(payload);
    localStorage.setItem(KEYS.pendingShortcut, JSON.stringify({ tag: returnTag, at: Date.now() }));
    showOverlay('Ouverture du raccourci…', 'Le raccourci iPhone va s’ouvrir. Au retour, l’application reprendra automatiquement.', false);
    setTimeout(() => {
      const success = `${location.origin}${location.pathname}?shortcut=${encodeURIComponent(returnTag)}`;
      const url = `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(shortcutName)}&input=text&text=${encodeURIComponent(text)}&x-success=${encodeURIComponent(success)}`;
      location.href = url;
    }, 180);
  }

  function verifyContacts() {
    if (!state.players.length) {
      setVerifyStatus('warn', 'Vérification Contacts', 'Aucun joueur importé pour le moment.');
      render();
      return;
    }
    setVerifyStatus('info', 'Vérification Contacts', 'Vérification lancée…');
    render();
    launchShortcut(state.settings.verifyShortcut, buildVerifyPayload(state.players), 'contacts');
  }

  function runContactsShortcut() {
    const payload = buildContactsPayload();
    if (!payload.length) {
      toast('Aucun contact manquant à créer.');
      return;
    }
    launchShortcut(state.settings.contactsShortcut, payload, 'createContacts');
  }

  function runMessagesShortcut() {
    const message = $('#messageText')?.value?.trim();
    const recipients = state.players.filter((p) => state.campaignSelection.has(p.id) && p.phone);
    if (!message) {
      toast('Écris un message avant de continuer.');
      return;
    }
    if (!recipients.length) {
      toast('Aucun destinataire sélectionné.');
      return;
    }
    state.history.push({ id: uid(), name: state.campaigns.at(-1)?.name || 'Communication Club', count: recipients.length, date: new Date().toISOString() });
    save(KEYS.history, state.history);
    launchShortcut(state.settings.messagesShortcut, buildMessagesPayload(message), 'messages');
  }

  function applyVerifyResult(result) {
    hideOverlay();
    if (!result) {
      setVerifyStatus('warn', 'Vérification Contacts', 'Le raccourci s’est terminé mais aucun résultat n’a été reçu. Vérifie que le raccourci produit bien un résultat à la fin.');
      route('players');
      return;
    }
    const clean = decodeURIComponent(result).trim();
    if (!clean || clean === 'NONE') {
      state.players.forEach((p) => p.contactStatus = 'missing');
      save(KEYS.players, state.players);
      setVerifyStatus('success', 'Vérification Contacts', 'Aucun numéro n’a été trouvé dans les Contacts iPhone. Tous les joueurs ont été marqués « À créer ».');
      route('players');
      return;
    }

    let found = [];
    try {
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) {
        found = parsed.map((v) => typeof v === 'string' ? normalizePhone(v) : normalizePhone(v.phone || ''));
      } else if (parsed && typeof parsed === 'object') {
        found = Object.values(parsed).map((v) => typeof v === 'string' ? normalizePhone(v) : normalizePhone(v.phone || ''));
      }
    } catch {
      found = clean.split(/\r?\n/).map(normalizePhone).filter(Boolean);
    }

    const set = new Set(found.filter(Boolean));
    let count = 0;
    state.players.forEach((p) => {
      if (set.has(normalizePhone(p.phone))) {
        p.contactStatus = 'exists';
        count++;
      } else {
        p.contactStatus = 'missing';
      }
    });
    save(KEYS.players, state.players);
    setVerifyStatus('success', 'Vérification Contacts', `${count} contact(s) trouvé(s) dans l’iPhone. Les autres joueurs ont été marqués « À créer ».`);
    route('players');
  }

  function processUrlParams() {
    const params = new URLSearchParams(location.search);
    const shortcut = params.get('shortcut');
    const result = params.get('result');
    const pending = load(KEYS.pendingShortcut, null);

    if (shortcut) {
      if (shortcut === 'contacts') {
        applyVerifyResult(result);
      } else {
        hideOverlay();
        if (shortcut === 'messages') toast('Retour depuis le raccourci Messages.');
        if (shortcut === 'createContacts') toast('Retour depuis le raccourci Contacts.');
      }
      history.replaceState({}, document.title, location.pathname);
      localStorage.removeItem(KEYS.pendingShortcut);
      return;
    }

    if (pending && Date.now() - pending.at < 5 * 60 * 1000) {
      showOverlay('En attente du retour…', 'Si tu viens de lancer un raccourci, reviens simplement ici à la fin. Cette fenêtre disparaîtra automatiquement au retour.', true);
    }
  }

  $$('.nav-item').forEach((b) => b.addEventListener('click', () => route(b.dataset.route)));

  $('#fileInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    showOverlay('Import du fichier…', 'Lecture et traitement du fichier en cours.', false);
    try {
      const out = await importFile(file);
      hideOverlay();
      clearVerifyStatus();
      route('players');
      toast(`Import terminé : ${out.created} ajouté(s), ${out.updated} mis à jour.`, 3400);
    } catch (err) {
      hideOverlay();
      alert('Import impossible : ' + err.message);
    }
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstall = e;
    $('#installBtn').hidden = false;
  });

  $('#installBtn').addEventListener('click', async () => {
    if (!state.deferredInstall) return;
    state.deferredInstall.prompt();
    await state.deferredInstall.userChoice;
    state.deferredInstall = null;
    $('#installBtn').hidden = true;
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
  }

  processUrlParams();
  render();
  window.TCV = { state, route };
})();
