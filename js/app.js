(function () {
  'use strict';

  let _data = null;

  const PROG_SKILLS = ['PROG-1', 'ALGO', 'DEVOPS', 'FRONT', 'BACK', 'STATS', 'AI', 'GAME', 'TCP'];
  const TECH_SKILLS = ['GO', 'JS', 'HTML', 'CSS', 'UNIX', 'DOCKER', 'SQL', 'C'];

  document.addEventListener('DOMContentLoaded', () => {
    if (Auth.isAuthenticated()) {
      _showProfile();
      _loadData();
    } else {
      _showLogin();
    }
  });

  const loginForm = document.getElementById('login-form');
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const credential = document.getElementById('credential').value.trim();
    const password   = document.getElementById('password').value;
    const btn        = document.getElementById('login-btn');
    const errBanner  = document.getElementById('login-error');
    const errText    = document.getElementById('login-error-text');
    const spinner    = btn.querySelector('.btn-spinner');
    const btnText    = btn.querySelector('.btn-text');

    errBanner.classList.add('hidden');
    btn.disabled = true;
    spinner.classList.remove('hidden');
    btnText.textContent = 'Signing in…';

    try {
      await Auth.login(credential, password);
      _showProfile();
      _loadData();
    } catch (err) {
      errText.textContent = err.message;
      errBanner.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      spinner.classList.add('hidden');
      btnText.textContent = 'Sign In';
    }
  });

  document.getElementById('toggle-pwd').addEventListener('click', () => {
    const input = document.getElementById('password');
    input.type  = input.type === 'password' ? 'text' : 'password';
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    Auth.logout();
    _data = null;
    _showLogin();
  });

  function _showLogin() {
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('login-view').classList.add('active');
    document.getElementById('profile-view').classList.add('hidden');
    document.getElementById('profile-view').classList.remove('active');
  }

  function _showProfile() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('login-view').classList.remove('active');
    document.getElementById('profile-view').classList.remove('hidden');
    document.getElementById('profile-view').classList.add('active');
  }

  async function _loadData() {
    const loader = document.getElementById('data-loader');
    loader.classList.remove('hidden');

    try {
      _data = await API.fetchAll();
      _populateOverview(_data);
      _populateStats(_data);
    } catch (err) {
      console.error('Data load failed:', err);
      if (err.message.includes('Session expired')) {
        Auth.logout();
        _showLogin();
        return;
      }
      _showError(err.message);
    } finally {
      loader.classList.add('hidden');
    }
  }

  function _showError(msg) {
    const main = document.getElementById('main-content');
    const div = document.createElement('div');
    div.style.cssText = 'padding:2rem;text-align:center;color:var(--down)';
    div.innerHTML = `<p style="font-size:1rem">${_esc(msg)}</p><button onclick="location.reload()" style="margin-top:1rem;padding:.5rem 1rem;border:1px solid var(--down);border-radius:8px;color:var(--down);cursor:pointer">Retry</button>`;
    main.prepend(div);
  }

  function _populateOverview({ user, xp, results }) {
    if (!user) return;

    document.getElementById('chip-avatar').textContent = (user.login || '?')[0].toUpperCase();
    document.getElementById('chip-name').textContent   = user.login || 'User';

    const initials = (user.login || '?')[0].toUpperCase();
    document.getElementById('ov-avatar').textContent  = initials;
    document.getElementById('ov-login').textContent   = user.login   || '—';
    document.getElementById('ov-campus').textContent  = user.campus  || 'campus';
    document.getElementById('ov-id').textContent      = `#${user.id}`;
    document.getElementById('ov-joined').textContent = user.createdAt
      ? new Date(user.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—';

    const moduleResults = _filterModuleResults(results);
    const passedCount = new Set(moduleResults.filter(r => r.grade >= 1).map(r => r.path)).size;
    document.getElementById('ov-projects').textContent = passedCount || '—';

    const mainTransactions = _filterModuleXP(xp);
    const mainLearningXP = mainTransactions.reduce((s, t) => s + t.amount, 0);

    document.getElementById('ov-main-xp').textContent = _fmtBytes(Math.max(mainLearningXP, 0));

    document.getElementById('ov-xp-total').textContent = _fmtBytes(mainLearningXP);
    document.getElementById('ov-xp-unit').textContent  = '';
    document.getElementById('ov-xp-count').textContent = mainTransactions.length;
    document.getElementById('ov-xp-avg').textContent   = mainTransactions.length
      ? _fmtBytes(Math.round(mainLearningXP / mainTransactions.length))
      : '0 B';
    const maxXP = mainTransactions.length ? Math.max(...mainTransactions.map(t => t.amount)) : 0;
    document.getElementById('ov-xp-max').textContent = _fmtBytes(maxXP);

    const lastXP = mainTransactions.length ? mainTransactions[mainTransactions.length - 1].amount : 0;
    document.getElementById('ov-xp-last').textContent = _fmtBytes(lastXP);

    const ratio     = user.auditRatio || 0;
    const totalUp   = user.totalUp    || 0;
    const totalDown = user.totalDown  || 0;
    document.getElementById('ov-up').textContent        = _fmtBytes(totalUp);
    document.getElementById('ov-down').textContent      = _fmtBytes(totalDown);

    Charts.updateAuditGauge(document.getElementById('ov-gauge-svg'), ratio);

    const maxAudit = Math.max(totalUp, totalDown, 1);
    document.getElementById('abar-up').style.width   = (totalUp   / maxAudit * 100) + '%';
    document.getElementById('abar-down').style.width = (totalDown / maxAudit * 100) + '%';

    const msgEl = document.getElementById('audit-msg');
    if (ratio >= 1) {
      msgEl.className = 'audit-msg good';
      msgEl.textContent = `✅ Great ratio! You've given more audits than you received.`;
    } else if (ratio >= 0.5) {
      msgEl.className = 'audit-msg';
      msgEl.style.color = 'var(--warn)';
      msgEl.textContent = `⚠️ Ratio is below 1.0 — give a few more audits to improve it.`;
    } else {
      msgEl.className = 'audit-msg bad';
      msgEl.textContent = `❌ Ratio below 0.5 — prioritise giving audits before submitting new projects.`;
    }

    _renderActivity(_filterModuleXP(xp), moduleResults);
  }

  function _renderActivity(xp, results) {
    const container = document.getElementById('activity-list');

    const events = [];
    xp.slice(-20).forEach(t => events.push({
      type:   'xp',
      name:   t.path?.split('/').pop() || `obj-${t.objectId}`,
      amount: t.amount,
      date:   new Date(t.createdAt),
    }));
    results.slice(0, 20).forEach(r => events.push({
      type:  r.grade >= 1 ? 'pass' : 'fail',
      name:  r.object?.name || r.path?.split('/').pop() || `#${r.objectId}`,
      grade: r.grade,
      date:  new Date(r.createdAt),
    }));

    events.sort((a, b) => b.date - a.date);

    const seen = new Set();
    const deduped = [];
    for (const ev of events) {
      if (!seen.has(ev.name)) {
        seen.add(ev.name);
        deduped.push(ev);
      }
    }
    const recent = deduped.slice(0, 10);

    if (!recent.length) {
      container.innerHTML = '<p class="placeholder-text">No activity yet.</p>';
      return;
    }

    container.innerHTML = recent.map(ev => {
      const indicator = ev.type === 'pass' ? '✓' : ev.type === 'fail' ? '✗' : '';
      const cls       = ev.type === 'xp' ? 'xp-type' : '';
      const detail    = ev.type === 'xp'
        ? `+${_fmtBytes(ev.amount)}`
        : ev.type === 'pass' ? 'Passed' : 'Failed';
      const dateStr   = ev.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      return `
        <div class="activity-item ${cls}">
          <span class="activity-icon">${indicator}</span>
          <div class="activity-details">
            <div class="activity-name" title="${_esc(ev.name)}">${_esc(ev.name)}</div>
            <div class="activity-meta">${dateStr}</div>
          </div>
          <span class="activity-xp" style="${ev.type === 'fail' ? 'color:var(--down)' : ''}">${detail}</span>
        </div>`;
    }).join('');
  }

  function _populateStats({ xp, results, skills }) {
    const moduleXP      = _filterModuleXP(xp);
    const moduleResults = _filterModuleResults(results);
    _drawAllCharts(moduleXP, moduleResults, skills);

    const years = [...new Set(moduleXP.map(t => new Date(t.createdAt).getFullYear()))].sort();
    const yearOpts = '<option value="">Year</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
    document.getElementById('timeline-from-year').innerHTML = yearOpts;
    document.getElementById('timeline-to-year').innerHTML   = yearOpts;

    const allBtn      = document.getElementById('timeline-all-btn');
    const fromYearSel = document.getElementById('timeline-from-year');
    const fromMonSel  = document.getElementById('timeline-from-month');
    const toYearSel   = document.getElementById('timeline-to-year');
    const toMonSel    = document.getElementById('timeline-to-month');

    function _applyRange() {
      const fy = fromYearSel.value, fm = fromMonSel.value;
      const ty = toYearSel.value,   tm = toMonSel.value;
      const hasFilter = fy || fm || ty || tm;
      if (!hasFilter) {
        allBtn.classList.add('active');
        Charts.drawXPTimeline(document.getElementById('svg-timeline'), moduleXP, null, null);
        return;
      }
      allBtn.classList.remove('active');
      const now = new Date();
      const startDate = (fy || fm) ? new Date(fy ? +fy : now.getFullYear(), fm ? +fm - 1 : 0, 1) : null;
      const endDate   = (ty || tm) ? new Date(ty ? +ty : now.getFullYear(), tm ? +tm : 12, 0, 23, 59, 59) : null;
      Charts.drawXPTimeline(document.getElementById('svg-timeline'), moduleXP, startDate, endDate);
    }

    allBtn.addEventListener('click', () => {
      fromYearSel.value = ''; fromMonSel.value = '';
      toYearSel.value   = ''; toMonSel.value   = '';
      _applyRange();
    });
    [fromYearSel, fromMonSel, toYearSel, toMonSel].forEach(s => s.addEventListener('change', _applyRange));
  }

  function _drawAllCharts(xp, results, skills) {
    Charts.drawXPTimeline  (document.getElementById('svg-timeline'),      xp);
    Charts.drawXPByProject (document.getElementById('svg-projects'),      xp);
    Charts.drawResultsDonut(document.getElementById('svg-results'),       results);
    Charts.drawSkillsRadar (document.getElementById('svg-skills'),        skills, PROG_SKILLS);
    Charts.drawSkillsRadar (document.getElementById('svg-skills-tech'),   skills, TECH_SKILLS);
    Charts.drawMonthlyXP   (document.getElementById('svg-monthly'),       xp, _openMonthlyModal);
  }

  function _onTabChange(tab) {
    if (tab === 'stats' && _data) {
      const moduleXP      = _filterModuleXP(_data.xp);
      const moduleResults = _filterModuleResults(_data.results);
      setTimeout(() => _drawAllCharts(moduleXP, moduleResults, _data.skills), 50);
    }
  }

  function _openMonthlyModal(key, txns) {
    const total   = txns.reduce((s, t) => s + t.amount, 0);
    const projMap = {};
    txns.forEach(t => {
      const name = t.path?.split('/').pop() || `obj-${t.objectId}`;
      projMap[name] = (projMap[name] || 0) + t.amount;
    });
    const projects = Object.entries(projMap).sort((a, b) => b[1] - a[1]);

    const [yr, mo] = key.split('-');
    const monthName = new Date(+yr, +mo - 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });

    document.getElementById('modal-month-title').textContent = monthName;
    document.getElementById('modal-total-xp').textContent    = _fmtBytes(total);
    document.getElementById('modal-proj-count').textContent  = projects.length;

    document.getElementById('modal-proj-list').innerHTML = projects.map(([name, xp]) =>
      `<div class="modal-proj-row">
        <span class="mprow-name">${_esc(name)}</span>
        <span class="mprow-xp">${_fmtBytes(xp)}</span>
      </div>`
    ).join('');

    document.getElementById('monthly-modal').classList.remove('hidden');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const modalClose = document.getElementById('modal-close');
    if (modalClose) {
      modalClose.addEventListener('click', () => {
        document.getElementById('monthly-modal').classList.add('hidden');
      });
    }
    const modalOverlay = document.getElementById('monthly-modal');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', e => {
        if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
      });
    }
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      const panel = document.getElementById(`tab-${tab}`);
      if (panel) {
        panel.classList.remove('hidden');
        panel.classList.add('active');
      }

      _onTabChange(tab);
    });
  });

  function _fmtBytes(n) {
    if (!n) return '0 B';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + ' MB';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + ' kB';
    return n + ' B';
  }

  function _filterModuleXP(transactions) {
    return transactions.filter(t => {
      const path = t.path || '';
      return path.includes('module') &&
        !path.includes('piscine-js/') &&
        !path.includes('piscine-ai/');
    });
  }

  function _filterModuleResults(results) {
    const filtered = results.filter(r => {
      const path = r.path || '';
      return path.includes('module') &&
        !path.includes('piscine-js') &&
        !path.includes('piscine-ai') &&
        !path.includes('checkpoint-zero');
    });
    const map = new Map();
    for (const r of filtered) {
      const bucket = r.grade >= 1 ? 'pass' : 'fail';
      const key = `${r.path}__${bucket}`;
      const existing = map.get(key);
      if (!existing || r.grade > existing.grade) {
        map.set(key, r);
      }
    }
    return Array.from(map.values());
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
})();
