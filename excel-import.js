(() => {
  const input = document.getElementById("fileInput");
  if (!input) return;

  const CONTACT_CHECK_SHORTCUT = "TCV - Vérifier contacts";
  const PLAYERS_KEY = "tcv_players_v1";

  input.setAttribute(
    "accept",
    ".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );

  const normalize = value => String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");

  const normalizePhone = value => {
    let s = String(value ?? "").trim().replace(/[^\d+]/g, "");
    if (s.startsWith("0033")) s = "+33" + s.slice(4);
    if (s.startsWith("0") && s.length >= 10) s = "+33" + s.slice(1);
    else if (/^[67]\d{8}$/.test(s)) s = "+33" + s;
    else if (/^33\d+/.test(s)) s = "+" + s;
    return s;
  };

  const parseDate = value => {
    const s = String(value ?? "").trim();
    if (!s) return "";
    const fr = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
    if (fr) {
      let year = Number(fr[3]);
      if (year < 100) year += year >= 50 ? 1900 : 2000;
      const month = Number(fr[2]);
      const day = Number(fr[1]);
      const d = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return "";
  };

  const genderNorm = value => {
    const s = String(value ?? "").trim().toLowerCase();
    if (["f", "femme", "fille", "female"].includes(s)) return "F";
    if (["h", "m", "homme", "garcon", "garçon", "male"].includes(s)) return "H";
    return "";
  };

  const aliases = {
    firstName: ["prenom", "firstname", "joueurprenom"],
    lastName: ["nom", "lastname", "nomjoueur", "nomdefamille"],
    phone: ["telephone", "tel", "portable", "mobile", "gsm", "numerotelephone", "telportable", "telephoneportable"],
    category: ["categorie", "categoriedage", "category"],
    birthDate: ["datedenaissance", "naissance", "birthdate", "datenaissance"],
    birthYear: ["anneedenaissance", "anneenaissance", "birthyear"],
    gender: ["sexe", "genre", "gender"],
    ranking: ["classement", "classementinscription", "ranking", "classementfft"],
    club: ["club", "nomclub"]
  };

  const mapHeaders = headers => {
    const map = {};
    headers.forEach((header, index) => {
      const n = normalize(header);
      for (const [key, values] of Object.entries(aliases)) {
        if (map[key] === undefined && values.includes(n)) map[key] = index;
      }
    });
    return map;
  };

  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

  const importRows = rows => {
    if (!Array.isArray(rows) || rows.length < 2) {
      throw new Error("Le fichier Excel ne contient pas assez de lignes.");
    }

    const headers = rows[0].map(v => String(v ?? "").trim());
    const map = mapHeaders(headers);
    const required = [
      ["lastName", "Nom"],
      ["firstName", "Prénom"],
      ["category", "Catégorie d'âge"],
      ["phone", "Téléphone portable"]
    ];
    const missing = required.filter(([key]) => map[key] === undefined).map(([, label]) => label);
    if (missing.length) {
      throw new Error("Colonnes MOJA non trouvées : " + missing.join(", ") + ".");
    }

    const players = Array.isArray(TCV?.state?.players) ? TCV.state.players : [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows.slice(1)) {
      const lastName = String(row[map.lastName] ?? "").trim();
      const firstName = String(row[map.firstName] ?? "").trim();
      const category = String(row[map.category] ?? "").trim();
      const phone = normalizePhone(row[map.phone]);

      if (!lastName || !firstName || !phone) {
        skipped++;
        continue;
      }

      let birthDate = map.birthDate !== undefined ? parseDate(row[map.birthDate]) : "";
      if (!birthDate && map.birthYear !== undefined) {
        const year = parseInt(row[map.birthYear], 10);
        if (year > 1900 && year <= new Date().getFullYear()) birthDate = `${year}-07-01`;
      }

      const incoming = {
        id: uid(),
        firstName,
        lastName,
        category,
        phone,
        birthDate,
        gender: map.gender !== undefined ? genderNorm(row[map.gender]) : "",
        ranking: map.ranking !== undefined ? String(row[map.ranking] ?? "").trim() : "",
        club: map.club !== undefined ? String(row[map.club] ?? "").trim() : "",
        contactStatus: "unknown",
        importedAt: new Date().toISOString()
      };

      const existing = players.find(p => normalizePhone(p.phone) === phone);
      if (existing) {
        Object.assign(existing, {
          ...incoming,
          id: existing.id,
          contactStatus: existing.contactStatus || "unknown"
        });
        updated++;
      } else {
        players.push(incoming);
        created++;
      }
    }

    TCV.state.players = players;
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
    return { created, updated, skipped, total: players.length };
  };

  const replaceLabelsAndInjectButton = () => {
    const view = document.getElementById("view");
    if (!view) return;

    const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      node.nodeValue = node.nodeValue
        .replace("CSV exporté depuis MOJA", "Excel .xls / .xlsx exporté depuis MOJA")
        .replace("MOJA CSV → base locale", "MOJA Excel → base locale")
        .replace("Importe un CSV MOJA", "Importe un fichier Excel MOJA (.xls/.xlsx)");
    }

    const playersTitle = [...view.querySelectorAll("h3")].find(el => el.textContent.trim() === "Joueurs");
    if (!playersTitle || view.querySelector("[data-action='checkIphoneContacts']")) return;

    const kpiLine = view.querySelector(".kpi-line");
    if (!kpiLine) return;

    const btn = document.createElement("button");
    btn.className = "btn btn-green";
    btn.dataset.action = "checkIphoneContacts";
    btn.textContent = "Vérifier Contacts iPhone";
    btn.disabled = !(TCV?.state?.players?.length);
    btn.addEventListener("click", runContactCheckShortcut);
    kpiLine.prepend(btn);
  };

  const runContactCheckShortcut = () => {
    const players = Array.isArray(TCV?.state?.players) ? TCV.state.players : [];
    if (!players.length) {
      alert("Importe d'abord la liste des joueurs MOJA.");
      return;
    }

    const payload = players
      .filter(p => p.phone)
      .map(p => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        category: p.category,
        phone: normalizePhone(p.phone)
      }));

    const baseUrl = `${location.origin}${location.pathname}`;
    const successUrl = `${baseUrl}?contactsCallback=1`;
    const url =
      `shortcuts://x-callback-url/run-shortcut?name=${encodeURIComponent(CONTACT_CHECK_SHORTCUT)}` +
      `&input=text&text=${encodeURIComponent(JSON.stringify(payload))}` +
      `&x-success=${encodeURIComponent(successUrl)}` +
      `&x-cancel=${encodeURIComponent(baseUrl)}` +
      `&x-error=${encodeURIComponent(baseUrl + "?contactsError=1")}`;

    location.href = url;
  };

  const processContactCallback = () => {
    const params = new URLSearchParams(location.search);
    if (!params.has("contactsCallback")) return;

    const rawResult = params.get("result");
    const cleanUrl = `${location.origin}${location.pathname}`;

    try {
      if (!rawResult) throw new Error("Le raccourci n'a retourné aucun résultat.");
      const parsed = JSON.parse(rawResult);
      const results = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.contacts) ? parsed.contacts : []);
      if (!results.length) throw new Error("Aucun résultat de contact exploitable.");

      const byId = new Map(results.map(item => [String(item.id), Boolean(item.exists)]));
      let found = 0;
      let missing = 0;

      for (const player of TCV.state.players) {
        if (!byId.has(String(player.id))) continue;
        const exists = byId.get(String(player.id));
        player.contactStatus = exists ? "exists" : "missing";
        exists ? found++ : missing++;
      }

      localStorage.setItem(PLAYERS_KEY, JSON.stringify(TCV.state.players));
      history.replaceState({}, "", cleanUrl);
      TCV.route("players");
      setTimeout(() => alert(`Vérification terminée :\n${found} contact(s) trouvé(s)\n${missing} contact(s) à créer`), 150);
    } catch (error) {
      history.replaceState({}, "", cleanUrl);
      setTimeout(() => alert("Résultat Contacts impossible à traiter : " + error.message), 100);
    }
  };

  const observer = new MutationObserver(replaceLabelsAndInjectButton);
  const view = document.getElementById("view");
  if (view) observer.observe(view, { childList: true, subtree: true });
  setTimeout(replaceLabelsAndInjectButton, 0);
  setTimeout(processContactCallback, 0);

  input.addEventListener("change", async event => {
    event.stopImmediatePropagation();
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const name = file.name.toLowerCase();
      if (!name.endsWith(".xls") && !name.endsWith(".xlsx")) {
        throw new Error("Sélectionne un fichier Excel .xls ou .xlsx.");
      }
      if (!window.XLSX) {
        throw new Error("Le lecteur Excel n'a pas pu être chargé. Vérifie ta connexion Internet puis réessaie.");
      }

      const workbook = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        cellDates: false,
        cellText: true
      });
      if (!workbook.SheetNames?.length) throw new Error("Aucune feuille Excel trouvée.");

      let result = null;
      let lastError = null;
      for (const sheetName of workbook.SheetNames) {
        try {
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
            header: 1,
            defval: "",
            raw: false,
            blankrows: false
          });
          result = importRows(rows);
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!result) throw lastError || new Error("Aucune feuille exploitable trouvée.");

      alert(
        `Import MOJA terminé :\n${result.created} nouveau(x)\n${result.updated} mis à jour\n${result.skipped} ignoré(s)\n\nBase : ${result.total} joueurs\n\nDonnées extraites : Nom, Prénom, Catégorie d'âge, Téléphone portable.`
      );
      TCV.route("players");
    } catch (error) {
      alert("Import impossible : " + error.message);
    }
  }, true);
})();
