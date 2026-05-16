/**
 * calculator.js — Audit Ratio Calculator
 *
 * Lets the user:
 *  - See current totalUp / totalDown / ratio
 *  - Add planned projects with XP value + team members
 *  - Add planned audits they intend to give
 *  - See projected ratio in real time with an animated SVG gauge
 */

const Calculator = (() => {
  let _user   = null;   // { totalUp, totalDown, auditRatio }
  let _plan   = [];     // planned items

  // ── Init ──────────────────────────────────────────────────────────
  function init(user) {
    _user = user;
    _plan = [];
    _render();
    _bindEvents();
  }

  function _bindEvents() {
    document.getElementById('calc-add-btn').onclick = _addItem;
    document.getElementById('calc-clear-btn').onclick = _clearPlan;

    const nameInput = document.getElementById('calc-name');
    if (nameInput) {
      nameInput.addEventListener('input', e => {
        const name = e.target.value.trim();
        const xp = _projectXPMap[name];
        if (xp) {
          const xpInput = document.getElementById('calc-xp');
          if (!xpInput.value) xpInput.value = xp;
        }
      });
    }
  }

  function _addItem() {
    const name         = document.getElementById('calc-name').value.trim();
    const xp           = parseFloat(document.getElementById('calc-xp').value)  || 0;
    const teamRaw      = document.getElementById('calc-team').value.trim();
    const give         = parseFloat(document.getElementById('calc-give').value) || 0;
    const recv         = parseFloat(document.getElementById('calc-recv').value);
    const newTeammates = document.getElementById('calc-new-teammates')?.checked || false;

    if (xp <= 0 && give <= 0) {
      alert('Please enter a project XP value or the audits you plan to give.');
      return;
    }

    const teamMembers = teamRaw
      ? teamRaw.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const auditReceived = isNaN(recv) ? xp : recv;

    _plan.push({
      id:            Date.now(),
      name:          name || `Project #${_plan.length + 1}`,
      xp,
      teamMembers,
      newTeammates,
      give,
      auditReceived,
    });

    ['calc-name', 'calc-xp', 'calc-team', 'calc-give', 'calc-recv'].forEach(id => {
      document.getElementById(id).value = '';
    });
    const cb = document.getElementById('calc-new-teammates');
    if (cb) cb.checked = false;

    _render();
  }

  function _removeItem(id) {
    _plan = _plan.filter(p => p.id !== id);
    _render();
  }

  function _clearPlan() {
    _plan = [];
    _render();
  }

  function _compute() {
    if (!_user) return null;
    let projUp   = _user.totalUp;
    let projDown = _user.totalDown;

    _plan.forEach(item => {
      projUp   += item.give;
      projDown += item.auditReceived;
      if (item.newTeammates && item.teamMembers.length > 0) {
        projUp += item.xp * 0.15 * item.teamMembers.length;
      }
    });

    const projRatio = projDown > 0 ? projUp / projDown : 0;
    return { projUp, projDown, projRatio };
  }

  function _render() {
    if (!_user) return;

    document.getElementById('calc-cur-ratio').textContent = (_user.auditRatio || 0).toFixed(2);
    document.getElementById('calc-cur-up').textContent    = _fmtBytes(_user.totalUp);
    document.getElementById('calc-cur-down').textContent  = _fmtBytes(_user.totalDown);

    const list  = document.getElementById('plan-list');
    const badge = document.getElementById('plan-badge');
    badge.textContent = _plan.length;

    if (_plan.length === 0) {
      list.innerHTML = `
        <div class="empty-state">

          <p>No projects planned yet.</p>
          <p class="dim">Add a project above to start the simulation.</p>
        </div>`;
    } else {
      list.innerHTML = _plan.map(item => `
        <div class="plan-item">
          <div class="plan-item-info">
            <div class="plan-item-name">${_esc(item.name)}</div>
            <div class="plan-item-meta">
              ${item.xp > 0 ? `XP: ${_fmtBytes(item.xp)}` : ''}
              ${item.give > 0 ? ` · Give: ${_fmtBytes(item.give)}` : ''}
              ${item.auditReceived > 0 ? ` · Receive: ${_fmtBytes(item.auditReceived)}` : ''}
              ${item.teamMembers.length > 0 ? ` · Team: ${item.teamMembers.join(', ')}` : ''}
              ${item.newTeammates && item.teamMembers.length > 0 ? ' · <span style="color:var(--up)">+peer bonus</span>' : ''}
            </div>
          </div>
          <span class="plan-item-xp">+${Charts.fmt(item.xp)}</span>
          <button class="plan-item-del" data-id="${item.id}" title="Remove">✕</button>
        </div>`).join('');

      list.querySelectorAll('.plan-item-del').forEach(btn => {
        btn.onclick = () => _removeItem(Number(btn.dataset.id));
      });
    }

    const proj = _compute();
    if (!proj) return;

    const { projUp, projDown, projRatio } = proj;
    const curRatio = _user.auditRatio || 0;

    document.getElementById('pj-up').textContent    = _fmtBytes(projUp);
    document.getElementById('pj-down').textContent  = _fmtBytes(projDown);
    document.getElementById('pj-ratio').textContent = projRatio.toFixed(2);

    const deltaUp    = projUp    - _user.totalUp;
    const deltaDown  = projDown  - _user.totalDown;
    const deltaRatio = projRatio - curRatio;

    document.getElementById('pj-up-d').textContent    = deltaUp    > 0 ? `+${_fmtBytes(deltaUp)}`   : '';
    document.getElementById('pj-down-d').textContent  = deltaDown  > 0 ? `+${_fmtBytes(deltaDown)}` : '';
    document.getElementById('pj-ratio-d').textContent = deltaRatio !== 0 ? `${deltaRatio > 0 ? '+' : ''}${deltaRatio.toFixed(2)}` : '';
    document.getElementById('pj-ratio-d').style.color = deltaRatio >= 0 ? 'var(--up)' : 'var(--down)';

    _updateGauge(projRatio);
    _renderTeamAnalysis();
  }

  function _updateGauge(ratio) {
    const svg    = document.getElementById('calc-gauge');
    if (!svg) return;

    const fill   = svg.querySelector('#calc-gauge-fill');
    const needle = svg.querySelector('#calc-needle');
    const lbl    = svg.querySelector('#calc-gauge-lbl');

    if (!fill || !needle || !lbl) return;

    const CIRCUM = 503;
    const pct    = Math.min(ratio / 2, 1);
    const offset = CIRCUM * (1 - pct);

    fill.setAttribute('stroke-dashoffset', offset);

    const angle = (pct - 0.5) * Math.PI;
    const needleLen = 90;
    const nx = 200 + needleLen * Math.sin(angle);
    const ny = 140 - needleLen * Math.cos(angle);
    needle.setAttribute('x2', nx.toFixed(1));
    needle.setAttribute('y2', ny.toFixed(1));

    lbl.textContent = ratio.toFixed(2);
    lbl.setAttribute('fill', ratio >= 1 ? 'var(--up)' : ratio >= 0.8 ? 'var(--warn)' : 'var(--down)');
  }

  function _renderTeamAnalysis() {
    const section = document.getElementById('team-analysis');
    if (!section) return;

    const teamsWithMembers = _plan.filter(p => p.teamMembers.length > 0);

    if (teamsWithMembers.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');

    let html = '<h4>Team Analysis</h4>';
    teamsWithMembers.forEach(item => {
      html += `<div style="margin-bottom:.75rem">`;
      html += `<strong>${_esc(item.name)}</strong> — team of ${item.teamMembers.length + 1} (you + ${item.teamMembers.length})<br>`;
      html += `<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.4rem">`;
      html += `<div class="team-member-row"><div class="team-avatar">YOU</div> <span>You (audit giver)</span></div>`;
      item.teamMembers.forEach(member => {
        const initials = member.slice(0, 2).toUpperCase();
        html += `<div class="team-member-row"><div class="team-avatar">${_esc(initials)}</div> <span>${_esc(member)}</span></div>`;
      });
      html += `</div>`;

      if (item.teamMembers.length > 0) {
        const extraAudits = item.teamMembers.length;
        html += `<p style="font-size:.78rem;color:var(--text2);margin-top:.4rem">
          With ${item.teamMembers.length} teammate(s), expect ~${extraAudits} extra audit interaction(s).
          Consider giving each teammate an audit to boost your ratio!
        </p>`;
      }
      html += `</div>`;
    });

    section.innerHTML = html;
  }

  function _fmtBytes(n) {
    if (!n) return '0 B';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + ' MB';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + ' kB';
    return n + ' B';
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init };
})();
