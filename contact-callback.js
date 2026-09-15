(() => {
  const PLAYERS_KEY = "tcv_players_v1";
  const PENDING_KEY = "tcv_contacts_pending_v1";
  const NOTICE_KEY = "tcv_contacts_notice_v2";
  const CALLBACK_KEY = "tcv_contacts_last_callback_v1";

  const normalizePhone = value => {
    let s = String(value ?? "").trim().replace(/[^\d+]/g, "");
    if (s.startsWith("0033")) s = "+33" + s.slice(4);
    if (s.startsWith("0") && s.length >= 10) s = "+33" + s.slice(1);
    else if (/^[67]\d{8}$/.test(s)) s = "+33" + s;
    else if (/^33\d+/.test(s)) s = "+" + s;
    return s;
  };

  const decodeResult = raw => {
    let value = String(raw ?? "").trim();
    if (!value) return "";
    for (let i = 0; i < 2; i++) {
      try {
        const decoded = decodeURIComponent(value);
        if (decoded === value) break;
        value = decoded;
      } catch { break; }
    }
    return value.trim();
  };

  const saveNotice = (type, message) => {
    localStorage.setItem(NOTICE_KEY, JSON.stringify({ type, message, at: Date.now() }));
  };

  const getPlayers = () => {
    try {
      const players = JSON.parse(localStorage.getItem(PLAYERS_KEY) || "[]");
      return Array.isArray(players) ? players : [];
    } catch { return []; }
  };

  const syncTCV = players => {
    try {
      if (typeof TCV !== "undefined") {
        TCV.state.players = players;
        TCV.route("players");
      }
    } catch {}
  };

  const parseFoundPhones = text => {
    if (!text) return { none: false, phones: [] };
    const upper = text.toUpperCase();
    if (["NONE", "AUCUN", "NO_MATCH", "0_RESULT"].includes(upper)) return { none: true, phones: [] };

    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}

    if (Array.isArray(parsed)) {
      const phones = parsed.map(item => {
        if (typeof item === "string" || typeof item === "number") return normalizePhone(item);
        if (item && typeof item === "object") return normalizePhone(item.phone || item.telephone || item.number || "");
        return "";
      }).filter(Boolean);
      return { none: false, phones };
    }

    if (parsed && Array.isArray(parsed.contacts)) {
      const phones = parsed.contacts.map(item => normalizePhone(item.phone || item.telephone || item.number || item)).filter(Boolean);
      return { none: false, phones };
    }

    const phones = text.split(/[\n,;|]+/).map(normalizePhone).filter(Boolean);
    return { none: false, phones };
  };

  const applyResult = raw => {
    const text = decodeResult(raw);
    const players = getPlayers();

    if (!text) {
      saveNotice(
        "warn",
        "Le raccourci est revenu vers TCV Assistant, mais aucune sortie n’a été reçue. Vérifie que la dernière action du raccourci est « Arrêter ce raccourci et produire un résultat » avec le texte combiné (ou NONE)."
      );
      syncTCV(players);
      return;
    }

    if (!players.length) {
      saveNotice(
        "warn",
        `Un résultat a bien été reçu du raccourci (${text.slice(0, 80)}), mais cette page n’a pas accès à la base joueurs. Si le retour s’est ouvert dans Safari, reviens dans l’icône TCV Assistant et relance le test.`
      );
      return;
    }

    const parsed = (() => { try { return JSON.parse(text); } catch { return null; } })();
    let found = 0;
    let missing = 0;

    if (Array.isArray(parsed) && parsed.some(item => item && typeof item === "object" && "id" in item)) {
      const byId = new Map(parsed.map(item => [String(item.id), Boolean(item.exists)]));
      for (const player of players) {
        if (!player.phone) continue;
        const has = byId.has(String(player.id));
        const exists = has ? byId.get(String(player.id)) : false;
        player.contactStatus = exists ? "exists" : "missing";
        exists ? found++ : missing++;
      }
    } else {
      const { none, phones } = parseFoundPhones(text);
      const foundPhones = new Set(phones.map(normalizePhone));
      for (const player of players) {
        if (!player.phone) continue;
        const exists = none ? false : foundPhones.has(normalizePhone(player.phone));
        player.contactStatus = exists ? "exists" : "missing";
        exists ? found++ : missing++;
      }
    }

    localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
    saveNotice("success", `Vérification terminée : ${found} contact(s) trouvé(s), ${missing} à créer.`);
    syncTCV(players);
  };

  const params = new URLSearchParams(location.search);
  const isReturn = params.has("contactsCallback") || params.has("contactsError") || params.has("contactsCancel");

  if (isReturn) {
    const token = params.get("token") || "";
    const result = params.get("result") || params.get("output") || params.get("shortcutOutput") || params.get("text") || "";
    const error = params.has("contactsError");
    const cancelled = params.has("contactsCancel");

    localStorage.setItem(CALLBACK_KEY, JSON.stringify({ token, at: Date.now(), result, error, cancelled }));
    localStorage.removeItem(PENDING_KEY);
    history.replaceState({}, "", `${location.origin}${location.pathname}`);

    setTimeout(() => {
      if (error) {
        saveNotice("warn", "Le raccourci a renvoyé une erreur pendant la vérification des contacts.");
        syncTCV(getPlayers());
      } else if (cancelled) {
        saveNotice("warn", "La vérification Contacts a été annulée.");
        syncTCV(getPlayers());
      } else {
        applyResult(result);
      }
    }, 50);
  }

  const injectNotice = () => {
    let data;
    try { data = JSON.parse(localStorage.getItem(NOTICE_KEY) || "null"); } catch { data = null; }
    if (!data) return;
    const view = document.getElementById("view");
    if (!view) return;
    const title = [...view.querySelectorAll("h3")].find(el => el.textContent.trim() === "Joueurs");
    if (!title) return;
    let box = view.querySelector("#contactsShortcutStatus");
    if (!box) {
      box = document.createElement("div");
      box.id = "contactsShortcutStatus";
      const toolbar = view.querySelector(".toolbar");
      if (toolbar) toolbar.insertAdjacentElement("afterend", box);
      else title.parentElement.insertAdjacentElement("afterend", box);
    }
    box.className = data.type === "success" ? "notice success" : "notice warn";
    box.style.marginBottom = "12px";
    box.innerHTML = `<b>Vérification Contacts</b><br>${String(data.message).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}`;
  };

  const view = document.getElementById("view");
  if (view) new MutationObserver(() => requestAnimationFrame(injectNotice)).observe(view, { childList: true, subtree: true });
  window.addEventListener("pageshow", () => setTimeout(injectNotice, 50));
  window.addEventListener("focus", () => setTimeout(injectNotice, 50));
  setTimeout(injectNotice, 100);
})();
