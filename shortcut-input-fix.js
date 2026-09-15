(() => {
  const SHORTCUT_NAME = "TCV - Vérifier contacts";

  const normalizePhone = value => {
    let s = String(value ?? "").trim().replace(/[^\d+]/g, "");
    if (s.startsWith("0033")) s = "+33" + s.slice(4);
    if (s.startsWith("0") && s.length >= 10) s = "+33" + s.slice(1);
    else if (/^[67]\d{8}$/.test(s)) s = "+33" + s;
    else if (/^33\d+/.test(s)) s = "+" + s;
    return s;
  };

  const runShortcut = () => {
    const players = Array.isArray(window.TCV?.state?.players) ? window.TCV.state.players : [];
    if (!players.length) {
      alert("Importe d'abord la liste des joueurs MOJA.");
      return;
    }

    // Shortcuts' “Obtenir le dictionnaire de l’entrée” expects a JSON object,
    // not a top-level JSON array.  We therefore send one dictionary where
    // each key is the player's id and each value is the player's dictionary.
    // The existing Shortcut can keep using “Répéter avec chaque élément dans Valeurs”.
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
    if (!button || button.dataset.dictionaryPayload === "1") return;

    // Cloning removes the previous click listener defined by excel-import.js.
    const replacement = button.cloneNode(true);
    replacement.dataset.dictionaryPayload = "1";
    replacement.disabled = !(window.TCV?.state?.players?.length);
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
  setTimeout(replaceCheckButton, 0);
})();
