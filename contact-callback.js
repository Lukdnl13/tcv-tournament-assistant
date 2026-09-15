(() => {
  const CALLBACK_KEY = "tcv_contacts_callback_v1";
  const NOTICE_KEY = "tcv_contacts_notice_v1";
  const PLAYERS_KEY = "tcv_players_v1";

  const params = new URLSearchParams(location.search);
  const isContactsCallback = params.has("contactsCallback") || params.has("contactsError");

  if (isContactsCallback) {
    const payload = {
      error: params.has("contactsError"),
      result: params.get("result") || params.get("output") || params.get("shortcutOutput") || params.get("text") || ""
    };
    sessionStorage.setItem(CALLBACK_KEY, JSON.stringify(payload));
    history.replaceState({}, "", `${location.origin}${location.pathname}`);
  }

  const normalizePhone = value => {
    let s = String(value ?? "").trim().replace(/[^\d+]/g, "");
    if (s.startsWith("0033")) s = "+33" + s.slice(4);
    if (s.startsWith("0") && s.length >= 10) s = "+33" + s.slice(1);
    else if (/^[67]\d{8}$/.test(s)) s = "+33" + s;
    else if (/^33\d+/.test(s)) s = "+" + s;
    return s;
  };

  const parseBoolean = value => {
    if (typeof value === "boolean") return value;
    const s = String(value ?? "").trim().toLowerCase();
    return ["true", "1", "yes", "oui", "found", "exists"].includes(s);
  };

  const decodeResult = raw => {
    let value = String(raw ?? "").trim();
    if (!value) return "";
    for (let i = 0; i < 2; i++) {
      try {
        const decoded = decodeURIComponent(value);
        if (decoded === value) break;
        value = decoded;
      } catch {
        break;
      }
    }
    return value.trim();
  };

  const saveNotice = (type, message) => {
    sessionStorage.setItem(NOTICE_KEY, JSON.stringify({ type, message, at: Date.now() }));
  };

  const applyResult = raw => {
    if (typeof TCV === "undefined" || !TCV?.state?.players) return false;

    const players = TCV.state.players;
    const text = decodeResult(raw);

    if (!text) {
      saveNotice(
        "warn",
        "Le raccourci iPhone s'est bien ouvert, mais il n'a renvoyé aucune sortie. Dans Raccourcis, ajoute à la fin l'action « Arrêter ce raccourci et produire un résultat » et renvoie la liste des numéros trouvés."
      );
      TCV.route("players");
      return true;
    }

    if (["NONE", "AUCUN", "NO_MATCH", "0_RESULT"].includes(text.toUpperCase())) {
      players.forEach(player => {
        if (player.phone) player.contactStatus = "missing";
      });
      localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
      saveNotice("success", `Vérification terminée : 0 contact trouvé, ${players.filter(p => p.phone).length} à créer.`);
      TCV.route("players");
      return true;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    let found = 0;
    let missing = 0;

    if (Array.isArray(parsed) && parsed.some(item => item && typeof item === "object" && "id" in item)) {
      const byId = new Map(parsed.map(item => [String(item.id), parseBoolean(item.exists)]));
      for (const player of players) {
        if (!byId.has(String(player.id))) continue;
        const exists = byId.get(String(player.id));
        player.contactStatus = exists ? "exists" : "missing";
        exists ? found++ : missing++;
      }
    } else {
      let phones = [];
      if (Array.isArray(parsed)) {
        phones = parsed.map(item => {
          if (typeof item === "string" || typeof item === "number") return normalizePhone(item);
          if (item && typeof item === "object") return normalizePhone(item.phone || item.telephone || item.number || "");
          return "";
        }).filter(Boolean);
      } else if (parsed && Array.isArray(parsed.contacts)) {
        phones = parsed.contacts.map(item => normalizePhone(item.phone || item.telephone || item.number || item)).filter(Boolean);
      } else {
        phones = text.split(/[\n,;|]+/).map(normalizePhone).filter(Boolean);
      }

      const foundPhones = new Set(phones);
      for (const player of players) {
        if (!player.phone) continue;
        const exists = foundPhones.has(normalizePhone(player.phone));
        player.contactStatus = exists ? "exists" : "missing";
        exists ? found++ : missing++;
      }
    }

    localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
    saveNotice("success", `Vérification terminée : ${found} contact(s) trouvé(s), ${missing} à créer.`);
    TCV.route("players");
    return true;
  };

  const process = () => {
    const raw = sessionStorage.getItem(CALLBACK_KEY);
    if (!raw) return;
    if (typeof TCV === "undefined") {
      setTimeout(process, 50);
      return;
    }

    sessionStorage.removeItem(CALLBACK_KEY);
    try {
      const payload = JSON.parse(raw);
      if (payload.error) {
        saveNotice("warn", "Le raccourci Contacts a signalé une erreur. Vérifie qu'il existe et qu'il porte exactement le nom « TCV - Vérifier contacts ». ");
        TCV.route("players");
        return;
      }
      applyResult(payload.result);
    } catch (error) {
      saveNotice("warn", `Impossible de traiter le retour Contacts : ${error.message}`);
      TCV.route("players");
    }
  };

  const injectNotice = () => {
    if (typeof TCV === "undefined") return;
    const raw = sessionStorage.getItem(NOTICE_KEY);
    if (!raw) return;
    const view = document.getElementById("view");
    if (!view) return;
    const playersTitle = [...view.querySelectorAll("h3")].find(node => node.textContent.trim() === "Joueurs");
    if (!playersTitle || view.querySelector("#contactCallbackNotice")) return;

    try {
      const noticeData = JSON.parse(raw);
      const notice = document.createElement("div");
      notice.id = "contactCallbackNotice";
      notice.className = noticeData.type === "success" ? "notice success" : "notice warn";
      notice.style.marginBottom = "12px";
      notice.innerHTML = `<b>Contacts iPhone</b><br>${String(noticeData.message).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}`;
      const toolbar = view.querySelector(".toolbar");
      if (toolbar) toolbar.insertAdjacentElement("afterend", notice);
      else playersTitle.parentElement.insertAdjacentElement("afterend", notice);
    } catch {
      sessionStorage.removeItem(NOTICE_KEY);
    }
  };

  const observer = new MutationObserver(() => requestAnimationFrame(injectNotice));
  const view = document.getElementById("view");
  if (view) observer.observe(view, { childList: true, subtree: true });

  setTimeout(process, 0);
  setTimeout(injectNotice, 100);
})();
