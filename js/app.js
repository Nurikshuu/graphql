/**
 * app.js — Main application controller
 *
 * Responsibilities:
 *  - Show login / profile view
 *  - Handle login form submit
 *  - Fetch all data after login
 *  - Populate overview cards
 *  - Wire up tab navigation
 *  - Draw all charts
 *  - Delegate to Calculator and Recommender modules
 */

(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────
  let _data = null; // { user, xp, results, skills, progress }

  // ── Boot ──────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    if (Auth.isAuthenticated()) {
      _showProfile();
      _loadData();
    } else {
      _showLogin();
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // LOGIN
  // ══════════════════════════════════════════════════════════════════
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

  // Toggle password visibility
  document.getElementById('toggle-pwd').addEventListener('click', () => {
    const input = document.getElementById('password');
    input.type  = input.type === 'password' ? 'text' : 'password';
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    Auth.logout();
    _data = null;
    _showLogin();
  });

  // ── View helpers ──────────────────────────────────────────────────
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

  // ══════════════════════════════════════════════════════════════════
  // DATA LOADING
  // ══════════════════════════════════════════════════════════════════
  async function _loadData() {
    const loader = document.getElementById('data-loader');
    loader.classList.remove('hidden');

    try {
      _data = await API.fetchAll();
      _populateOverview(_data);
      _populateStats(_data);
      Calculator.init(_data.user);
      Recommender.init(_data.user, _data.xp);
    } catch (err) {
      console.error('Data load failed:', err);
      // Session expired?
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
    div.innerHTML = `<p style="font-size:1rem">⚠️ ${msg}</p><button onclick="location.reload()" style="margin-top:1rem;padding:.5rem 1rem;border:1px solid var(--down);border-radius:8px;color:var(--down);cursor:pointer">Retry</button>`;
    main.prepend(div);
  }

  // ══════════════════════════════════════════════════════════════════
  // OVERVIEW POPULATION
  // ══════════════════════════════════════════════════════════════════
  function _populateOverview({ user, xp, results }) {
    if (!user) return;

    // Header chip
    document.getElementById('chip-avatar').textContent = (user.login || '?')[0].toUpperCase();
    document.getElementById('chip-name').textContent   = user.login || 'User';

    // Profile card
    const initials = (user.login || '?')[0].toUpperCase();
    document.getElementById('ov-avatar').textContent  = initials;
    document.getElementById('ov-login').textContent   = user.login    || '—';
    document.getElementById('ov-campus').textContent  = user.campus   || 'campus';
    document.getElementById('ov-id').textContent      = `#${user.id}`;
    document.getElementById('ov-joined').textContent  = user.createdAt
      ? new Date(user.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—';

    // Count unique projects
    const uniqueProjects = new Set(xp.map(t => t.path?.split('/').pop())).size;
    document.getElementById('ov-projects').textContent = uniqueProjects || '—';

    // XP card
    const totalXP = xp.reduce((s, t) => s + t.amount, 0);
    document.getElementById('ov-xp-total').textContent = totalXP.toLocaleString();
    document.getElementById('ov-xp-count').textContent = xp.length;
    document.getElementById('ov-xp-avg').textContent   = xp.length
      ? Math.round(totalXP / xp.length).toLocaleString()
      : '0';
    const maxXP = xp.length ? Math.max(...xp.map(t => t.amount)) : 0;
    document.getElementById('ov-xp-max').textContent = maxXP.toLocaleString();

    // XP this month
    const now = new Date();
    const monthXP = xp
      .filter(t => {
        const d = new Date(t.createdAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((s, t) => s + t.amount, 0);
    document.getElementById('ov-xp-month').textContent = monthXP.toLocaleString() + ' XP';

    // Audit card
    const ratio    = user.auditRatio || 0;
    const totalUp  = user.totalUp    || 0;
    const totalDown= user.totalDown  || 0;

    document.getElementById('ov-gauge-val').textContent = ratio.toFixed(2);
    document.getElementById('ov-up').textContent   = _fmtBytes(totalUp);
    document.getElementById('ov-down').textContent = _fmtBytes(totalDown);

    Charts.updateAuditGauge(document.getElementById('ov-gauge-svg'), ratio);

    const maxAudit = Math.max(totalUp, totalDown, 1);
    document.getElementById('abar-up').style.width   = (totalUp   / maxAudit * 100) + '%';
    document.getElementById('abar-down').style.width = (totalDown / maxAudit * 100) + '%';

    const msgEl = document.getElementById('audit-msg');
    if (ratio >= 1) {
      msgEl.className = 'audit-msg good';
      msgEl.textContent = `✅ Great ratio! You've given more audits than you received.`;
    } else if (ratio >= 0.8) {
      msgEl.className = 'audit-msg';
      msgEl.textContent = `⚠️ Ratio is close — give a few more audits to reach 1.0.`;
      msgEl.style.color = 'var(--warn)';
    } else {
      msgEl.className = 'audit-msg bad';
      msgEl.textContent = `❌ Ratio below 1.0 — prioritise giving audits before submitting new projects.`;
    }

    // Recent activity
    _renderActivity(xp, results);
  }

  function _renderActivity(xp, results) {
    const container = document.getElementById('activity-list');

    // Merge XP + result events, sort by date desc, take top 10
    const events = [];
    xp.slice(-20).forEach(t => events.push({
      type: 'xp',
      name: t.path?.split('/').pop() || `obj-${t.objectId}`,
      amount: t.amount,
      date: new Date(t.createdAt),
    }));
    results.slice(0, 20).forEach(r => events.push({
      type: r.grade >= 1 ? 'pass' : 'fail',
      name: r.object?.name || r.path?.split('/').pop() || `#${r.objectId}`,
      grade: r.grade,
      date: new Date(r.createdAt),
    }));

    events.sort((a, b) => b.date - a.date);
    const recent = events.slice(0, 10);

    if (!recent.length) {
      container.innerHTML = '<p class="placeholder-text">No activity yet.</p>';
      return;
    }

    container.innerHTML = recent.map(ev => {
      const icon   = ev.type === 'xp' ? '⚡' : ev.type === 'pass' ? '✅' : '❌';
      const cls    = ev.type === 'xp' ? 'xp-type' : '';
      const detail = ev.type === 'xp'
        ? `+${ev.amount.toLocaleString()} XP`
        : ev.type === 'pass' ? 'Passed' : 'Failed';
      const dateStr = ev.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      return `
        <div class="activity-item ${cls}">
          <span class="activity-icon">${icon}</span>
          <div class="activity-details">
            <div class="activity-name" title="${_esc(ev.name)}">${_esc(ev.name)}</div>
            <div class="activity-meta">${dateStr}</div>
          </div>
          <span class="activity-xp" style="${ev.type === 'fail' ? 'color:var(--down)' : ''}">${detail}</span>
        </div>`;
    }).join('');
  }

  // ══════════════════════════════════════════════════════════════════
  // STATISTICS CHARTS
  // ══════════════════════════════════════════════════════════════════
  let _lastFilterDays = 0;

  function _populateStats({ xp, results, skills }) {
    // Draw all charts
    _drawAllCharts(xp, results, skills);

    // Timeline filter buttons
    document.getElementById('timeline-filter').addEventListener('click', e => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      document.querySelectorAll('#timeline-filter .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _lastFilterDays = parseInt(btn.dataset.days) || 0;
      Charts.drawXPTimeline(document.getElementById('svg-timeline'), xp, _lastFilterDays);
    });
  }

  function _drawAllCharts(xp, results, skills) {
    Charts.drawXPTimeline  (document.getElementById('svg-timeline'),  xp, 0);
    Charts.drawXPByProject (document.getElementById('svg-projects'),  xp);
    Charts.drawResultsDonut(document.getElementById('svg-results'),   results);
    Charts.drawSkillsRadar (document.getElementById('svg-skills'),    skills);
    Charts.drawMonthlyXP   (document.getElementById('svg-monthly'),   xp);
  }

  // Redraw charts when stats tab becomes visible (handles initial layout)
  function _onTabChange(tab) {
    if (tab === 'stats' && _data) {
      // Small delay to let the panel be visible so SVG clientWidth is correct
      setTimeout(() => _drawAllCharts(_data.xp, _data.results, _data.skills), 50);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // TAB NAVIGATION
  // ══════════════════════════════════════════════════════════════════
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      // Update nav buttons
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Show/hide panels
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      const panel = document.getElementById(`tab-${tab}`);
      if (panel) {
        panel.classList.remove('hidden');
        panel.classList.add('active');
      }

      _onTabChange(tab);
    });
  });

  // ── Helpers ───────────────────────────────────────────────────────
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
})();
