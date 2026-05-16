const Recommender = (() => {
  let _xp          = [];
  let _user        = null;
  let _currentXP   = 0;

  function init(user, xpTransactions) {
    _user      = user;
    _xp        = xpTransactions || [];
    _currentXP = _xp.reduce((s, t) => s + t.amount, 0);
    _bindEvents();
  }

  function _bindEvents() {
    document.getElementById('adv-gen-btn').onclick = generate;
  }

  function generate() {
    const target     = parseFloat(document.getElementById('adv-target').value) || 0;
    const maxProj    = parseInt(document.getElementById('adv-max').value)       || Infinity;
    const category   = document.getElementById('adv-cat').value;
    const strategy   = document.getElementById('adv-strategy').value;

    if (target <= 0) { alert('Please enter a target XP value greater than 0.'); return; }

    const results = document.getElementById('adv-results');
    results.classList.remove('hidden');

    const catalogue = _buildCatalogue(category);
    const selected  = _selectProjects(catalogue, target, maxProj, strategy);

    document.getElementById('adv-cur-xp').textContent  = _currentXP.toLocaleString();
    document.getElementById('adv-goal-xp').textContent = (_currentXP + target).toLocaleString();
    document.getElementById('adv-cnt').textContent     = selected.length;

    const totalNewDown = selected.reduce((s, p) => s + p.xp, 0);
    const newDown      = (_user?.totalDown || 0) + totalNewDown;
    const newRatio     = newDown > 0 ? (_user?.totalUp || 0) / newDown : 0;
    const ratioDelta   = newRatio - (_user?.auditRatio || 0);
    document.getElementById('adv-audit').textContent =
      `${ratioDelta >= 0 ? '+' : ''}${ratioDelta.toFixed(2)}`;

    _renderProjectList(selected, target);
    _renderForecast(selected);
    _renderCollab(selected);
  }

  function _buildCatalogue(category) {
    const completedNames = new Set(
      _xp.map(t => t.path?.split('/').filter(Boolean).pop() || `obj-${t.objectId}`)
    );

    const map = {};
    _xp.forEach(t => {
      const parts   = t.path ? t.path.split('/').filter(Boolean) : [];
      const projCat = parts[1] || 'unknown';
      const name    = parts[parts.length - 1] || `obj-${t.objectId}`;

      if (!map[name]) {
        map[name] = { name, xp: 0, path: t.path, category: projCat, count: 0 };
      }
      map[name].xp    += t.amount;
      map[name].count += 1;
    });

    let catalogue = Object.values(map);

    if (category !== 'any') {
      catalogue = catalogue.filter(p => p.category.includes(category));
    }

    if (!catalogue.length) catalogue = Object.values(map);

    if (catalogue.length > 0) {
      const avgXP = catalogue.reduce((s, p) => s + p.xp, 0) / catalogue.length;
      catalogue = _augmentWithEstimates(catalogue, avgXP, completedNames);
    }

    catalogue = catalogue.filter(p => p.isEstimate || !completedNames.has(p.name));

    return catalogue.sort((a, b) => b.xp - a.xp);
  }

  function _augmentWithEstimates(catalogue, avgXP, completedNames) {
    const categories = [...new Set(catalogue.map(p => p.category))];
    const extras = [];

    categories.forEach(cat => {
      const inCat = catalogue.filter(p => p.category === cat);
      const avg = inCat.reduce((s, p) => s + p.xp, 0) / inCat.length;
      [1, 1.5, 2, 0.5].forEach((mult, i) => {
        extras.push({
          name:       `${cat} — future project ${i + 1}`,
          xp:         Math.round(avg * mult),
          path:       `/${cat}/future/project-${i + 1}`,
          category:   cat,
          isEstimate: true,
          count:      1,
        });
      });
    });

    return [...catalogue, ...extras];
  }

  function _selectProjects(catalogue, target, maxProj, strategy) {
    const unique = _dedup(catalogue);
    let sorted;

    switch (strategy) {
      case 'high-xp':
        sorted = [...unique].sort((a, b) => b.xp - a.xp);
        break;
      case 'many-small':
        sorted = [...unique].sort((a, b) => a.xp - b.xp);
        break;
      case 'balanced':
      default: {
        const s = [...unique].sort((a, b) => b.xp - a.xp);
        sorted = [];
        let lo = s.length - 1, hi = 0;
        while (lo >= hi) {
          if (hi <= lo) sorted.push(s[hi++]);
          if (lo > hi)  sorted.push(s[lo--]);
        }
        break;
      }
    }

    let remaining = target;
    const selected = [];

    for (const proj of sorted) {
      if (remaining <= 0 || selected.length >= maxProj) break;
      selected.push({ ...proj });
      remaining -= proj.xp;
    }

    if (remaining > 0 && unique.length > 0) {
      const avg = unique.reduce((s, p) => s + p.xp, 0) / unique.length;
      while (remaining > 0 && selected.length < maxProj) {
        const xp = Math.min(remaining, Math.round(avg));
        selected.push({ name: `future project ${selected.length + 1}`, xp, isEstimate: true, category: 'any' });
        remaining -= xp;
      }
    }

    return selected;
  }

  function _dedup(arr) {
    const seen = new Set();
    return arr.filter(p => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      return true;
    });
  }


  function _renderProjectList(selected, target) {
    const container = document.getElementById('adv-proj-list');
    if (!selected.length) {
      container.innerHTML = '<p class="dim">Not enough project data to generate recommendations. Complete a few projects first!</p>';
      return;
    }

    let cumXP = 0;
    container.innerHTML = selected.map((proj, i) => {
      cumXP += proj.xp;
      const pct = Math.min((cumXP / target) * 100, 100).toFixed(0);
      const cat = proj.isEstimate ? 'Estimated' : proj.category;
      return `
        <div class="adv-proj-item">
          <div class="adv-proj-rank">${i + 1}</div>
          <div class="adv-proj-info">
            <div class="adv-proj-name">${_esc(proj.name)}</div>
            <div class="adv-proj-meta">${cat} · After: ${cumXP.toLocaleString()} XP (${pct}% of goal)</div>
          </div>
          <span class="adv-proj-xp">+${proj.xp.toLocaleString()} XP</span>
        </div>`;
    }).join('');
  }

  function _renderForecast(selected) {
    const svg = document.getElementById('svg-adv-progress');
    if (!svg) return;

    let cum = _currentXP;
    const points = selected.map(p => {
      cum += p.xp;
      return { xp: cum, label: p.name.slice(0, 8) };
    });

    Charts.drawProgressForecast(svg, _currentXP, points);
  }


  function _renderCollab(selected) {
    const container = document.getElementById('adv-collab');
    if (!container) return;

    // Analyse path patterns to infer collaboration (piscine often has teams)
    const pathsByCategory = {};
    _xp.forEach(t => {
      const parts = t.path ? t.path.split('/').filter(Boolean) : [];
      const cat   = parts[1] || 'unknown';
      if (!pathsByCategory[cat]) pathsByCategory[cat] = [];
      pathsByCategory[cat].push(t);
    });

    const tips = [];

    selected.forEach(proj => {
      if (proj.isEstimate) return;
      const cat = proj.category;
      const count = pathsByCategory[cat]?.length || 0;
      if (count > 0) {
        tips.push(`You've done <strong>${count}</strong> transaction(s) in <strong>${cat}</strong>. This category has relevant experience.`);
      }
    });

    const piscineProjs = selected.filter(p => p.category?.includes('piscine'));
    if (piscineProjs.length > 0) {
      tips.push('Piscine projects often benefit from pair programming — reach out to classmates working on the same exercises!');
    }

    const hasLargeProjs = selected.some(p => p.xp > 1000);
    if (hasLargeProjs) {
      tips.push('Large projects (1000+ XP) typically require more audits. Plan to give extra audits before submitting to maintain a healthy ratio.');
    }

    tips.push('Working in a team increases your visibility for audits. Contact peers who have previously audited you for collaboration opportunities.');
    tips.push('A good audit ratio (≥ 1.0) unlocks more project access. Balance submitting projects with giving quality audits.');

    container.innerHTML = `<ul style="list-style:none;display:flex;flex-direction:column;gap:.75rem">` +
      [...new Set(tips)].slice(0, 5).map(t => `
        <li style="background:var(--bg2);border:1px solid var(--card-border);border-radius:8px;padding:.75rem 1rem;font-size:.875rem;color:var(--text2);line-height:1.5">
          ${t}
        </li>`).join('') +
      `</ul>`;
  }


  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init, generate };
})();
