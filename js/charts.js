const Charts = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  function getColors() {
    const s = getComputedStyle(document.documentElement);
    const c = v => s.getPropertyValue(v).trim();
    return {
      accent:  c('--accent'),
      accent2: c('--accent2'),
      up:      c('--up'),
      down:    c('--down'),
      warn:    c('--warn'),
      bg2:     c('--bg2'),
      border:  c('--card-border'),
      text:    c('--text'),
      text2:   c('--text2'),
      text3:   c('--text3'),
    };
  }


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
    const COLORS = getColors();
    svg.innerHTML = '';
    setSvgSize(svg, w, h);
    svg.appendChild(svgText(w / 2, h / 2, msg, {
      'text-anchor': 'middle', fill: COLORS.text3,
      'font-size': '14', 'font-family': 'system-ui',
    }));
  }


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

  function drawXPTimeline(svgEl, transactions, startDate = null, endDate = null) {
    const COLORS = getColors();
    const W = 800, H = 300;
    const PAD = { top: 20, right: 40, bottom: 55, left: 75 };

    svgEl.innerHTML = '';
    if (!transactions?.length) { emptyMsg(svgEl, W, H); return; }

    setSvgSize(svgEl, W, H);

    const sorted = [...transactions].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    let cumBase = 0;
    let all = sorted.map(t => ({ date: new Date(t.createdAt), amount: t.amount }));
    if (startDate) {
      sorted.forEach(t => { if (new Date(t.createdAt) < startDate) cumBase += t.amount; });
      all = all.filter(p => p.date >= startDate);
    }
    if (endDate) {
      all = all.filter(p => p.date <= endDate);
    }
    if (!all.length) { emptyMsg(svgEl, W, H, 'No data in this range'); return; }

    let cum = cumBase;
    const points = all.map(p => { cum += p.amount; return { date: p.date, xp: cum }; });

    const minDate = points[0].date.getTime();
    const maxDate = points[points.length - 1].date.getTime();
    const maxXP   = points[points.length - 1].xp;
    const minXP   = startDate ? cumBase : 0;

    const cw = W - PAD.left - PAD.right;
    const ch = H - PAD.top  - PAD.bottom;

    const sx = d => PAD.left + (d.getTime() - minDate) / Math.max(maxDate - minDate, 1) * cw;
    const sy = v => PAD.top  + ch - (v - minXP) / Math.max(maxXP - minXP, 1) * ch;

    const defs = el('defs');
    const grad = el('linearGradient', { id: 'tlGrad', x1: '0', x2: '0', y1: '0', y2: '1' });
    const s1 = el('stop', { offset: '0%', 'stop-color': COLORS.accent, 'stop-opacity': '0.35' });
    const s2 = el('stop', { offset: '100%', 'stop-color': COLORS.accent, 'stop-opacity': '0.02' });
    grad.append(s1, s2);
    defs.appendChild(grad);
    svgEl.appendChild(defs);

    const gridG = el('g');
    const yStep = Math.ceil((maxXP - minXP) / 5 / 1000) * 1000 || 1;
    for (let v = Math.ceil(minXP / yStep) * yStep; v <= maxXP; v += yStep) {
      const yy = sy(v);
      const line = el('line', { x1: PAD.left, x2: W - PAD.right, y1: yy, y2: yy, stroke: COLORS.border, 'stroke-width': '1' });
      gridG.appendChild(line);
      gridG.appendChild(svgText(PAD.left - 6, yy + 4, fmt(v), { 'text-anchor': 'end', fill: COLORS.text3, 'font-size': '11', 'font-family': 'system-ui' }));
    }
    svgEl.appendChild(gridG);

    const linePts = points.map(p => `${sx(p.date)},${sy(p.xp)}`).join(' ');
    const areaD = `M ${sx(points[0].date)},${sy(points[0].xp)} ` +
                  points.slice(1).map(p => `L ${sx(p.date)},${sy(p.xp)}`).join(' ') +
                  ` L ${sx(points[points.length - 1].date)},${PAD.top + ch} L ${sx(points[0].date)},${PAD.top + ch} Z`;
    svgEl.appendChild(el('path', { d: areaD, fill: 'url(#tlGrad)' }));

    const lineEl = el('path', {
      d: 'M ' + linePts.split(' ').join(' L ').replace(' L ', ' '),
      fill: 'none', stroke: COLORS.accent, 'stroke-width': '2.5', 'stroke-linecap': 'round',
    });
    const len = lineEl.getTotalLength ? lineEl.getTotalLength() : 2000;
    lineEl.style.strokeDasharray  = len;
    lineEl.style.strokeDashoffset = len;
    lineEl.style.animation = 'draw 1.5s ease forwards';
    lineEl.style.setProperty('--dash-total', len);
    svgEl.appendChild(lineEl);

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

    const axisG = el('g');
    [0, points.length - 1].forEach(i => {
      const p = points[i];
      const x = sx(p.date);
      const anchor = i === 0 ? 'start' : 'end';
      axisG.appendChild(el('line', { x1: x, x2: x, y1: PAD.top + ch, y2: PAD.top + ch + 4, stroke: COLORS.border, 'stroke-width': '1' }));
      axisG.appendChild(svgText(x, PAD.top + ch + 16, fmtDate(p.date), { 'text-anchor': anchor, fill: COLORS.text3, 'font-size': '11', 'font-family': 'system-ui' }));
    });
    axisG.appendChild(el('line', { x1: PAD.left, x2: W - PAD.right, y1: PAD.top + ch, y2: PAD.top + ch, stroke: COLORS.border, 'stroke-width': '1' }));
    axisG.appendChild(el('line', { x1: PAD.left, x2: PAD.left, y1: PAD.top, y2: PAD.top + ch, stroke: COLORS.border, 'stroke-width': '1' }));
    svgEl.appendChild(axisG);
  }

  function drawXPByProject(svgEl, transactions) {
    const COLORS = getColors();
    const maxBars = 12;

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
      const hue = 180 + (i / bars.length) * 60;

      barsG.appendChild(el('rect', { x: PAD.left, y, width: bw, height: BAR_H, rx: '5', fill: COLORS.bg2 }));

      const rect = el('rect', { x: PAD.left, y, width: w, height: BAR_H, rx: '5', fill: `hsl(${hue},100%,60%)` });
      rect.style.transformOrigin = `${PAD.left}px ${y + BAR_H / 2}px`;
      rect.style.animation = `barGrow .8s ${i * 0.05}s ease both`;
      barsG.appendChild(rect);

      const label = name.length > 18 ? name.slice(0, 16) + '…' : name;
      barsG.appendChild(svgText(PAD.left - 8, y + BAR_H / 2 + 4, label, {
        'text-anchor': 'end', fill: COLORS.text2, 'font-size': '12', 'font-family': 'system-ui',
      }));

      barsG.appendChild(svgText(PAD.left + w + 6, y + BAR_H / 2 + 4, fmt(xp) + ' XP', {
        fill: COLORS.text, 'font-size': '11', 'font-family': 'system-ui', 'font-weight': '600',
      }));

      const hitbox = el('rect', { x: PAD.left, y, width: bw, height: BAR_H, fill: 'transparent' });
      hitbox.addEventListener('mouseenter', e => showTip(tip, `<strong>${name}</strong><br>${xp.toLocaleString()} XP`, e.clientX, e.clientY));
      hitbox.addEventListener('mousemove',  e => showTip(tip, `<strong>${name}</strong><br>${xp.toLocaleString()} XP`, e.clientX, e.clientY));
      hitbox.addEventListener('mouseleave', () => hideTip(tip));
      barsG.appendChild(hitbox);
    });

    svgEl.appendChild(barsG);
  }

  function drawResultsDonut(svgEl, results) {
    const COLORS = getColors();
    const W = 380, H = 310;
    svgEl.innerHTML = '';

    if (!results?.length) { emptyMsg(svgEl, W, H); return; }
    setSvgSize(svgEl, W, H);

    const pass  = results.filter(r => r.grade >= 1).length;
    const fail  = results.length - pass;
    const total = results.length;
    if (!total) { emptyMsg(svgEl, W, H); return; }

    const CX = W / 2, CY = 130, R = 90, SW = 36;
    const CIRCUM  = 2 * Math.PI * R;
    const passArc = (pass / total) * CIRCUM;
    const failArc = CIRCUM - passArc;
    const OFFSET = CIRCUM * 0.25;

    svgEl.appendChild(el('circle', { cx: CX, cy: CY, r: R, fill: 'none', stroke: COLORS.border, 'stroke-width': SW }));

    svgEl.appendChild(el('circle', {
      cx: CX, cy: CY, r: R, fill: 'none',
      stroke: COLORS.up, 'stroke-width': SW,
      'stroke-dasharray': `${passArc} ${failArc}`,
      'stroke-dashoffset': OFFSET,
      'stroke-linecap': 'butt',
    }));

    if (fail > 0) {
      svgEl.appendChild(el('circle', {
        cx: CX, cy: CY, r: R, fill: 'none',
        stroke: COLORS.down, 'stroke-width': SW,
        'stroke-dasharray': `${failArc} ${passArc}`,
        'stroke-dashoffset': OFFSET - passArc,
        'stroke-linecap': 'butt',
      }));
    }

    svgEl.appendChild(svgText(CX, CY - 10, `${Math.round(pass / total * 100)}%`, {
      'text-anchor': 'middle', fill: COLORS.text, 'font-size': '28', 'font-weight': 'bold', 'font-family': 'system-ui',
    }));
    svgEl.appendChild(svgText(CX, CY + 14, 'Pass Rate', {
      'text-anchor': 'middle', fill: COLORS.text2, 'font-size': '12', 'font-family': 'system-ui',
    }));

    const lgItems = [
      { label: `Pass (${pass})`, color: COLORS.up },
      { label: `Fail (${fail})`, color: COLORS.down },
      { label: `Total (${total})`, color: COLORS.text2 },
    ];
    const legendY  = CY + R + SW / 2 + 28;
    const spacing  = W / (lgItems.length + 1);
    lgItems.forEach(({ label, color }, i) => {
      const lx = spacing * (i + 1);
      svgEl.appendChild(el('rect', { x: lx - 7, y: legendY, width: 14, height: 14, rx: '3', fill: color }));
      svgEl.appendChild(svgText(lx + 10, legendY + 11, label, { fill: COLORS.text2, 'font-size': '12', 'font-family': 'system-ui' }));
    });
  }

  function drawSkillsRadar(svgEl, skills, skillFilter = null) {
    const COLORS = getColors();
    const W = 420, H = 370;
    svgEl.innerHTML = '';

    if (!skills?.length) { emptyMsg(svgEl, W, H); return; }
    setSvgSize(svgEl, W, H);

    const skillMap = {};
    const ALIASES = { 'PROG': 'PROG-1', 'BACK-END': 'BACK', 'FRONT-END': 'FRONT' };
    skills.forEach(s => {
      let name = s.type.replace('skill_', '').toUpperCase();
      name = ALIASES[name] || name;
      skillMap[name] = Math.max(skillMap[name] || 0, s.amount);
    });

    let entries;
    if (skillFilter) {
      entries = skillFilter.map(name => [name, skillMap[name] || 0]);
    } else {
      entries = Object.entries(skillMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
    }

    if (entries.length < 3) { emptyMsg(svgEl, W, H, 'Not enough skill data'); return; }

    const CX = W / 2, CY = H / 2 - 5;
    const RADIUS = 120;
    const n = entries.length;
    const maxVal = Math.max(...entries.map(e => e[1]), 1);

    for (let ring = 1; ring <= 4; ring++) {
      const r = (ring / 4) * RADIUS;
      const pts = Array.from({ length: n }, (_, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
        return `${CX + r * Math.cos(angle)},${CY + r * Math.sin(angle)}`;
      }).join(' ');
      svgEl.appendChild(el('polygon', { points: pts, fill: 'none', stroke: COLORS.border, 'stroke-width': '1' }));
    }

    entries.forEach((_, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      svgEl.appendChild(el('line', {
        x1: CX, y1: CY,
        x2: CX + RADIUS * Math.cos(angle),
        y2: CY + RADIUS * Math.sin(angle),
        stroke: COLORS.border, 'stroke-width': '1',
      }));
    });

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

    entries.forEach(([, val], i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const r = (val / maxVal) * RADIUS;
      svgEl.appendChild(el('circle', {
        cx: CX + r * Math.cos(angle),
        cy: CY + r * Math.sin(angle),
        r: '4', fill: COLORS.accent,
      }));
    });

    entries.forEach(([name, val], i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const lx = CX + (RADIUS + 22) * Math.cos(angle);
      const ly = CY + (RADIUS + 22) * Math.sin(angle);
      const anchor = Math.cos(angle) > 0.1 ? 'start' : Math.cos(angle) < -0.1 ? 'end' : 'middle';
      const t = el('text', { x: lx, y: ly + 4, 'text-anchor': anchor, fill: val > 0 ? COLORS.text2 : COLORS.text3, 'font-size': '11', 'font-family': 'system-ui' });
      t.textContent = val > 0 ? `${name} (${val})` : name;
      svgEl.appendChild(t);
    });
  }

  function drawMonthlyXP(svgEl, transactions, onBarClick = null) {
    const COLORS = getColors();
    const W = 600, H = 280;
    const PAD = { top: 20, right: 20, bottom: 55, left: 65 };

    svgEl.innerHTML = '';
    if (!transactions?.length) { emptyMsg(svgEl, W, H); return; }
    setSvgSize(svgEl, W, H);

    const monthly = {};
    transactions.forEach(t => {
      const d = new Date(t.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthly[key] = (monthly[key] || 0) + t.amount;
    });

    const keys = Object.keys(monthly).sort();
    const [fy, fm] = keys[0].split('-').map(Number);
    const now = new Date();
    const endYr = now.getFullYear(), endMo = now.getMonth() + 1;
    const allKeys = [];
    let cy = fy, cm = fm;
    while (cy < endYr || (cy === endYr && cm <= endMo)) {
      allKeys.push(`${cy}-${String(cm).padStart(2, '0')}`);
      cm++;
      if (cm > 12) { cm = 1; cy++; }
    }
    const entries = allKeys.map(k => [k, monthly[k] || 0]);
    if (!entries.length) { emptyMsg(svgEl, W, H); return; }

    const maxVal = Math.max(...entries.map(e => e[1]), 1);
    const cw = W - PAD.left - PAD.right;
    const ch = H - PAD.top - PAD.bottom;
    const barW = Math.max(4, cw / entries.length - 2);

    const tip = makeTooltip();

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

      if (val > 0) {
        const rect = el('rect', { x, y, width: barW, height: barH, rx: '2', fill: COLORS.accent, opacity: '0.85' });
        rect.style.transformOrigin = `${x + barW / 2}px ${PAD.top + ch}px`;
        rect.style.animation = `barGrow .7s ${i * 0.02}s ease both`;
        g.appendChild(rect);
      }

      const [yr, mo] = key.split('-');
      const labelStep = Math.max(1, Math.ceil(entries.length / 24));
      if (i % labelStep === 0) {
        const moName = new Date(+yr, +mo - 1).toLocaleString('en', { month: 'short' });
        g.appendChild(svgText(x + barW / 2, PAD.top + ch + 14, moName, { 'text-anchor': 'middle', fill: COLORS.text3, 'font-size': '10', 'font-family': 'system-ui' }));
      }
      if (i === 0 || key.split('-')[0] !== entries[i - 1][0].split('-')[0]) {
        g.appendChild(svgText(x + barW / 2, PAD.top + ch + 28, yr, { 'text-anchor': 'middle', fill: COLORS.text3, 'font-size': '9', 'font-family': 'system-ui' }));
      }

      const hit = el('rect', { x, y: PAD.top, width: barW, height: ch, fill: 'transparent' });
      hit.style.cursor = val > 0 ? 'pointer' : 'default';
      const tipLabel = val > 0 ? `<strong>${key}</strong><br>${fmt(val)} XP` : `<strong>${key}</strong><br>No XP`;
      hit.addEventListener('mouseenter', e => showTip(tip, tipLabel, e.clientX, e.clientY));
      hit.addEventListener('mousemove',  e => showTip(tip, tipLabel, e.clientX, e.clientY));
      hit.addEventListener('mouseleave', () => hideTip(tip));
      if (onBarClick && val > 0) {
        hit.addEventListener('click', () => {
          const monthTxns = transactions.filter(t => {
            const d = new Date(t.createdAt);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === key;
          });
          onBarClick(key, monthTxns);
        });
      }
      g.appendChild(hit);
    });

    svgEl.appendChild(el('line', { x1: PAD.left, x2: W - PAD.right, y1: PAD.top + ch, y2: PAD.top + ch, stroke: COLORS.border, 'stroke-width': '1' }));
    svgEl.appendChild(g);
  }

  function drawProgressForecast(svgEl, currentXP, projectedPoints) {
    const COLORS = getColors();
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

    projectedPoints.forEach((p, i) => {
      if (i === 0 || i === projectedPoints.length - 1 || i % Math.ceil(projectedPoints.length / 5) === 0) {
        svgEl.appendChild(el('circle', { cx: sx(i), cy: sy(p.xp), r: '4', fill: COLORS.accent2 }));
        svgEl.appendChild(svgText(sx(i), sy(p.xp) - 8, fmt(p.xp), {
          'text-anchor': 'middle', fill: COLORS.text2, 'font-size': '10', 'font-family': 'system-ui',
        }));
      }
    });

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


  function updateAuditGauge(svgEl, ratio) {
    const COLORS = getColors();
    const arc = svgEl.querySelector('#ov-gauge-arc');
    const txt = svgEl.querySelector('#ov-gauge-val');
    if (!arc || !txt) return;

    const CIRCUM = 251;
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
