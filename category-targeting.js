(() => {
  const PLAYERS_KEY = "tcv_players_v1";
  const CAMPAIGNS_KEY = "tcv_campaigns_v1";
  const HISTORY_KEY = "tcv_history_v1";
  const view = document.getElementById("view");
  if (!view) return;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));

  const normalizeCategory = value => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const categoryKind = category => {
    const value = normalizeCategory(category);
    if (!value) return "other";
    if (/\bseniors?\b/.test(value)) return "senior";

    const numbers = (value.match(/\d{1,2}/g) || []).map(Number).filter(Number.isFinite);
    if (numbers.length && Math.max(...numbers) <= 18) return "youth";
    return "other";
  };

  const categoryKindLabel = category => {
    const kind = categoryKind(category);
    if (kind === "senior") return "Senior";
    if (kind === "youth") return "Jeune";
    return "Autre catégorie";
  };

  const getPlayers = () => {
    if (typeof TCV !== "undefined" && Array.isArray(TCV?.state?.players)) return TCV.state.players;
    try {
      const stored = JSON.parse(localStorage.getItem(PLAYERS_KEY) || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  };

  const uniqueCategories = () => [...new Set(
    getPlayers().map(player => String(player.category || "").trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));

  const matchesAudience = (player, audience, exactCategory) => {
    if (audience === "all") return true;
    if (audience === "youth") return categoryKind(player.category) === "youth";
    if (audience === "senior") return categoryKind(player.category) === "senior";
    if (audience === "category") {
      return normalizeCategory(player.category) === normalizeCategory(exactCategory);
    }
    return true;
  };

  const statusPill = player => {
    if (player.contactStatus === "exists") return '<span class="pill green">✓ Dans Contacts</span>';
    if (player.contactStatus === "missing") return '<span class="pill orange">À créer</span>';
    return '<span class="pill gray">Non vérifié</span>';
  };

  const initials = player => `${(player.firstName || "")[0] || ""}${(player.lastName || "")[0] || ""}`.toUpperCase();

  const saveCampaign = campaign => {
    if (typeof TCV === "undefined") return;
    if (!Array.isArray(TCV.state.campaigns)) TCV.state.campaigns = [];
    TCV.state.campaigns.push(campaign);
    localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(TCV.state.campaigns));
  };

  const bindSelection = () => {
    view.querySelectorAll(".eligibleCheck").forEach(checkbox => {
      checkbox.addEventListener("change", () => {
        if (typeof TCV === "undefined") return;
        if (checkbox.checked) TCV.state.campaignSelection.add(checkbox.dataset.id);
        else TCV.state.campaignSelection.delete(checkbox.dataset.id);

        const card = view.querySelector(`[data-select-card="${CSS.escape(checkbox.dataset.id)}"]`);
        if (card) card.classList.toggle("selected", checkbox.checked);
        const pill = view.querySelector("#selectedPill");
        if (pill) pill.textContent = `${TCV.state.campaignSelection.size} sélectionnés`;
      });
    });
  };

  const renderEligible = players => {
    if (typeof TCV === "undefined") return "";
    TCV.state.currentEligible = players;
    TCV.state.campaignSelection = new Set(players.map(player => player.id));

    const cards = players.map(player => `
      <label class="player-card selected category-result-card" data-select-card="${esc(player.id)}">
        <div class="row">
          <input type="checkbox" class="eligibleCheck" data-id="${esc(player.id)}" checked>
          <div class="avatar">${esc(initials(player))}</div>
          <div class="grow">
            <div class="name">${esc(player.firstName)} ${esc(player.lastName)}</div>
            <div class="meta category-result-meta">
              <span class="pill blue">${esc(player.category || "Catégorie inconnue")}</span>
              <span class="pill ${categoryKind(player.category) === "senior" ? "green" : categoryKind(player.category) === "youth" ? "orange" : "gray"}">${esc(categoryKindLabel(player.category))}</span>
              ${player.ranking ? `<span class="pill gray">${esc(player.ranking)}</span>` : ""}
            </div>
            <div class="meta">${esc(player.club || "Club inconnu")} • <b>${esc(player.phone || "")}</b></div>
          </div>
          ${statusPill(player)}
        </div>
      </label>`).join("");

    return `
      <div class="section-head"><div><h3>Résultat du ciblage</h3><small>${players.length} joueur(s) éligible(s)</small></div></div>
      ${players.length ? `
        <div class="kpi-line">
          <span class="pill green">${players.length} éligibles</span>
          <span class="pill blue" id="selectedPill">${players.length} sélectionnés</span>
        </div>
        <div class="player-list">${cards}</div>
        <div class="bottom-actions category-actions">
          <button class="btn btn-orange btn-block" data-category-action="prepareMessage">Préparer la communication</button>
          <button class="btn btn-secondary btn-block" data-category-action="goContacts">Voir les Contacts</button>
        </div>
      ` : `<div class="empty">Aucun joueur ne correspond à cette catégorie MOJA.</div>`}
    `;
  };

  const openMessageComposer = () => {
    if (typeof TCV === "undefined") return;
    const selected = getPlayers().filter(player => TCV.state.campaignSelection.has(player.id));

    view.innerHTML = `
      <div class="section-head"><div><h3>Préparer le message</h3><small>${selected.length} destinataire(s)</small></div></div>
      <div class="card">
        <div class="notice success" style="margin-bottom:14px"><b>Public sélectionné depuis MOJA</b><br>Le ciblage utilise uniquement la colonne <b>Catégorie d'âge</b> du fichier Excel.</div>
        <div class="field"><label>Message</label>
          <textarea id="messageText">Bonjour,\n\nLe Tennis Club de Vitrolles vous informe d'une nouvelle actualité / compétition / animation. 🎾\n\nN'hésitez pas à nous contacter pour plus d'informations.\n\nSportivement,\nLe TC Vitrolles</textarea>
        </div>
        <div class="kpi-line"><span class="pill blue">${selected.length} destinataires</span><span class="pill green">${selected.filter(player => player.phone).length} téléphones</span></div>
        <button class="btn btn-orange btn-block" data-category-action="sendMessage">Ouvrir le raccourci Messages</button>
        <button class="btn btn-secondary btn-block" style="margin-top:8px" data-category-action="goContacts">Vérifier les contacts avant</button>
      </div>`;

    bindCategoryActions();
  };

  const sendMessage = () => {
    if (typeof TCV === "undefined") return;
    const selected = getPlayers().filter(player => TCV.state.campaignSelection.has(player.id) && player.phone);
    const message = view.querySelector("#messageText")?.value.trim();
    if (!selected.length) return alert("Aucun destinataire sélectionné.");
    if (!message) return alert("Écris un message.");

    const payload = {
      recipients: selected.map(player => ({
        name: `${player.firstName} ${player.lastName}`.trim(),
        phone: player.phone
      })),
      message
    };

    const shortcutName = TCV.state.settings?.messagesShortcut || "TCV - Envoyer messages";
    location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName)}&input=text&text=${encodeURIComponent(JSON.stringify(payload))}`;

    try {
      const history = Array.isArray(TCV.state.history) ? TCV.state.history : [];
      history.push({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        name: TCV.state.campaigns?.at(-1)?.name || "Communication TCV",
        date: new Date().toISOString(),
        count: selected.length
      });
      TCV.state.history = history;
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch {}
  };

  function bindCategoryActions() {
    view.querySelectorAll("[data-category-action='prepareMessage']").forEach(button => {
      button.onclick = () => {
        if (typeof TCV === "undefined" || !TCV.state.campaignSelection.size) return alert("Sélectionne au moins un joueur.");
        openMessageComposer();
      };
    });

    view.querySelectorAll("[data-category-action='goContacts']").forEach(button => {
      button.onclick = () => typeof TCV !== "undefined" && TCV.route("contacts");
    });

    view.querySelectorAll("[data-category-action='sendMessage']").forEach(button => {
      button.onclick = sendMessage;
    });
  }

  const installCategoryCampaign = () => {
    const originalForm = view.querySelector("#campaignForm");
    const eligibleArea = view.querySelector("#eligibleArea");
    if (!originalForm || !eligibleArea || originalForm.dataset.categoryTargeting === "1") return;

    const categories = uniqueCategories();
    const categoryOptions = categories.map(category => `<option value="${esc(category)}">${esc(category)}</option>`).join("");
    const card = originalForm.closest(".card");
    if (!card) return;

    card.innerHTML = `
      <form id="campaignForm" class="form-grid category-campaign-form" data-category-targeting="1" data-v2="1">
        <div class="field full"><label>Nom de la campagne</label><input id="campaignName" value="Communication Club"></div>

        <div class="field full">
          <label>Public de la campagne</label>
          <div class="audience-presets category-presets">
            <button type="button" class="audience-preset active" data-audience="all">Tous</button>
            <button type="button" class="audience-preset" data-audience="youth">Jeunes</button>
            <button type="button" class="audience-preset" data-audience="senior">Seniors</button>
            <button type="button" class="audience-preset" data-audience="category">Catégorie précise</button>
          </div>
          <select id="audience" hidden>
            <option value="all">Tous</option>
            <option value="youth">Jeunes</option>
            <option value="senior">Seniors</option>
            <option value="category">Catégorie précise</option>
          </select>
        </div>

        <div class="field full" id="exactCategoryField" hidden>
          <label>Catégorie d'âge MOJA</label>
          <select id="exactCategory">
            <option value="">Choisir une catégorie</option>
            ${categoryOptions}
          </select>
        </div>

        <div class="field full"><label>Sexe</label>
          <select id="gender">
            <option value="ALL">Tous</option>
            <option value="F">Filles / Femmes</option>
            <option value="H">Garçons / Hommes</option>
          </select>
        </div>

        <div class="audience-note field full">
          <b>Règle de ciblage :</b> aucune date de naissance et aucun âge manuel ne sont utilisés. Le groupe est déterminé uniquement à partir de la colonne <b>Catégorie d'âge</b> du fichier Excel MOJA. <b>Senior</b> = senior ; les catégories numériques jusqu'à 18 ans, par exemple <b>11-12 ans</b>, <b>13-14 ans</b>, <b>15-16 ans</b> ou <b>17-18 ans</b>, sont classées comme jeunes.
        </div>

        <div class="field full"><button class="btn btn-primary btn-block" type="submit">Trouver les joueurs éligibles</button></div>
      </form>`;

    view.querySelectorAll(".notice").forEach(notice => {
      if (notice.textContent.includes("date de naissance") || notice.textContent.includes("ciblage par âge")) notice.remove();
    });

    const form = view.querySelector("#campaignForm");
    const audienceInput = form.querySelector("#audience");
    const exactField = form.querySelector("#exactCategoryField");
    const exactCategory = form.querySelector("#exactCategory");
    const nameInput = form.querySelector("#campaignName");

    form.querySelectorAll(".audience-preset").forEach(button => {
      button.onclick = () => {
        form.querySelectorAll(".audience-preset").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        audienceInput.value = button.dataset.audience;
        exactField.hidden = button.dataset.audience !== "category";

        if (!nameInput.value.trim() || /^Communication (Club|Jeunes|Seniors)$/i.test(nameInput.value.trim())) {
          if (button.dataset.audience === "youth") nameInput.value = "Communication Jeunes";
          else if (button.dataset.audience === "senior") nameInput.value = "Communication Seniors";
          else nameInput.value = "Communication Club";
        }
      };
    });

    form.onsubmit = event => {
      event.preventDefault();
      const audience = audienceInput.value;
      const selectedCategory = exactCategory.value;
      const gender = form.querySelector("#gender").value;

      if (audience === "category" && !selectedCategory) {
        alert("Choisis une catégorie d'âge MOJA.");
        return;
      }

      const eligible = getPlayers().filter(player => {
        const categoryMatch = matchesAudience(player, audience, selectedCategory);
        const genderMatch = gender === "ALL" || !gender || player.gender === gender;
        return categoryMatch && genderMatch;
      });

      eligibleArea.innerHTML = renderEligible(eligible);
      bindSelection();
      bindCategoryActions();

      saveCampaign({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        name: nameInput.value.trim() || "Communication TCV",
        audience,
        category: audience === "category" ? selectedCategory : "",
        gender,
        date: new Date().toISOString()
      });
    };
  };

  const cleanAgeReferences = () => {
    view.querySelectorAll(".meta").forEach(meta => {
      if (meta.textContent.trim() === "Âge • sexe • catégorie") meta.textContent = "Catégorie MOJA • sexe";
    });

    view.querySelectorAll(".action").forEach(action => {
      const title = action.querySelector("strong")?.textContent.trim();
      const small = action.querySelector("small");
      if (title === "Créer une campagne" && small) small.textContent = "Ciblage depuis la catégorie MOJA";
    });
  };

  const enhance = () => {
    if (typeof TCV === "undefined") return;
    cleanAgeReferences();
    installCategoryCampaign();
  };

  new MutationObserver(() => requestAnimationFrame(enhance))
    .observe(view, { childList: true, subtree: true });

  window.addEventListener("pageshow", enhance);
  setTimeout(enhance, 0);
  setTimeout(enhance, 250);
})();
