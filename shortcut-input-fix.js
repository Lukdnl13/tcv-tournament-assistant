(() => {
  const SHORTCUT_NAME = "TCV - Vérifier contacts";
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

  const getPlayers = () => {
    try {
      if (typeof TCV !== "undefined" && Array.isArray(TCV?.state?.players)) return TCV.state.players;
    } catch {}
    try {
      const stored = JSON.parse(localStorage.getItem(PLAYERS_KEY) || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  };

  const saveNotice = (type, message) => {
    localStorage.setItem(NOTICE_KEY, JSON.stringify({ type, message, at: Date.now() }));
  };

  const showNotice = () => {
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

  const runShortcut = () => {
    const players = getPlayers();
    if (!players.length) {
      alert("Aucun joueur n'est chargé. Importe d'abord la liste des joueurs MOJA, puis réessaie.");
      return;
    }

    const payload = {};
    const phones = [];
    for (const player of players) {
      if (!player.phone) continue;
      const phone = normalizePhone(player.phone);
      if (!phone) continue;
      phones.push(phone);
      const key = String(player.id || Object.keys(payload).length);
      payload[key] = {
        id: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        category: player.category,
        phone
      };
    }

    if (!Object.keys(payload).length) {
      alert("Aucun numéro de téléphone exploitable n'a été trouvé dans la liste importée.");
      return;
    }

    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(PENDING_KEY, JSON.stringify({ token, startedAt: Date.now(), count: phones.length, phones }));
    saveNotice("warn", `Vérification lancée pour ${phones.length} joueur(s)… Retour attendu du raccourci iPhone.`);
    showNotice();

    const baseUrl = `${location.origin}${location.pathname}`;
    const successUrl = `${baseUrl}?contactsCallback=1&token=${encodeURIComponent(token)}`;
    const url =
      `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}` +
      `&input=text&text=${encodeURIComponent(JSON.stringify(payload))}` +
      `&x-success=${encodeURIComponent(successUrl)}` +
      `&x-cancel=${encodeURIComponent(baseUrl + "?contactsCancel=1&token=" + encodeURIComponent(token))}` +
      `&x-error=${encodeURIComponent(baseUrl + "?contactsError=1&token=" + encodeURIComponent(token))}`;

    location.href = url;
  };

  const replaceCheckButton = () => {
    const button = document.querySelector("[data-action='checkIphoneContacts']");
    if (!button) return;
    if (button.dataset.dictionaryPayload === "2") {
      button.disabled = false;
      return;
    }
    const replacement = button.cloneNode(true);
    replacement.dataset.dictionaryPayload = "2";
    replacement.disabled = false;
    replacement.removeAttribute("disabled");
    replacement.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      runShortcut();
    });
    button.replaceWith(replacement);
  };

  const diagnosePendingReturn = () => {
    let pending;
    try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "null"); } catch { pending = null; }
    if (!pending?.startedAt) return;
    const age = Date.now() - pending.startedAt;
    if (age < 2500) return;

    let callback;
    try { callback = JSON.parse(localStorage.getItem(CALLBACK_KEY) || "null"); } catch { callback = null; }
    if (callback?.token === pending.token && callback?.at >= pending.startedAt) return;

    saveNotice(
      "warn",
      "Le raccourci s’est terminé mais TCV Assistant n’a pas reçu son résultat. Cela signifie soit que le raccourci ne produit pas de résultat à la fin, soit que le retour s’est ouvert dans Safari au lieu de la web app."
    );
    try { if (typeof TCV !== "undefined") TCV.route("players"); } catch {}
    setTimeout(showNotice, 50);
  };

  const view = document.getElementById("view");
  if (view) {
    new MutationObserver(() => requestAnimationFrame(() => {
      replaceCheckButton();
      showNotice();
    })).observe(view, { childList: true, subtree: true });
  }

  const onReturn = () => {
    replaceCheckButton();
    showNotice();
    setTimeout(diagnosePendingReturn, 2800);
  };

  window.addEventListener("pageshow", onReturn);
  window.addEventListener("focus", onReturn);
  setTimeout(replaceCheckButton, 0);
  setTimeout(showNotice, 100);
})();
