(() => {
  const input = document.getElementById("fileInput");
  if (!input) return;

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
    birthDate: ["datedenaissance", "naissance", "birthdate", "datenaissance"],
    birthYear: ["anneedenaissance", "anneenaissance", "birthyear"],
    gender: ["sexe", "genre", "gender"],
    ranking: ["classement", "ranking", "classementfft"],
    club: ["club", "nomclub"],
    category: ["categorie", "categoriedage", "category"]
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

    if (map.lastName === undefined || map.phone === undefined) {
      throw new Error("Colonnes minimales non trouvées : Nom et Téléphone.");
    }

    const players = Array.isArray(TCV?.state?.players) ? TCV.state.players : [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows.slice(1)) {
      const lastName = String(row[map.lastName] ?? "").trim();
      const firstName = map.firstName !== undefined ? String(row[map.firstName] ?? "").trim() : "";
      const phone = normalizePhone(row[map.phone]);

      if (!lastName || !phone) {
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
        phone,
        birthDate,
        gender: map.gender !== undefined ? genderNorm(row[map.gender]) : "",
        ranking: map.ranking !== undefined ? String(row[map.ranking] ?? "").trim() : "",
        club: map.club !== undefined ? String(row[map.club] ?? "").trim() : "",
        category: map.category !== undefined ? String(row[map.category] ?? "").trim() : "",
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
    localStorage.setItem("tcv_players_v1", JSON.stringify(players));
    return { created, updated, skipped, total: players.length };
  };

  const replaceLabels = () => {
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
  };

  const observer = new MutationObserver(replaceLabels);
  const view = document.getElementById("view");
  if (view) observer.observe(view, { childList: true, subtree: true });
  setTimeout(replaceLabels, 0);

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
        `Import Excel terminé :\n${result.created} nouveau(x)\n${result.updated} mis à jour\n${result.skipped} ignoré(s)\n\nBase : ${result.total} joueurs`
      );

      TCV.route("players");
    } catch (error) {
      alert("Import impossible : " + error.message);
    }
  }, true);
})();
