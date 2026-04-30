/**
 * charts.js — SVG chart generation
 *
 * Charts implemented:
 *  1. drawXPTimeline   — line/area chart (XP cumulative over time)
 *  2. drawXPByProject  — horizontal bar chart (top projects by XP)
 *  3. drawResultsDonut — donut chart (pass vs fail)
 *  4. drawSkillsRadar  — radar/spider chart (skill levels)
 *  5. drawMonthlyXP    — vertical bar chart (XP per month)
 *  6. drawProgressLine — simplified line for advisor projection
 */

const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const COLORS = {
    accent:  '#00d4ff',
    accent2: '#7c3aed',
    up:      '#10b981',
    down:    '#ef4444',
    warn:    '#f59e0b',
    bg2:     '#13162a',
    border:  '#252845',
    text:    '#e2e8f0',
    text2:   '#94a3b8',
    text3:   '#4a5568',
  };

  // ── Helpers ────────────────────────────────────────────────────────

  function el(tag, attrs = {}) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }
  function svgText(x, y, str, attrs = {}) {
    const t = el('text', { x, y, ...attrs });
    t.textContent = str;
    return t;
  }
  function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(Math.round(n));
  }
  function fmtDate(d) {
    return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function setSvgSize(svg, w, h) {
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width',   '100%');
    svg.setAttribute('height',  h);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  function emptyMsg(svg, w, h, msg = 'No data yet') {
    svg.innerHTML = '';
    setSvgSize(svg, w, h);
    svg.appendChild(svgText(w / 2, h / 2, msg, {
      'text-anchor': 'middle', fill: COLORS.text3,
      'font-size': '14', 'font-family': 'system-ui',
    }));
  }

  // ── Tooltip (HTML overlay) ─────────────────────────────────────────
  function makeTooltip() {
    let tip = document.querySelector('.chart-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-tooltip hidden';
      document.body.appendChild(tip);
    }
    return tip;
  }
  function showTip(tip, html, x, y) {
    tip.innerHTML = html;
    tip.classList.remove('hidden');
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = clamp(x + 12, 8, window.innerWidth  - tw - 8) + 'px';
    tip.style.top  = clamp(y - th - 8, 8, window.innerHeight - th - 8) + 'px';
  }
  function hideTip(tip) { tip.classList.add('hidden'); }

  // ══════════════════════════════════════════════════════════════════
  // 1. XP TIMELINE  (line + area chart)
  // ══════════════════════════════════════════════════════════════════
  function drawXPTimeline(svgEl, transactions, filterDays = 0) {
    const W = 800, H = 300;
    const PAD = { top: 20, right: 40, bottom: 55, left: 75 };

    svgEl.innerHTML = '';
    if (!transactions?.length) { emptyMsg(svgEl, W, H); return; }

    setSvgSize(svgEl, W, H);

    // Filter & build cumulative series
    const now = Date.now();
    let all = transactions.map(t => ({ date: new Date(t.createdAt), amount: t.amount }));
    if (filterDays > 0) {
      const cutoff = now - filterDays * 86400000;
      all = all.filter(p => p.date.getTime() >= cutoff);
    }
    if (!all.length) { emptyMsg(svgEl, W, H, 'No data in this range'); return; }

    // Build cumulative — when filtering, start from base
    let cumBase = 0;
    if (filterDays > 0) {
      // add up XP before the cutoff
      const cutoff = now - filterDays * 86400000;
      transactions.forEach(t => { if (new Date(t.createdAt).getTime() < cutoff) cumBase += t.amount; });
    }
    let cum = cumBase;
    const points = all.map(p => { cum += p.amount; return { date: p.date, xp: cum }; });

    const minDate = points[0].date.getTime();
    const maxDate = points[points.length - 1].date.getTime();
    const maxXP   = points[points.length - 1].xp;
    const minXP   = filterDays > 0 ? cumBase : 0;

    const cw = W - PAD.left - PAD.right;
    const ch = H - PAD.top  - PAD.bottom;

    const sx = d => PAD.left + (d.getTime() - minDate) / Math.max(maxDate - minDate, 1) * cw;
    const sy = v => PAD.top  + ch - (v - minXP) / Math.max(maxXP - minXP, 1) * ch;

    // Defs (gradient)
    const defs = el('defs');
    const grad = el('linearGradient', { id: 'tlGrad', x1: '0', x2: '0', y1: '0', y2: '1' });
    const s1 = el('stop', { offset: '0%', 'stop-color': COLORS.accent, 'stop-opacity': '0.35' });
    const s2 = el('stop', { offset: '100%', 'stop-color': COLORS.accent, 'stop-opacity': '0.02' });
    grad.append(s1, s2);
    defs.appendChild(grad);
    svgEl.appendChild(defs);

    // Grid lines
    const gridG = el('g');
    const yStep = Math.ceil((maxXP - minXP) / 5 / 1000) * 1000 || 1;
    for (let v = Math.ceil(minXP / yStep) * yStep; v <= maxXP; v += yStep) {
      const yy = sy(v);
      const line = el('line', { x1: PAD.left, x2: W - PAD.right, y1: yy, y2: yy, stroke: COLORS.border, 'stroke-width': '1' });
      gridG.appendChild(line);
      gridG.appendChild(svgText(PAD.left - 6, yy + 4, fmt(v), { 'text-anchor': 'end', fill: COLORS.text3, 'font-size': '11', 'font-family': 'system-ui' }));
    }
    svgEl.appendChild(gridG);

    // Area path
    const linePts = points.map(p => `${sx(p.date)},${sy(p.xp)}`).join(' ');
    const areaD = `M ${sx(points[0].date)},${sy(points[0].xp)} ` +
                  points.slice(1).map(p => `L ${sx(p.date)},${sy(p.xp)}`).join(' ') +
                  ` L ${sx(points[points.length - 1].date)},${PAD.top + ch} L ${sx(points[0].date)},${PAD.top + ch} Z`;
    svgEl.appendChild(el('path', { d: areaD, fill: 'url(#tlGrad)' }));

    // Line path with animation
    const lineD = `M ${linePts.replace(/ /g, ' L ')}`.replace('M ', 'M ');
    const lineEl = el('path', {
      d: 'M ' + linePts.split(' ').join(' L ').replace(' L ', ' '),
      fill: 'none', stroke: COLORS.accent, 'stroke-width': '2.5', 'stroke-linecap': 'round',
    });
    // Animated draw
    const len = lineEl.getTotalLength ? lineEl.getTotalLength() : 2000;
    lineEl.style.strokeDasharray  = len;
    lineEl.style.strokeDashoffset = len;
    lineEl.style.animation = `draw 1.5s ease forwards`;
    lineEl.style.setProperty('--dash-total', len);
    svgEl.appendChild(lineEl);

    // Data dots + invisible hit targets for tooltip
    const tip = makeTooltip();
    const dotsG = el('g');
    const STEP = Math.max(1, Math.floor(points.length / 60));
    points.forEach((p, i) => {
      if (i % STEP !== 0 && i !== points.length - 1) return;
      const cx = sx(p.date), cy = sy(p.xp);
      const dot = el('circle', { cx, cy, r: '4', fill: COLORS.accent, opacity: '0.9' });
      const hit = el('circle', { cx, cy, r: '10', fill: 'transparent' });
      hit.addEventListener('mouseenter', e => showTip(tip,
        `<strong>${fmtDate(p.date)}</strong><br>${fmt(p.xp)} XP total`, e.clientX, e.clientY));
      hit.addEventListener('mousemove',  e => showTip(tip,
        `<strong>${fmtDate(p.date)}</strong><br>${fmt(p.xp)} XP total`, e.clientX, e.clientY));
      hit.addEventListener('mouseleave', () => hideTip(tip));
      dotsG.append(dot, hit);
    });
    svgEl.appendChild(dotsG);

    // X axis labels (dates)
    const axisG = el('g');
    const dateStep = Math.max(1, Math.floor(points.length / 8));
    points.forEach((p, i) => {
      if (i % dateStep !== 0 && i !== points.length - 1) return;
      const x = sx(p.date);
      axisG.appendChild(el('line', { x1: x, x2: x, y1: PAD.top + ch, y2: PAD.top + ch + 4, stroke: COLORS.border, 'stroke-width': '1' }));
      axisG.appendChild(svgText(x, PAD.top + ch + 16, fmtDate(p.date), { 'text-anchor': 'middle', fill: COLORS.text3, 'font-size': '10', 'font-family': 'system-ui' }));
    });
    // Axis lines
    axisG.appendChild(el('line', { x1: PAD.left, x2: W - PAD.right, y1: PAD.top + ch, y2: PAD.top + ch, stroke: COLORS.border, 'stroke-width': '1' }));
    axisG.appendChild(el('line', { x1: PAD.left, x2: PAD.left, y1: PAD.top, y2: PAD.top + ch, stroke: COLORS.border, 'stroke-width': '1' }));
    svgEl.appendChild(axisG);
  }

  // ══════════════════════════════════════════════════════════════════
  // 2. XP BY PROJECT  (horizontal bar chart)
  // ══════════════════════════════════════════════════════════════════
  function drawXPByProject(svgEl, transactions) {
    const maxBars = 12;

    // Aggregate XP per project path
    const map = {};
    transactions.forEach(t => {
      const name = t.path ? t.path.split('/').pop() : `obj-${t.objectId}`;
      map[name] = (map[name] || 0) + t.amount;
    });
    let bars = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, maxBars);

    const W  = 600;
    const BAR_H   = 28;
    const BAR_GAP = 10;
    const PAD = { top: 20, right: 90, bottom: 20, left: 140 };
    const H = PAD.top + bars.length * (BAR_H + BAR_GAP) + PAD.bottom;

    svgEl.innerHTML = '';
    if (!bars.length) { emptyMsg(svgEl, W, 300); return; }
    setSvgSize(svgEl, W, H);
    svgEl.setAttribute('height', H);

    const maxVal = bars[0][1];
    const bw = W - PAD.left - PAD.right;

    const tip = makeTooltip();
    const barsG = el('g');

    bars.forEach(([name, xp], i) => {
      const y = PAD.top + i * (BAR_H + BAR_GAP);
      const w = (xp / maxVal) * bw;
      const hue = 180 + (i / bars.length) * 60; // cyan → blue gradient per bar

      // Background track
      barsG.appendChild(el('rect', { x: PAD.left, y, width: bw, height: BAR_H, rx: '5', fill: COLORS.bg2 }));

      // Filled bar with animation
      const rect = el('rect', { x: PAD.left, y, width: w, height: BAR_H, rx: '5', fill: `hsl(${hue},100%,60%)` });
      rect.style.transformOrigin = `${PAD.left}px ${y + BAR_H / 2}px`;
      rect.style.animation = `barGrow .8s ${i * 0.05}s ease both`;
      barsG.appendChild(rect);

      // Label (left)
      const label = name.length > 18 ? name.slice(0, 16) + '…' : name;
      barsG.appendChild(svgText(PAD.left - 8, y + BAR_H / 2 + 4, label, {
        'text-anchor': 'end', fill: COLORS.text2, 'font-size': '12', 'font-family': 'system-ui',
      }));

      // Value (right)
      barsG.appendChild(svgText(PAD.left + w + 6, y + BAR_H / 2 + 4, fmt(xp) + ' XP', {
        fill: COLORS.text, 'font-size': '11', 'font-family': 'system-ui', 'font-weight': '600',
      }));

      // Tooltip
      const hitbox = el('rect', { x: PAD.left, y, width: bw, height: BAR_H, fill: 'transparent' });
      hitbox.addEventListener('mouseenter', e => showTip(tip, `<strong>${name}</strong><br>${xp.toLocaleString()} XP`, e.clientX, e.clientY));
      hitbox.addEventListener('mousemove',  e => showTip(tip, `<strong>${name}</strong><br>${xp.toLocaleString()} XP`, e.clientX, e.clientY));
      hitbox.addEventListener('mouseleave', () => hideTip(tip));
      barsG.appendChild(hitbox);
    });

    svgEl.appendChild(barsG);
  }

  // ══════════════════════════════════════════════════════════════════
  // 3. RESULTS DONUT  (pass vs fail donut chart)
  // ══════════════════════════════════════════════════════════════════
  function drawResultsDonut(svgEl, results) {
    const W = 400, H = 320;
    svgEl.innerHTML = '';

    if (!results?.length) { emptyMsg(svgEl, W, H); return; }
    setSvgSize(svgEl, W, H);

    const pass = results.filter(r => r.grade >= 1).length;
    const fail = results.length - pass;
    const total = results.length;
    if (total === 0) { emptyMsg(svgEl, W, H); return; }

    const CX = 160, CY = 145, R = 95, SW = 38;
    const CIRCUM = 2 * Math.PI * R;

    // Draw donut segments using stroke-dasharray trick
    const passArc = (pass / total) * CIRCUM;
    const failArc = CIRCUM - passArc;

    // Pass segment
    const passEl = el('circle', {
      cx: CX, cy: CY, r: R, fill: 'none',
      stroke: COLORS.up, 'stroke-width': SW,
      'stroke-dasharray': `${passArc} ${failArc}`,
      'stroke-dashoffset': CIRCUM * 0.25, // start at top
      'stroke-linecap': 'butt',
    });
    passEl.style.animation = 'draw 1s ease forwards';
    passEl.style.setProperty('--dash-total', CIRCUM);

    // Fail segment
    const failEl = el('circle', {
      cx: CX, cy: CY, r: R, fill: 'none',
      stroke: COLORS.down, 'stroke-width': SW,
      'stroke-dasharray': `${failArc} ${passArc}`,
      'stroke-dashoffset': CIRCUM * 0.25 - passArc,
      'stroke-linecap': 'butt',
    });

    // Background ring
    svgEl.appendChild(el('circle', { cx: CX, cy: CY, r: R, fill: 'none', stroke: COLORS.border, 'stroke-width': SW }));
    svgEl.appendChild(failEl);
    svgEl.appendChild(passEl);

    // Center text
    svgEl.appendChild(svgText(CX, CY - 8, `${Math.round(pass / total * 100)}%`, {
      'text-anchor': 'middle', fill: COLORS.text, 'font-size': '28', 'font-weight': 'bold', 'font-family': 'system-ui',
    }));
    svgEl.appendChild(svgText(CX, CY + 14, 'Pass Rate', {
      'text-anchor': 'middle', fill: COLORS.text2, 'font-size': '12', 'font-family': 'system-ui',
    }));

    // Legend
    const legendX = 270, ly = 100;
    const lgItems = [
      { label: `Pass  (${pass})`, color: COLORS.up },
      { label: `Fail  (${fail})`, color: COLORS.down },
      { label: `Total (${total})`, color: COLORS.text2 },
    ];
    lgItems.forEach(({ label, color }, i) => {
      svgEl.appendChild(el('rect', { x: legendX, y: ly + i * 30, width: 14, height: 14, rx: '3', fill: color }));
      svgEl.appendChild(svgText(legendX + 20, ly + i * 30 + 11, label, { fill: COLORS.text2, 'font-size': '13', 'font-family': 'system-ui' }));
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // 4. SKILLS RADAR  (spider / radar chart)
  // ══════════════════════════════════════════════════════════════════
  function drawSkillsRadar(svgEl, skills) {
    const W = 400, H = 350;
    svgEl.innerHTML = '';

    if (!skills?.length) { emptyMsg(svgEl, W, H); return; }
    setSvgSize(svgEl, W, H);

    // Deduplicate: max level per skill type
    const skillMap = {};
    skills.forEach(s => {
      const name = s.type.replace('skill_', '').toUpperCase();
      skillMap[name] = Math.max(skillMap[name] || 0, s.amount);
    });
    let entries = Object.entries(skillMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (entries.length < 3) { emptyMsg(svgEl, W, H, 'Not enough skill data'); return; }

    const CX = W / 2, CY = H / 2 - 10;
    const RADIUS = 110;
    const n = entries.length;
    const maxVal = Math.max(...entries.map(e => e[1]), 1);

    // Grid rings
    for (let ring = 1; ring <= 4; ring++) {
      const r = (ring / 4) * RADIUS;
      const pts = Array.from({ length: n }, (_, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
        return `${CX + r * Math.cos(angle)},${CY + r * Math.sin(angle)}`;
      }).join(' ');
      svgEl.appendChild(el('polygon', { points: pts, fill: 'none', stroke: COLORS.border, 'stroke-width': '1' }));
    }

    // Spokes
    entries.forEach((_, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      svgEl.appendChild(el('line', {
        x1: CX, y1: CY,
        x2: CX + RADIUS * Math.cos(angle),
        y2: CY + RADIUS * Math.sin(angle),
        stroke: COLORS.border, 'stroke-width': '1',
      }));
    });

    // Data polygon
    const dataPts = entries.map(([, val], i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const r = (val / maxVal) * RADIUS;
      return `${CX + r * Math.cos(angle)},${CY + r * Math.sin(angle)}`;
    }).join(' ');
    svgEl.appendChild(el('polygon', {
      points: dataPts,
      fill: `${COLORS.accent}33`,
      stroke: COLORS.accent,
      'stroke-width': '2',
    }));

    // Data dots
    entries.forEach(([, val], i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const r = (val / maxVal) * RADIUS;
      svgEl.appendChild(el('circle', {
        cx: CX + r * Math.cos(angle),
        cy: CY + r * Math.sin(angle),
        r: '4', fill: COLORS.accent,
      }));
    });

    // Axis labels
    entries.forEach(([name, val], i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const lx = CX + (RADIUS + 20) * Math.cos(angle);
      const ly = CY + (RADIUS + 20) * Math.sin(angle);
      const anchor = Math.cos(angle) > 0.1 ? 'start' : Math.cos(angle) < -0.1 ? 'end' : 'middle';
      const t = el('text', { x: lx, y: ly + 4, 'text-anchor': anchor, fill: COLORS.text2, 'font-size': '11', 'font-family': 'system-ui' });
      t.textContent = `${name} (${val})`;
      svgEl.appendChild(t);
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // 5. MONTHLY XP  (vertical bar chart)
  // ══════════════════════════════════════════════════════════════════
  function drawMonthlyXP(svgEl, transactions) {
    const W = 600, H = 280;
    const PAD = { top: 20, right: 20, bottom: 55, left: 65 };

    svgEl.innerHTML = '';
    if (!transactions?.length) { emptyMsg(svgEl, W, H); return; }
    setSvgSize(svgEl, W, H);

    // Aggregate by YYYY-MM
    const monthly = {};
    transactions.forEach(t => {
      const d = new Date(t.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthly[key] = (monthly[key] || 0) + t.amount;
    });
    const entries = Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b));
    if (!entries.length) { emptyMsg(svgEl, W, H); return; }

    const maxVal = Math.max(...entries.map(e => e[1]), 1);
    const cw = W - PAD.left - PAD.right;
    const ch = H - PAD.top - PAD.bottom;
    const barW = Math.max(8, cw / entries.length - 4);

    const tip = makeTooltip();

    // Y axis grid
    const yStep = Math.ceil(maxVal / 4 / 1000) * 1000 || 1;
    for (let v = yStep; v <= maxVal; v += yStep) {
      const yy = PAD.top + ch - (v / maxVal) * ch;
      svgEl.appendChild(el('line', { x1: PAD.left, x2: W - PAD.right, y1: yy, y2: yy, stroke: COLORS.border, 'stroke-width': '1' }));
      svgEl.appendChild(svgText(PAD.left - 5, yy + 4, fmt(v), { 'text-anchor': 'end', fill: COLORS.text3, 'font-size': '10', 'font-family': 'system-ui' }));
    }

    const g = el('g');
    entries.forEach(([key, val], i) => {
      const x = PAD.left + i * (cw / entries.length) + (cw / entries.length - barW) / 2;
      const barH = (val / maxVal) * ch;
      const y = PAD.top + ch - barH;

      const rect = el('rect', { x, y, width: barW, height: barH, rx: '3', fill: COLORS.accent, opacity: '0.85' });
      rect.style.transformOrigin = `${x + barW / 2}px ${PAD.top + ch}px`;
      rect.style.animation = `barGrow .7s ${i * 0.04}s ease both`;
      g.appendChild(rect);

      // Month label
      const [yr, mo] = key.split('-');
      const moName = new Date(+yr, +mo - 1).toLocaleString('en', { month: 'short' });
      g.appendChild(svgText(x + barW / 2, PAD.top + ch + 14, moName, { 'text-anchor': 'middle', fill: COLORS.text3, 'font-size': '10', 'font-family': 'system-ui' }));

      // Year label (only when year changes)
      if (i === 0 || key.split('-')[0] !== entries[i - 1][0].split('-')[0]) {
        g.appendChild(svgText(x + barW / 2, PAD.top + ch + 28, yr, { 'text-anchor': 'middle', fill: COLORS.text3, 'font-size': '9', 'font-family': 'system-ui' }));
      }

      // Tooltip hitbox
      const hit = el('rect', { x, y: PAD.top, width: barW, height: ch, fill: 'transparent' });
      hit.addEventListener('mouseenter', e => showTip(tip, `<strong>${key}</strong><br>${val.toLocaleString()} XP`, e.clientX, e.clientY));
      hit.addEventListener('mousemove',  e => showTip(tip, `<strong>${key}</strong><br>${val.toLocaleString()} XP`, e.clientX, e.clientY));
      hit.addEventListener('mouseleave', () => hideTip(tip));
      g.appendChild(hit);
    });

    // Axis
    svgEl.appendChild(el('line', { x1: PAD.left, x2: W - PAD.right, y1: PAD.top + ch, y2: PAD.top + ch, stroke: COLORS.border, 'stroke-width': '1' }));
    svgEl.appendChild(g);
  }

  // ══════════════════════════════════════════════════════════════════
  // 6. ADVISOR PROGRESS LINE (simple line chart for forecasting)
  // ══════════════════════════════════════════════════════════════════
  function drawProgressForecast(svgEl, currentXP, projectedPoints) {
    const W = 700, H = 200;
    const PAD = { top: 20, right: 30, bottom: 40, left: 75 };
    svgEl.innerHTML = '';
    if (!projectedPoints?.length) { emptyMsg(svgEl, W, H); return; }
    setSvgSize(svgEl, W, H);

    const maxXP = projectedPoints[projectedPoints.length - 1].xp;
    const cw = W - PAD.left - PAD.right;
    const ch = H - PAD.top  - PAD.bottom;

    const sx = i => PAD.left + (i / (projectedPoints.length - 1)) * cw;
    const sy = v => PAD.top + ch - (v / maxXP) * ch;

    // Area
    const areaD = `M ${sx(0)},${sy(currentXP)} ` +
      projectedPoints.map((p, i) => `L ${sx(i)},${sy(p.xp)}`).join(' ') +
      ` L ${sx(projectedPoints.length - 1)},${PAD.top + ch} L ${sx(0)},${PAD.top + ch} Z`;

    const defs = el('defs');
    const g2 = el('linearGradient', { id: 'fcastGrad', x1: '0', x2: '0', y1: '0', y2: '1' });
    g2.append(
      Object.assign(el('stop', { offset: '0%', 'stop-color': COLORS.accent2, 'stop-opacity': '0.4' })),
      Object.assign(el('stop', { offset: '100%', 'stop-color': COLORS.accent2, 'stop-opacity': '0' }))
    );
    defs.appendChild(g2);
    svgEl.appendChild(defs);

    svgEl.appendChild(el('path', { d: areaD, fill: 'url(#fcastGrad)' }));

    // Line
    const lineD = `M ${sx(0)},${sy(currentXP)} ` +
      projectedPoints.map((p, i) => `L ${sx(i)},${sy(p.xp)}`).join(' ');
    const lineEl = el('path', {
      d: lineD, fill: 'none', stroke: COLORS.accent2, 'stroke-width': '2.5', 'stroke-linecap': 'round',
    });
    const len = 2000;
    lineEl.style.strokeDasharray  = len;
    lineEl.style.strokeDashoffset = len;
    lineEl.style.animation = 'draw 1.2s ease forwards';
    lineEl.style.setProperty('--dash-total', len);
    svgEl.appendChild(lineEl);

    // Labels
    projectedPoints.forEach((p, i) => {
      if (i === 0 || i === projectedPoints.length - 1 || i % Math.ceil(projectedPoints.length / 5) === 0) {
        svgEl.appendChild(el('circle', { cx: sx(i), cy: sy(p.xp), r: '4', fill: COLORS.accent2 }));
        svgEl.appendChild(svgText(sx(i), sy(p.xp) - 8, fmt(p.xp), {
          'text-anchor': 'middle', fill: COLORS.text2, 'font-size': '10', 'font-family': 'system-ui',
        }));
      }
    });

    // X labels (project names)
    projectedPoints.forEach((p, i) => {
      if (i % Math.max(1, Math.floor(projectedPoints.length / 6)) === 0 || i === projectedPoints.length - 1) {
        const lbl = p.label || `+${i + 1}`;
        svgEl.appendChild(svgText(sx(i), PAD.top + ch + 16, lbl.slice(0, 10), {
          'text-anchor': 'middle', fill: COLORS.text3, 'font-size': '10', 'font-family': 'system-ui',
        }));
      }
    });

    svgEl.appendChild(el('line', { x1: PAD.left, x2: W - PAD.right, y1: PAD.top + ch, y2: PAD.top + ch, stroke: COLORS.border, 'stroke-width': '1' }));
  }

  // ── Update audit gauge (overview) ─────────────────────────────────
  function updateAuditGauge(svgEl, ratio) {
    const arc = svgEl.querySelector('#ov-gauge-arc');
    const txt = svgEl.querySelector('#ov-gauge-val');
    if (!arc || !txt) return;

    const CIRCUM = 251; // half-circle perimeter ≈ π × 80
    // Clamp ratio to [0, 2] for display
    const pct = clamp(ratio / 2, 0, 1);
    const offset = CIRCUM * (1 - pct);

    arc.setAttribute('stroke-dashoffset', offset);
    arc.setAttribute('stroke', ratio >= 1 ? COLORS.up : ratio >= 0.8 ? COLORS.warn : COLORS.down);
    txt.textContent = ratio.toFixed(2);
  }

  return {
    drawXPTimeline,
    drawXPByProject,
    drawResultsDonut,
    drawSkillsRadar,
    drawMonthlyXP,
    drawProgressForecast,
    updateAuditGauge,
    fmt,
  };
})();
