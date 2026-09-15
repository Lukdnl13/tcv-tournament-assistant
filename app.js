
const TCV = (() => {
  const KEYS = {
    players: "tcv_players_v1",
    campaigns: "tcv_campaigns_v1",
    history: "tcv_history_v1",
    settings: "tcv_settings_v1"
  };

  const state = {
    route: "home",
    players: load(KEYS.players, []),
    campaigns: load(KEYS.campaigns, []),
    history: load(KEYS.history, []),
    settings: load(KEYS.settings, {
      contactsShortcut: "TCV - Créer contacts",
      messagesShortcut: "TCV - Envoyer messages"
    }),
    campaignSelection: new Set(),
    currentEligible: [],
    deferredInstall: null
  };

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function esc(s="") {
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[c]));
  }

  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  }

  function initials(p) {
    return `${(p.firstName||"")[0]||""}${(p.lastName||"")[0]||""}`.toUpperCase();
  }

  function normalizePhone(raw="") {
    let s = String(raw).trim().replace(/[^\d+]/g, "");
    if (s.startsWith("0033")) s = "+33" + s.slice(4);
    if (s.startsWith("0") && s.length >= 10) s = "+33" + s.slice(1);
    if (/^33\d+/.test(s)) s = "+" + s;
    return s;
  }

  function parseDate(raw="") {
    const s = String(raw).trim();
    if (!s) return "";
    const fr = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (fr) {
      const d = new Date(Date.UTC(+fr[3], +fr[2]-1, +fr[1]));
      return isNaN(d) ? "" : d.toISOString().slice(0,10);
    }
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(s);
    return iso ? s : "";
  }

  function ageFromBirthDate(iso) {
    if (!iso) return null;
    const b = new Date(iso + "T00:00:00Z");
    if (isNaN(b)) return null;
    const now = new Date();
    let age = now.getUTCFullYear() - b.getUTCFullYear();
    const m = now.getUTCMonth() - b.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
    return age >= 0 && age < 120 ? age : null;
  }

  function genderNorm(v="") {
    const s = String(v).trim().toLowerCase();
    if (["f","femme","fille","female"].includes(s)) return "F";
    if (["h","m","homme","garçon","garcon","male"].includes(s)) return "H";
    return "";
  }

  function detectDelimiter(line) {
    const semis = (line.match(/;/g)||[]).length;
    const commas = (line.match(/,/g)||[]).length;
    return semis >= commas ? ";" : ",";
  }

  function parseCsv(text) {
    const firstLine = (text.split(/\r?\n/)[0] || "");
    const delimiter = detectDelimiter(firstLine);
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i=0; i<text.length; i++) {
      const ch = text[i], next = text[i+1];
      if (ch === '"') {
        if (quoted && next === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === delimiter && !quoted) {
        row.push(cell); cell = "";
      } else if ((ch === "\n" || ch === "\r") && !quoted) {
        if (ch === "\r" && next === "\n") i++;
        row.push(cell); cell = "";
        if (row.some(x => String(x).trim() !== "")) rows.push(row);
        row = [];
      } else cell += ch;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function normHeader(h="") {
    return h.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLowerCase().trim().replace(/[^a-z0-9]/g,"");
  }

  function mapHeaders(headers) {
    const aliases = {
      firstName:["prenom","firstname","joueurprenom"],
      lastName:["nom","lastname","nomjoueur"],
      phone:["telephone","tel","portable","mobile","gsm","numerotelephone"],
      birthDate:["datedenaissance","naissance","birthdate","datenaissance"],
      birthYear:["anneedenaissance","anneenaissance","birthyear"],
      gender:["sexe","genre","gender"],
      ranking:["classement","ranking","classementfft"],
      club:["club","nomclub"],
      category:["categorie","categoriedage","category"]
    };
    const map = {};
    headers.forEach((h, i) => {
      const n = normHeader(h);
      for (const [key, list] of Object.entries(aliases)) {
        if (!map[key] && list.includes(n)) map[key] = i;
      }
    });
    return map;
  }

  function importCsvText(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("Le fichier ne contient pas assez de lignes.");
    const headers = rows[0];
    const map = mapHeaders(headers);
    if (map.lastName === undefined || map.phone === undefined) {
      throw new Error("Colonnes minimales non trouvées : Nom et Téléphone.");
    }

    let created = 0, updated = 0, skipped = 0;
    for (const r of rows.slice(1)) {
      const lastName = (r[map.lastName]||"").trim();
      const firstName = map.firstName !== undefined ? (r[map.firstName]||"").trim() : "";
      const phone = normalizePhone(r[map.phone]||"");
      if (!lastName || !phone) { skipped++; continue; }

      let birthDate = map.birthDate !== undefined ? parseDate(r[map.birthDate]||"") : "";
      if (!birthDate && map.birthYear !== undefined) {
        const y = parseInt(r[map.birthYear], 10);
        if (y > 1900 && y <= new Date().getFullYear()) birthDate = `${y}-07-01`;
      }

      const player = {
        id: uid(),
        firstName,
        lastName,
        phone,
        birthDate,
        gender: map.gender !== undefined ? genderNorm(r[map.gender]) : "",
        ranking: map.ranking !== undefined ? (r[map.ranking]||"").trim() : "",
        club: map.club !== undefined ? (r[map.club]||"").trim() : "",
        category: map.category !== undefined ? (r[map.category]||"").trim() : "",
        contactStatus: "unknown",
        importedAt: new Date().toISOString()
      };

      const existing = state.players.find(p => normalizePhone(p.phone) === phone);
      if (existing) {
        Object.assign(existing, {...player, id: existing.id, contactStatus: existing.contactStatus || "unknown"});
        updated++;
      } else {
        state.players.push(player);
        created++;
      }
    }
    save(KEYS.players, state.players);
    return {created, updated, skipped, total: state.players.length};
  }

  function addDemo() {
    if (state.players.length && !confirm("La base contient déjà des joueurs. Ajouter quand même les joueurs de démonstration ?")) return;
    const demo = [
      ["Emma","MARTIN","+33612345610","2012-05-12","F","15/2","TC Vitrolles","13/14"],
      ["Lucas","DUPONT","+33612345611","2010-08-04","H","15/1","TC Marseille","15/16"],
      ["Hugo","DURAND","+33722456103","2013-02-17","H","30","TC Aix","13/14"],
      ["Léa","ROBERT","+33642157621","2008-09-10","F","5/6","TC Vitrolles","17/18"],
      ["Julie","GARCIA","+33672443920","1994-03-02","F","5/6","TC Aix","Senior"]
    ].map(d => ({
      id:uid(),firstName:d[0],lastName:d[1],phone:d[2],birthDate:d[3],gender:d[4],
      ranking:d[5],club:d[6],category:d[7],contactStatus:"unknown",importedAt:new Date().toISOString()
    }));
    for (const p of demo) {
      if (!state.players.some(x => normalizePhone(x.phone) === p.phone)) state.players.push(p);
    }
    save(KEYS.players,state.players);
    render();
  }

  function route(name) {
    state.route = name;
    document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.route === name));
    render();
    scrollTo({top:0, behavior:"smooth"});
  }

  function render() {
    const view = document.getElementById("view");
    const routes = {
      home: renderHome,
      players: renderPlayers,
      campaign: renderCampaign,
      contacts: renderContacts,
      history: renderHistory
    };
    view.innerHTML = (routes[state.route] || renderHome)();
    bindView();
  }

  function renderHome() {
    const total = state.players.length;
    const knownContacts = state.players.filter(p => p.contactStatus === "exists").length;
    const toCreate = state.players.filter(p => p.contactStatus === "missing").length;
    return `
      <section class="hero">
        <img class="logo-large" src="assets/tcv-logo.png" alt="">
        <h2>Vos tournois,<br>vos joueurs, vos messages.</h2>
        <p>Importez MOJA, ciblez les bons joueurs et préparez vos communications depuis votre iPhone.</p>
      </section>

      <div class="stats">
        <div class="stat"><b>${total}</b><span>joueurs</span></div>
        <div class="stat"><b>${knownContacts}</b><span>contacts OK</span></div>
        <div class="stat"><b>${toCreate}</b><span>à créer</span></div>
      </div>

      <section class="section">
        <div class="section-head"><h3>Actions rapides</h3></div>
        <div class="actions">
          <button class="action blue" data-action="import"><span class="action-icon">⇩</span><span><strong>Importer MOJA</strong><small>CSV exporté depuis MOJA</small></span><span class="arrow">›</span></button>
          <button class="action green" data-action="players"><span class="action-icon">👥</span><span><strong>Voir les joueurs</strong><small>Base locale sur cet appareil</small></span><span class="arrow">›</span></button>
          <button class="action orange" data-action="campaign"><span class="action-icon">✈</span><span><strong>Créer une campagne</strong><small>Filtrer par âge et sexe</small></span><span class="arrow">›</span></button>
        </div>
      </section>

      <section class="section">
        <div class="card">
          <div class="section-head"><h3>Parcours V1</h3><small>100 % gratuit</small></div>
          <div class="row"><span class="pill blue">1</span><div><b>Import</b><div class="meta">MOJA CSV → base locale</div></div></div><hr>
          <div class="row"><span class="pill blue">2</span><div><b>Ciblage</b><div class="meta">Âge • sexe • catégorie</div></div></div><hr>
          <div class="row"><span class="pill green">3</span><div><b>Contacts</b><div class="meta">Préparation pour Raccourcis iOS</div></div></div><hr>
          <div class="row"><span class="pill orange">4</span><div><b>Messages</b><div class="meta">Liste + texte transmis à Raccourcis</div></div></div>
        </div>
      </section>
    `;
  }

  function renderPlayers() {
    const cards = state.players.map(p => {
      const age = ageFromBirthDate(p.birthDate);
      const status = p.contactStatus === "exists"
        ? `<span class="pill green">✓ Contact</span>`
        : p.contactStatus === "missing"
          ? `<span class="pill orange">À créer</span>`
          : `<span class="pill gray">Non vérifié</span>`;
      return `
        <article class="player-card" data-search="${esc(`${p.firstName} ${p.lastName} ${p.phone} ${p.club}`.toLowerCase())}">
          <div class="row">
            <div class="avatar">${esc(initials(p))}</div>
            <div class="grow">
              <div class="name">${esc(p.firstName)} ${esc(p.lastName)}</div>
              <div class="meta">${age === null ? "Âge inconnu" : `${age} ans`} • ${esc(p.category || "Catégorie inconnue")} • ${esc(p.ranking || "NC")}</div>
              <div class="meta">${esc(p.club || "Club inconnu")} • ${esc(p.phone)}</div>
            </div>
            ${status}
          </div>
        </article>`;
    }).join("");

    return `
      <div class="section-head"><div><h3>Joueurs</h3><small>${state.players.length} dans la base locale</small></div></div>
      <div class="toolbar">
        <input id="searchPlayers" class="search" type="search" placeholder="Nom, club ou téléphone">
        <button class="btn btn-primary" data-action="import">Importer</button>
      </div>
      <div class="kpi-line">
        <button class="btn btn-secondary" data-action="demo">Ajouter démo</button>
        <button class="btn btn-danger" data-action="clearPlayers">Vider la base</button>
      </div>
      <div id="playerList" class="player-list">${cards || `<div class="empty">Aucun joueur. Importe un CSV MOJA ou utilise « Ajouter démo ».</div>`}</div>
    `;
  }

  function playerEligible(p, minAge, maxAge, gender) {
    const age = ageFromBirthDate(p.birthDate);
    if (age === null) return false;
    if (age < minAge || age > maxAge) return false;
    if (gender && gender !== "ALL" && p.gender !== gender) return false;
    return true;
  }

  function renderCampaign() {
    return `
      <div class="section-head"><div><h3>Nouvelle campagne</h3><small>Ciblage automatique</small></div></div>
      <div class="card">
        <form id="campaignForm" class="form-grid">
          <div class="field full"><label>Nom de la campagne</label><input id="campaignName" value="Tournoi Jeunes 11/18 ans"></div>
          <div class="field"><label>Âge minimum</label><input id="minAge" type="number" min="5" max="99" value="11"></div>
          <div class="field"><label>Âge maximum</label><input id="maxAge" type="number" min="5" max="99" value="18"></div>
          <div class="field full"><label>Sexe</label>
            <select id="gender"><option value="ALL">Tous</option><option value="F">Filles / Femmes</option><option value="H">Garçons / Hommes</option></select>
          </div>
          <div class="field full"><button class="btn btn-primary btn-block" type="submit">Trouver les joueurs éligibles</button></div>
        </form>
      </div>
      <section class="section">
        <div class="notice">Les joueurs sans date de naissance exploitable sont exclus automatiquement du ciblage par âge.</div>
      </section>
      <section id="eligibleArea" class="section"></section>
    `;
  }

  function buildEligibleResult(minAge, maxAge, gender) {
    state.currentEligible = state.players.filter(p => playerEligible(p, minAge, maxAge, gender));
    state.campaignSelection = new Set(state.currentEligible.map(p => p.id));
    return eligibleHtml();
  }

  function eligibleHtml() {
    const list = state.currentEligible.map(p => {
      const age = ageFromBirthDate(p.birthDate);
      return `
        <label class="player-card selected" data-select-card="${p.id}">
          <div class="row">
            <input type="checkbox" class="eligibleCheck" data-id="${p.id}" checked>
            <div class="avatar">${esc(initials(p))}</div>
            <div class="grow"><div class="name">${esc(p.firstName)} ${esc(p.lastName)}</div><div class="meta">${age} ans • ${esc(p.ranking||"NC")} • ${esc(p.phone)}</div></div>
          </div>
        </label>`;
    }).join("");

    return `
      <div class="section-head"><div><h3>Résultat du ciblage</h3><small>${state.currentEligible.length} éligible(s)</small></div></div>
      ${state.currentEligible.length ? `
        <div class="kpi-line"><span class="pill green">${state.currentEligible.length} éligibles</span><span class="pill blue" id="selectedPill">${state.campaignSelection.size} sélectionnés</span></div>
        <div class="player-list">${list}</div>
        <div class="bottom-actions">
          <button class="btn btn-orange btn-block" data-action="prepareMessage">Préparer la communication</button>
        </div>
      ` : `<div class="empty">Aucun joueur ne correspond à ces critères.</div>`}
    `;
  }

  function renderContacts() {
    const selected = state.players.filter(p => state.campaignSelection.has(p.id));
    const rows = selected.map(p => `
      <article class="player-card">
        <div class="row-between">
          <div><div class="name">${esc(p.firstName)} ${esc(p.lastName)}</div><div class="meta">${esc(p.phone)}</div></div>
          <select class="contactStatus" data-id="${p.id}">
            <option value="unknown" ${p.contactStatus==="unknown"?"selected":""}>Non vérifié</option>
            <option value="exists" ${p.contactStatus==="exists"?"selected":""}>Existe</option>
            <option value="missing" ${p.contactStatus==="missing"?"selected":""}>À créer</option>
          </select>
        </div>
      </article>`).join("");

    const missing = selected.filter(p => p.contactStatus === "missing");
    const payload = missing.map(p => ({firstName:p.firstName,lastName:p.lastName,phone:p.phone,club:p.club}));
    return `
      <div class="section-head"><div><h3>Contacts</h3><small>${selected.length} joueur(s) de la campagne</small></div></div>
      ${selected.length ? `
        <div class="notice warn">Une PWA ne peut pas lire librement tes Contacts iPhone. Dans cette V1, tu marques les correspondances puis tu transmets les contacts manquants au raccourci iOS.</div>
        <div class="section player-list">${rows}</div>
        <section class="section card">
          <h3>Créer les contacts manquants</h3>
          <p class="meta">${missing.length} contact(s) marqué(s) « À créer ».</p>
          <button class="btn btn-green btn-block" data-action="runContactsShortcut" ${missing.length ? "" : "disabled"}>Ouvrir le raccourci Contacts</button>
          <details style="margin-top:12px"><summary>Données transmises</summary><div class="codebox">${esc(JSON.stringify(payload,null,2))}</div></details>
        </section>
      ` : `<div class="empty">Crée d'abord une campagne et sélectionne les joueurs.</div>`}
    `;
  }

  function renderMessageComposer() {
    const selected = state.players.filter(p => state.campaignSelection.has(p.id));
    return `
      <div class="section-head"><div><h3>Préparer le message</h3><small>${selected.length} destinataire(s)</small></div></div>
      <div class="card">
        <div class="field"><label>Message</label>
          <textarea id="messageText">Bonjour,\n\nLe Tennis Club de Vitrolles organise son tournoi jeunes 11/18 ans ! 🎾\n\nNous serions ravis de vous y voir. N'hésitez pas à vous inscrire.\n\nSportivement,\nLe TC Vitrolles</textarea>
        </div>
        <div class="kpi-line"><span class="pill blue">${selected.length} destinataires</span><span class="pill green">${selected.filter(p=>p.phone).length} téléphones</span></div>
        <button class="btn btn-orange btn-block" data-action="runMessagesShortcut">Ouvrir le raccourci Messages</button>
        <button class="btn btn-secondary btn-block" style="margin-top:8px" data-action="goContacts">Vérifier les contacts avant</button>
        <div class="notice" style="margin-top:12px">Conseil : pour respecter la confidentialité des numéros, privilégie un envoi individuel automatisé par le raccourci plutôt qu'un groupe visible par tous.</div>
      </div>
    `;
  }

  function renderHistory() {
    const items = [...state.history].reverse().map(h => `
      <div class="card">
        <div class="row-between"><div><div class="name">${esc(h.name)}</div><div class="meta">${new Date(h.date).toLocaleString("fr-FR")}</div></div><span class="pill blue">${h.count} destinataires</span></div>
      </div>`).join("");
    return `
      <div class="section-head"><div><h3>Historique</h3><small>Campagnes préparées sur cet appareil</small></div></div>
      ${items || `<div class="empty">Aucune campagne enregistrée.</div>`}
    `;
  }

  function bindView() {
    document.querySelectorAll("[data-action='import']").forEach(b => b.onclick = () => document.getElementById("fileInput").click());
    document.querySelectorAll("[data-action='players']").forEach(b => b.onclick = () => route("players"));
    document.querySelectorAll("[data-action='campaign']").forEach(b => b.onclick = () => route("campaign"));
    document.querySelectorAll("[data-action='demo']").forEach(b => b.onclick = addDemo);
    document.querySelectorAll("[data-action='clearPlayers']").forEach(b => b.onclick = () => {
      if (confirm("Supprimer tous les joueurs de la base locale ?")) {
        state.players = []; state.campaignSelection.clear(); state.currentEligible = [];
        save(KEYS.players, state.players); render();
      }
    });

    const search = document.getElementById("searchPlayers");
    if (search) search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      document.querySelectorAll(".player-card[data-search]").forEach(c => {
        c.hidden = q && !c.dataset.search.includes(q);
      });
    };

    const form = document.getElementById("campaignForm");
    if (form) form.onsubmit = e => {
      e.preventDefault();
      let min = Math.max(0, parseInt(document.getElementById("minAge").value,10) || 0);
      let max = Math.max(0, parseInt(document.getElementById("maxAge").value,10) || 120);
      if (min > max) [min,max] = [max,min];
      const gender = document.getElementById("gender").value;
      document.getElementById("eligibleArea").innerHTML = buildEligibleResult(min,max,gender);
      bindEligibleChecks();
      const name = document.getElementById("campaignName").value.trim() || "Campagne TCV";
      state.campaigns.push({id:uid(),name,minAge:min,maxAge:max,gender,date:new Date().toISOString()});
      save(KEYS.campaigns,state.campaigns);
    };

    bindEligibleChecks();

    document.querySelectorAll("[data-action='prepareMessage']").forEach(b => b.onclick = () => {
      if (!state.campaignSelection.size) return alert("Sélectionne au moins un joueur.");
      document.getElementById("view").innerHTML = renderMessageComposer();
      bindView();
    });

    document.querySelectorAll("[data-action='goContacts']").forEach(b => b.onclick = () => route("contacts"));

    document.querySelectorAll(".contactStatus").forEach(sel => sel.onchange = () => {
      const p = state.players.find(x => x.id === sel.dataset.id);
      if (p) p.contactStatus = sel.value;
      save(KEYS.players,state.players);
      render();
    });

    document.querySelectorAll("[data-action='runContactsShortcut']").forEach(b => b.onclick = () => runContactsShortcut());
    document.querySelectorAll("[data-action='runMessagesShortcut']").forEach(b => b.onclick = () => runMessagesShortcut());
  }

  function bindEligibleChecks() {
    document.querySelectorAll(".eligibleCheck").forEach(cb => cb.onchange = () => {
      if (cb.checked) state.campaignSelection.add(cb.dataset.id);
      else state.campaignSelection.delete(cb.dataset.id);
      const card = document.querySelector(`[data-select-card="${cb.dataset.id}"]`);
      if (card) card.classList.toggle("selected", cb.checked);
      const pill = document.getElementById("selectedPill");
      if (pill) pill.textContent = `${state.campaignSelection.size} sélectionnés`;
    });
  }

  function launchShortcut(name, payload) {
    const text = JSON.stringify(payload);
    const url = `shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=${encodeURIComponent(text)}`;
    location.href = url;
  }

  function runContactsShortcut() {
    const selected = state.players.filter(p => state.campaignSelection.has(p.id) && p.contactStatus === "missing");
    if (!selected.length) return alert("Aucun contact marqué « À créer ».");
    const payload = selected.map(p => ({
      firstName:p.firstName, lastName:p.lastName, phone:p.phone, club:p.club
    }));
    launchShortcut(state.settings.contactsShortcut, payload);
  }

  function runMessagesShortcut() {
    const selected = state.players.filter(p => state.campaignSelection.has(p.id) && p.phone);
    if (!selected.length) return alert("Aucun destinataire sélectionné.");
    const msg = document.getElementById("messageText")?.value.trim();
    if (!msg) return alert("Écris un message.");
    const payload = {
      recipients:selected.map(p => ({name:`${p.firstName} ${p.lastName}`, phone:p.phone})),
      message:msg
    };
    launchShortcut(state.settings.messagesShortcut, payload);
    state.history.push({
      id:uid(),
      name: state.campaigns.at(-1)?.name || "Campagne TCV",
      date:new Date().toISOString(),
      count:selected.length
    });
    save(KEYS.history,state.history);
  }

  document.querySelectorAll(".nav-item").forEach(b => b.addEventListener("click", () => route(b.dataset.route)));

  document.getElementById("fileInput").addEventListener("change", async e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const result = importCsvText(await file.text());
      alert(`Import terminé :\n${result.created} nouveau(x)\n${result.updated} mis à jour\n${result.skipped} ignoré(s)\n\nBase : ${result.total} joueurs`);
      route("players");
    } catch (err) {
      alert("Import impossible : " + err.message);
    }
  });

  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    state.deferredInstall = e;
    const btn = document.getElementById("installBtn");
    if (btn) btn.hidden = false;
  });

  document.getElementById("installBtn").addEventListener("click", async () => {
    if (!state.deferredInstall) return;
    state.deferredInstall.prompt();
    await state.deferredInstall.userChoice;
    state.deferredInstall = null;
    document.getElementById("installBtn").hidden = true;
  });

  if ("serviceWorker" in navigator) {
    addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(()=>{}));
  }

  render();
  return {route, state};
})();
