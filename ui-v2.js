(() => {
  const view = document.getElementById('view');
  if (!view) return;

  const setText = (selector, from, to) => {
    view.querySelectorAll(selector).forEach(node => {
      if (node.textContent.trim() === from) node.textContent = to;
    });
  };

  const enhanceHome = () => {
    const hero = view.querySelector('.hero');
    if (!hero || hero.dataset.v2 === '1') return;
    hero.dataset.v2 = '1';
    hero.innerHTML = `
      <img class="logo-large" src="assets/tcv-logo.png" alt="Logo Tennis Club de Vitrolles">
      <h2>Vos joueurs, vos campagnes, vos messages.</h2>
      <p>Importez MOJA, retrouvez vos contacts et préparez vos communications pour les jeunes, les seniors ou une catégorie précise.</p>
      <div class="hero-tags">
        <span class="hero-tag">Jeunes</span>
        <span class="hero-tag">Seniors</span>
        <span class="hero-tag">TMC & tournois</span>
        <span class="hero-tag">Messages ciblés</span>
      </div>`;

    view.querySelectorAll('.action').forEach(action => {
      const strong = action.querySelector('strong')?.textContent.trim();
      const small = action.querySelector('small');
      if (!small) return;
      if (strong === 'Importer MOJA') small.textContent = 'Excel .xls / .xlsx exporté depuis MOJA';
      if (strong === 'Créer une campagne') small.textContent = 'Jeunes, seniors ou catégorie précise';
    });

    view.querySelectorAll('.card').forEach(card => {
      const heading = card.querySelector('.section-head h3');
      if (heading?.textContent.trim() === 'Parcours V1') heading.textContent = 'Parcours de communication';
      card.querySelectorAll('.meta').forEach(meta => {
        if (meta.textContent.includes('MOJA CSV')) meta.textContent = 'MOJA Excel → base locale';
      });
    });
  };

  const enhancePlayers = () => {
    view.querySelectorAll('.empty').forEach(empty => {
      empty.textContent = empty.textContent
        .replace('CSV MOJA', 'fichier Excel MOJA')
        .replace('CSV', 'Excel');
    });
  };

  const enhanceCampaign = () => {
    const form = view.querySelector('#campaignForm');
    if (!form || form.dataset.v2 === '1') return;
    form.dataset.v2 = '1';

    const nameInput = form.querySelector('#campaignName');
    if (nameInput && nameInput.value.trim() === 'Tournoi Jeunes 11/18 ans') {
      nameInput.value = 'Communication Club';
    }

    const presets = document.createElement('div');
    presets.className = 'audience-presets';
    presets.innerHTML = `
      <button type="button" class="audience-preset active" data-min="0" data-max="99" data-label="Tous">Tous</button>
      <button type="button" class="audience-preset" data-min="5" data-max="18" data-label="Jeunes">Jeunes</button>
      <button type="button" class="audience-preset" data-min="19" data-max="99" data-label="Seniors">Seniors</button>`;

    const firstField = form.querySelector('.field');
    if (firstField) form.insertBefore(presets, firstField);

    const note = document.createElement('div');
    note.className = 'audience-note';
    note.innerHTML = '<b>Public de la campagne :</b> utilise un raccourci ci-dessus ou ajuste directement les âges. Les catégories MOJA restent visibles dans la liste des joueurs.';
    form.appendChild(note);

    const minInput = form.querySelector('#minAge');
    const maxInput = form.querySelector('#maxAge');

    presets.querySelectorAll('.audience-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        presets.querySelectorAll('.audience-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (minInput) minInput.value = btn.dataset.min;
        if (maxInput) maxInput.value = btn.dataset.max;
        if (nameInput && (!nameInput.value.trim() || nameInput.value.trim() === 'Communication Club')) {
          nameInput.value = btn.dataset.label === 'Tous' ? 'Communication Club' : `Communication ${btn.dataset.label}`;
        }
      });
    });

    [minInput, maxInput].filter(Boolean).forEach(input => {
      input.addEventListener('input', () => presets.querySelectorAll('.audience-preset').forEach(b => b.classList.remove('active')));
    });

    view.querySelectorAll('.notice').forEach(notice => {
      if (notice.textContent.includes('date de naissance exploitable')) {
        notice.textContent = 'Le ciblage par âge fonctionne pour les joueurs disposant d’une date de naissance exploitable. Tu peux communiquer aussi bien avec les jeunes qu’avec les seniors.';
      }
    });
  };

  const enhanceMessage = () => {
    const text = view.querySelector('#messageText');
    if (!text || text.dataset.v2 === '1') return;
    text.dataset.v2 = '1';
    if (text.value.includes('tournoi jeunes 11/18 ans')) {
      text.value = `Bonjour,\n\nLe Tennis Club de Vitrolles vous informe d'une nouvelle actualité / compétition / animation. 🎾\n\nN'hésitez pas à nous contacter pour plus d'informations.\n\nSportivement,\nLe TC Vitrolles`;
    }
  };

  const enhanceHeader = () => {
    const logo = document.querySelector('.brand-logo');
    if (logo) logo.alt = 'Logo Tennis Club de Vitrolles';
  };

  const enhance = () => {
    enhanceHeader();
    enhanceHome();
    enhancePlayers();
    enhanceCampaign();
    enhanceMessage();
  };

  new MutationObserver(() => requestAnimationFrame(enhance))
    .observe(view, { childList: true, subtree: true });

  window.addEventListener('pageshow', enhance);
  setTimeout(enhance, 0);
  setTimeout(enhance, 300);
})();
