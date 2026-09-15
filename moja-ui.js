(() => {
  const PLAYERS_KEY = "tcv_players_v1";

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));

  const statusLabel = status => {
    if (status === "exists") return '<span class="pill green">✓ Dans Contacts</span>';
    if (status === "missing") return '<span class="pill orange">À créer</span>';
    return '<span class="pill gray">Non vérifié</span>';
  };

  const findPlayerFromCard = card => {
    const text = card.textContent || "";
    const players = Array.isArray(TCV?.state?.players) ? TCV.state.players : [];
    return players.find(player => player.phone && text.includes(player.phone)) || null;
  };

  const enhancePlayersView = view => {
    const title = [...view.querySelectorAll("h3")].find(node => node.textContent.trim() === "Joueurs");
    if (!title) return;

    const list = view.querySelector("#playerList");
    if (!list) return;

    if (!view.querySelector("#contactHelpNotice")) {
      const notice = document.createElement("div");
      notice.id = "contactHelpNotice";
      notice.className = "notice";
      notice.style.marginBottom = "12px";
      notice.innerHTML = "<b>Contacts iPhone :</b> après l'import MOJA, appuie sur <b>Vérifier Contacts iPhone</b>. Le statut de chaque joueur passera ensuite à <b>✓ Dans Contacts</b> ou <b>À créer</b>.";
      list.parentNode.insertBefore(notice, list);
    }

    view.querySelectorAll("#playerList .player-card").forEach(card => {
      const player = findPlayerFromCard(card);
      if (!player) return;

      const grow = card.querySelector(".grow");
      if (!grow) return;

      const metas = grow.querySelectorAll(".meta");
      const ranking = String(player.ranking || "").trim();
      const category = String(player.category || "Catégorie inconnue").trim();

      if (metas[0]) {
        metas[0].innerHTML = `<span class="pill blue">${esc(category)}</span>${ranking ? ` <span class="pill gray">${esc(ranking)}</span>` : ""}`;
      }
      if (metas[1]) {
        const club = String(player.club || "").trim();
        metas[1].innerHTML = `${club ? `${esc(club)} • ` : ""}<b>${esc(player.phone)}</b>`;
      }

      const currentStatus = card.querySelector(".row > .pill:last-child");
      if (currentStatus) currentStatus.outerHTML = statusLabel(player.contactStatus);
    });

    const checkButton = view.querySelector("[data-action='checkIphoneContacts']");
    if (checkButton) {
      checkButton.textContent = "📇 Vérifier Contacts iPhone";
      checkButton.classList.add("btn-block");
    }
  };

  const enhanceHome = view => {
    const hero = view.querySelector(".hero");
    if (!hero || view.querySelector("#mojaSchemaHint")) return;
    const hint = document.createElement("div");
    hint.id = "mojaSchemaHint";
    hint.className = "notice success";
    hint.style.marginTop = "14px";
    hint.innerHTML = "Import MOJA configuré pour : <b>Nom</b> • <b>Prénom</b> • <b>Catégorie d'âge</b> • <b>Téléphone portable</b>.";
    hero.insertAdjacentElement("afterend", hint);
  };

  const enhance = () => {
    if (typeof TCV === "undefined") return;
    const view = document.getElementById("view");
    if (!view) return;
    enhancePlayersView(view);
    enhanceHome(view);
  };

  const observer = new MutationObserver(() => requestAnimationFrame(enhance));
  const view = document.getElementById("view");
  if (view) observer.observe(view, { childList: true, subtree: true });

  window.addEventListener("pageshow", enhance);
  setTimeout(enhance, 0);
})();
