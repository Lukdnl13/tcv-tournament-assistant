(() => {
  const SHORTCUT_NAME = "TCV - Vérifier contacts";
  const PLAYERS_KEY = "tcv_players_v1";

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
      if (typeof TCV !== "undefined" && Array.isArray(TCV?.state?.players)) {
        return TCV.state.players;
      }
    } catch {}

    try {
      const stored = JSON.parse(localStorage.getItem(PLAYERS_KEY) || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  };

  const runShortcut = () => {
    const players = getPlayers();
    if (!players.length) {
      alert("Aucun joueur n'est chargé. Importe d'abord la liste des joueurs MOJA, puis réessaie.");
      return;
    }

    // Shortcuts “Obtenir le dictionnaire de l’entrée” attend un objet JSON.
    // Chaque valeur du dictionnaire correspond à un joueur ; le raccourci peut
    // continuer à utiliser “Répéter avec chaque élément dans Valeurs”.
    const payload = {};
    for (const player of players) {
      if (!player.phone) continue;
      const key = String(player.id || Object.keys(payload).length);
      payload[key] = {
        id: player.id,
        firstName: player.firstName,
        lastName: player.lastName,
        category: player.category,
        phone: normalizePhone(player.phone)
      };
    }

    if (!Object.keys(payload).length) {
      alert("Aucun numéro de téléphone exploitable n'a été trouvé dans la liste importée.");
      return;
    }

    const baseUrl = `${location.origin}${location.pathname}`;
    const successUrl = `${baseUrl}?contactsCallback=1`;
    const url =
      `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}` +
      `&input=text&text=${encodeURIComponent(JSON.stringify(payload))}` +
      `&x-success=${encodeURIComponent(successUrl)}` +
      `&x-cancel=${encodeURIComponent(baseUrl)}` +
      `&x-error=${encodeURIComponent(baseUrl + "?contactsError=1")}`;

    location.href = url;
  };

  const replaceCheckButton = () => {
    const button = document.querySelector("[data-action='checkIphoneContacts']");
    if (!button) return;

    if (button.dataset.dictionaryPayload === "1") {
      // Le bouton reste toujours cliquable. La fonction affiche un message si
      // aucun joueur n'est chargé au lieu de laisser un bouton grisé.
      button.disabled = false;
      return;
    }

    // Le clone retire l'ancien listener défini par excel-import.js afin que
    // seule la version dictionnaire soit envoyée au raccourci.
    const replacement = button.cloneNode(true);
    replacement.dataset.dictionaryPayload = "1";
    replacement.disabled = false;
    replacement.removeAttribute("disabled");
    replacement.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      runShortcut();
    });
    button.replaceWith(replacement);
  };

  const view = document.getElementById("view");
  if (view) {
    new MutationObserver(() => requestAnimationFrame(replaceCheckButton))
      .observe(view, { childList: true, subtree: true });
  }

  window.addEventListener("pageshow", replaceCheckButton);
  window.addEventListener("focus", replaceCheckButton);
  setTimeout(replaceCheckButton, 0);
  setTimeout(replaceCheckButton, 500);
})();
