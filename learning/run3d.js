// Run3D: a small, dependency-free 3D canvas engine for the learning tutorials (running, gym, skills).
// One viz per page:  Run3D.mount(document.getElementById('viz'), {phases, scene, camera, wrong, timeScale})
//   phases: [{t: 'Posture', d: 4}]           names and seconds; the scrubber shows one button per phase
//   scene(g, s): draw one frame. s = {p, k, t, T, mode}: phase index, 0–1 progress in the phase,
//                seconds in the phase, total seconds, 'right' | 'wrong'. g = drawing helpers below.
//   wrong: true adds a ✓ Right / ✗ Wrong switch (for "common mistakes").
// Step cards with data-phase="N" anywhere on the page jump the animation to that phase and light up with it.
// Colours come from the page theme (tools/output.css), so light and dark mode both work.
(function () {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dir = th => [Math.sin(th), -Math.cos(th), 0];           // angle from straight down, + = forward (x)

  let C = {};
  function theme() {
    const s = getComputedStyle(document.documentElement), v = n => s.getPropertyValue(n).trim();
    C = {ink: v('--ink') || '#1E2B22', muted: v('--muted') || '#5F6F64', line: v('--line') || '#DCEAD7', paper: v('--paper') || '#fff',
         bg: v('--bg') || '#F4F9F2', accent: v('--accent') || '#2E6B3F', gold: v('--gold') || '#9A8A3A', amber: v('--amber') || '#B86A3C',
         bad: v('--bad') || '#A33A2E', ok: v('--ok') || '#2F7A4A', chip: v('--chip') || '#E6F2E2', blue: '#4A78B0',
         dark: matchMedia && (document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches))};
  }
  function hex(c) { c = c.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join(''); const n = parseInt(c, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function shade(c, f, a = 1) {   // f < 0 darker, f > 0 lighter
    if (!c || c[0] !== '#') return c; const [r, g, b] = hex(c);
    const m = x => Math.round(f < 0 ? x * (1 + f) : x + (255 - x) * f);
    return `rgba(${m(r)},${m(g)},${m(b)},${a})`;
  }

  // ---------- body: joints from angles (x forward, y up, z = sideways) ----------
  // o: {P: pelvis [x,y,z], torso (lean, rad), head (extra tilt), legs: [{t: thigh, s: shin, f: foot pitch, z}], arms: [{u: upper, f: forearm, z}]}
  function body(o) {
    const P = o.P, lean = o.torso || 0, L1 = .45, L2 = .45;
    const S = add(P, [Math.sin(lean) * .56, Math.cos(lean) * .56, 0]);
    const ht = lean + (o.head || 0);
    const N = add(S, [Math.sin(lean) * .06, Math.cos(lean) * .06, 0]);
    const H = add(N, [Math.sin(ht) * .16, Math.cos(ht) * .16, 0]);
    const legs = (o.legs || []).map(l => {
      const hip = add(P, [0, 0, l.z]);
      const knee = l.knee || add(hip, mul(dir(l.t), L1));
      const ank = l.ank || add(knee, mul(dir(l.s), L2));
      const fp = l.f || 0;
      const toe = l.toe || add(ank, [Math.cos(fp) * .17, -.05 - Math.sin(fp) * .17, l.toez || 0]);
      const heel = add(ank, [-Math.cos(fp) * .05, -.06 + Math.sin(fp) * .05, 0]);
      return {hip, knee, ank, toe, heel};
    });
    const arms = (o.arms || []).map(a => {
      const sh = add(S, [0, -.04, a.z]);
      const el = a.el || add(sh, mul(dir(a.u), .3));
      const hand = a.hand || add(el, [Math.sin(a.f) * .28, -Math.cos(a.f) * .28, a.hz || 0]);
      return {sh, el, hand};
    });
    return {P, S, N, H, legs, arms};
  }
  // two-link leg/arm solved between two points (a = hip, b = ankle); bend picks the side of the knee (+1 forward)
  function ik(a, b, l1, l2, bend = 1) {
    const d = sub(b, a), dist = Math.min(Math.hypot(d[0], d[1]), l1 + l2 - 1e-4);
    const ang = Math.atan2(d[1], d[0]), c = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
    const t = ang + bend * Math.acos(c);
    return [a[0] + Math.cos(t) * l1, a[1] + Math.sin(t) * l1, (a[2] + b[2]) / 2];
  }
  // running or walking gait. ph = phase (rad), o: {stride 0–1, over (overstride), lean, slouch, armCross, walk, x, z}
  function runner(ph, o = {}) {
    const st = o.stride == null ? 1 : o.stride, walk = !!o.walk;
    const leg = (q, z) => {
      const amp = (walk ? .32 : .42) * st * (o.over ? 1.45 : 1);
      const t = amp * Math.sin(q);
      let flex = walk ? .1 + .55 * Math.max(0, Math.cos(q + .3)) : .22 + (1.15 * st + .1) * Math.max(0, Math.cos(q + .3));
      if (o.over && Math.sin(q) > .6) flex = .04;
      return {t, s: t - flex, f: o.over && Math.sin(q) > .5 ? -.45 : 0, z};
    };
    const legs = [leg(ph, .11), leg(ph + Math.PI, -.11)];
    const len = l => .45 * Math.cos(l.t) + .45 * Math.cos(l.s) + .11;
    const y = Math.max(len(legs[0]), len(legs[1])) + (walk ? 0 : .025 + .03 * (o.over ? 2 : 1) * Math.max(0, Math.cos(2 * ph)));
    const arm = (q, z) => { const u = .55 * st * Math.sin(q + Math.PI); return {u, f: u + (walk ? .5 : 1.45), z, hz: o.armCross ? -Math.sign(z) * .12 : 0}; };
    const lean = o.slouch ? .32 : (o.lean == null ? .1 : o.lean);
    const b = body({P: [o.x || 0, y, o.z || 0], torso: lean, head: o.slouch ? .45 : -.05, legs, arms: [arm(ph, .19), arm(ph + Math.PI, -.19)]});
    b.ground = len(legs[0]) >= len(legs[1]) ? 0 : 1;   // which foot is on the ground
    return b;
  }

  // ---------- mount ----------
  function mount(root, cfg) {
    theme();
    const phases = cfg.phases, cam0 = Object.assign({yaw: -.55, pitch: .28, dist: 4.4, target: [0, .9, 0], fov: 1.25}, cfg.camera || {});
    let cam = {...cam0}, playing = true, speed = 1, p = 0, t = 0, T = 0, mode = 'right', last = 0;
    root.classList.add('viz');
    root.innerHTML = `<div class="viz-stage"><canvas></canvas><div class="viz-cap"></div><div class="viz-hint">Drag to turn · ↺ to reset</div></div>
      <div class="viz-scrub"></div><div class="viz-bar"><span class="viz-fill"></span></div>
      <div class="viz-ctrl"><button type="button" class="main" data-a="play">⏸ Pause</button><button type="button" data-a="prev">‹ Prev</button><button type="button" data-a="next">Next ›</button>
      <button type="button" data-a="view">↺ View</button><span class="viz-speed"><button type="button" data-s=".5">0.5×</button><button type="button" data-s="1" class="on">1×</button><button type="button" data-s="2">2×</button></span>
      ${cfg.wrong ? '<span class="viz-mode"><button type="button" data-m="right" class="on">✓ Right</button><button type="button" data-m="wrong">✗ Wrong</button></span>' : ''}</div>`;
    const cv = root.querySelector('canvas'), ctx = cv.getContext('2d'), cap = root.querySelector('.viz-cap'), fill = root.querySelector('.viz-fill');
    const scrub = root.querySelector('.viz-scrub'), playB = root.querySelector('[data-a=play]');
    scrub.innerHTML = phases.map((ph, i) => `<button type="button" data-p="${i}"><b>${i + 1}</b> ${ph.t}</button>`).join('');
    const steps = [...document.querySelectorAll('[data-phase]')];
    let W = 0, H = 0, dpr = 1;
    function size() { dpr = Math.min(devicePixelRatio || 1, 2); W = cv.clientWidth; H = Math.round(clamp(W * .62, 230, 400)); cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr; }
    function setPhase(i, keep) {
      p = (i + phases.length) % phases.length; if (!keep) t = 0;
      scrub.querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === p));
      steps.forEach(s => s.classList.toggle('live', +s.dataset.phase === p + 1));
      cap.textContent = (phases[p].cap || phases[p].t) + (mode === 'wrong' ? ' · ✗ wrong way' : '');
      cap.classList.toggle('bad', mode === 'wrong');
    }
    // camera projection
    function proj(v) {
      const x0 = v[0] - cam.target[0], y0 = v[1] - cam.target[1], z0 = v[2] - cam.target[2];
      const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      const x1 = cy * x0 + sy * z0, z1 = -sy * x0 + cy * z0;
      const y2 = cp * y0 - sp * z1, z2 = sp * y0 + cp * z1;
      const depth = cam.dist - z2, f = (H * cam.fov) / Math.max(depth, .2);
      return [W / 2 + x1 * f, H * .56 - y2 * f, depth, f];
    }
    // drawing helpers handed to scenes; everything is depth-sorted, labels go on top
    let items = [], labels = [];
    const g = {
      C, lerp, ease, clamp, add, sub, mul, dir, body, runner, ik, TAU,
      seg(a, b, w = .05, col = C.ink, alpha = 1, dash) { const A = proj(a), B = proj(b); items.push({z: (A[2] + B[2]) / 2, f() { ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, w * (A[3] + B[3]) / 2); ctx.setLineDash(dash ? [6, 6] : []); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }}); },
      path(pts, w = .03, col = C.ink, alpha = 1, dash) { for (let i = 1; i < pts.length; i++) g.seg(pts[i - 1], pts[i], w, col, alpha, dash); },
      ball(c, r = .06, col = C.ink, alpha = 1) { const A = proj(c); items.push({z: A[2] - .01, f() { ctx.globalAlpha = alpha; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(A[0], A[1], Math.max(1.5, r * A[3]), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }}); },
      ring(c, r, col = C.accent, w = 2, axis = 'y') { const pts = []; for (let i = 0; i <= 32; i++) { const a = i / 32 * TAU; pts.push(axis === 'y' ? [c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r] : [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2]]); } const P = pts.map(proj); items.push({z: P.reduce((s, q) => s + q[2], 0) / P.length, f() { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); P.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.stroke(); }}); },
      poly(pts, col, alpha = 1, stroke) { const P = pts.map(proj); items.push({z: P.reduce((s, q) => s + q[2], 0) / P.length + .001, f() { ctx.globalAlpha = alpha; ctx.fillStyle = col; ctx.beginPath(); P.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } ctx.globalAlpha = 1; }}); },
      box(a, b, col, alpha = 1) {   // axis-aligned box from corner a to corner b, lit from above
        const [x0, y0, z0] = a, [x1, y1, z1] = b;
        const F = [[[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], .25, [0, 1, 0]], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, [0, 0, 1]],
                   [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], -.1, [0, 0, -1]], [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], -.18, [1, 0, 0]],
                   [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -.18, [-1, 0, 0]]];
        F.forEach(([p0, p1, p2, p3, sh, n]) => {
          const fc = mul(add(p0, p2), .5);
          const ce = proj(fc), cc = proj(add(fc, mul(n, .05)));
          if (cc[2] > ce[2]) return;   // facing away from the camera
          g.poly([p0, p1, p2, p3], shade(col, sh, alpha), 1);
        });
      },
      label(pos, text, o = {}) { labels.push({pos, text, o}); },
      grid(size = 3, step = .5, off = 0, y = 0) {
        const col = C.line; for (let v = -size; v <= size + 1e-6; v += step) { const xo = ((v - off) % (2 * size) + 3 * size) % (2 * size) - size; g.seg([xo, y, -size], [xo, y, size], .006, col, .9); g.seg([-size, y, v], [size, y, v], .006, col, .9); }
      },
      floor(size = 3, y = 0, col) { g.poly([[-size, y - .002, -size], [size, y - .002, -size], [size, y - .002, size], [-size, y - .002, size]], col || C.chip, .55); },
      figure(b, o = {}) {   // draw a body from body()/runner(); o.hl = {legs, arms, torso, head, l0, l1} parts to highlight, o.col
        const base = o.col || (C.dark ? '#B9C9BD' : '#5B6B60'), hl = o.hl || {}, hc = o.hc || C.accent, w = o.w || .075;
        const c = part => hl[part] ? hc : base;
        g.seg(b.P, b.S, w * 1.5, c('torso'));
        g.seg(b.S, b.N, w, c('torso'));
        g.ball(b.H, .11, c('head'));
        b.legs.forEach((l, i) => { const cc = hl.legs || hl['l' + i] ? hc : base; g.seg(add(b.P, [0, 0, l.hip[2]]), l.hip, w, cc); g.seg(l.hip, l.knee, w * 1.15, cc); g.seg(l.knee, l.ank, w, cc); g.seg(l.heel, l.toe, w * .8, hl.feet || hl['f' + i] ? hc : cc); });
        b.arms.forEach((a, i) => { const cc = hl.arms || hl['a' + i] ? hc : base; g.seg([b.S[0], b.S[1] - .04, b.S[2]], a.sh, w * .9, c('torso')); g.seg(a.sh, a.el, w * .8, cc); g.seg(a.el, a.hand, w * .7, cc); });
      },
      shadow(b, y = 0) { const c = [b.P[0], y + .003, b.P[2]]; g.poly([0, 1, 2, 3, 4, 5, 6, 7].map(i => [c[0] + Math.cos(i / 8 * TAU) * .32, y, c[2] + Math.sin(i / 8 * TAU) * .18]), C.ink, .08); },
    };
    function frame(now) {
      const dt = Math.min((now - (last || now)) / 1000, .05); last = now;
      if (playing) { t += dt * speed; T += dt * speed * (cfg.timeScale || 1); if (t >= phases[p].d) setPhase(p + 1); }
      const k = clamp(t / phases[p].d, 0, 1);
      fill.style.width = ((p + k) / phases.length * 100) + '%';
      items = []; labels = [];
      cfg.scene(g, {p, k, t, T, mode});
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      items.sort((a, b) => b.z - a.z).forEach(it => it.f());
      ctx.font = '600 12px system-ui, -apple-system, Segoe UI, sans-serif'; ctx.textBaseline = 'middle';
      labels.forEach(({pos, text, o}) => {
        const A = proj(pos), tw = ctx.measureText(text).width, x = clamp(A[0] + (o.dx || 0), tw / 2 + 6, W - tw / 2 - 6), y = clamp(A[1] + (o.dy || 0), 12, H - 12);
        const col = o.col || C.accent;
        if (o.dx || o.dy) { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(x, y); ctx.stroke(); }
        ctx.fillStyle = C.paper; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - tw / 2 - 6, y - 10, tw + 12, 20, 10) : ctx.rect(x - tw / 2 - 6, y - 10, tw + 12, 20); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(text, x, y + .5);
      });
      requestAnimationFrame(frame);
    }
    // controls
    root.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.p) { setPhase(+b.dataset.p); }
      if (b.dataset.a === 'play') { playing = !playing; playB.textContent = playing ? '⏸ Pause' : '▶ Play'; }
      if (b.dataset.a === 'prev') setPhase(p - 1);
      if (b.dataset.a === 'next') setPhase(p + 1);
      if (b.dataset.a === 'view') cam = {...cam0};
      if (b.dataset.s) { speed = +b.dataset.s; root.querySelectorAll('[data-s]').forEach(x => x.classList.toggle('on', x === b)); }
      if (b.dataset.m) { mode = b.dataset.m; root.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b)); setPhase(p, true); }
    });
    steps.forEach(s => s.addEventListener('click', e => { if (e.target.closest('a, input, label')) return; setPhase(+s.dataset.phase - 1); root.scrollIntoView({behavior: 'smooth', block: 'center'}); }));
    let drag = null;
    cv.addEventListener('pointerdown', e => { drag = {x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch}; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { if (!drag) return; cam.yaw = drag.yaw - (e.clientX - drag.x) * .01; cam.pitch = clamp(drag.pitch + (e.clientY - drag.y) * .006, -.15, 1.35); });
    const end = () => drag = null; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    addEventListener('resize', () => { theme(); Object.assign(g.C, C); size(); });
    if (matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { theme(); Object.assign(g.C, C); });
    if (matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { playing = false; playB.textContent = '▶ Play'; }
    size(); setPhase(0); requestAnimationFrame(frame);
    return {goto: i => setPhase(i)};
  }

  // ---------- page helpers shared by every tutorial page ----------
  // checklist ticks (ul.check[data-key]) and the "mark this tutorial done" button (button[data-done="N"]) → run:done on the syllabus
  function page() {
    document.querySelectorAll('ul.check[data-key]').forEach(ul => {
      const key = ul.dataset.key, box = [...ul.querySelectorAll('input')];
      let on = []; try { on = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) {}
      box.forEach((c, i) => { c.checked = on.includes(i); c.addEventListener('change', () => { on = box.map((x, k) => x.checked ? k : -1).filter(k => k >= 0); try { localStorage.setItem(key, JSON.stringify(on)); } catch (e) {} }); });
    });
    document.querySelectorAll('button[data-done]').forEach(b => {
      const n = +b.dataset.done, key = b.dataset.key || 'run:done';
      let done = []; try { done = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) {}
      const paint = () => { const on = done.includes(n); b.textContent = on ? '✓ Done: tap to undo' : 'Mark this tutorial done'; b.classList.toggle('main', !on); };
      b.addEventListener('click', () => { done = done.includes(n) ? done.filter(x => x !== n) : done.concat(n); try { localStorage.setItem(key, JSON.stringify(done)); } catch (e) {} paint(); });
      paint();
    });
    const links = [...document.querySelectorAll('.barnav a')], secs = links.map(a => document.querySelector(a.getAttribute('href')));
    const onScroll = () => { let k = 0; secs.forEach((h, i) => { if (h && h.getBoundingClientRect().top < 140) k = i; }); links.forEach((a, i) => a.classList.toggle('on', i === k)); };
    addEventListener('scroll', onScroll, {passive: true}); onScroll();
  }
  window.Run3D = {mount, page, runner, body, ik, lerp, ease, clamp};
})();
