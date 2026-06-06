/* ═══════════════════════════════════════════
   NEUSTER PARTICLES — page3.js
   Air Canvas — Fingertip Particle Trails
═══════════════════════════════════════════ */

'use strict';

window.P3 = (() => {

  const ALL_TIPS = [4, 8, 12, 16, 20];

  const FINGER_COLORS = [
    '#a855f7', // thumb  — purple
    '#22d3ee', // index  — cyan
    '#39db87', // middle — green
    '#f59e0b', // ring   — amber
    '#ff4d6d', // pinky  — rose
  ];

  const state = {
    canvas: null,
    ctx: null,
    trails: Array.from({ length: 5 }, () => []),
    trailLength: 50,
    glowIntensity: 8,
    handPresent: false,
    activeFingers: [],
  };

  /* ─── CANVAS SETUP ──────────────────── */
  function initCanvas() {
    state.canvas = document.getElementById('canvas-p3');
    state.ctx    = state.canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    drawLoop();
  }

  function resizeCanvas() {
    const w = state.canvas.offsetWidth  || window.innerWidth;
    const h = state.canvas.offsetHeight || (window.innerHeight - 56);
    state.canvas.width  = w;
    state.canvas.height = h;
  }

  /* ─── DRAW LOOP ─────────────────────── */
  function drawLoop() {
    requestAnimationFrame(drawLoop);
    const ctx = state.ctx;
    const w   = state.canvas.width;
    const h   = state.canvas.height;

    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(0, 0, w, h);

    if (!state.handPresent) return;

    for (let f = 0; f < 5; f++) {
      const trail = state.trails[f];
      if (trail.length < 2) continue;

      const color = FINGER_COLORS[f];
      const glow  = state.glowIntensity;

      ctx.save();
      ctx.shadowBlur  = glow * 4;
      ctx.shadowColor = color;
      ctx.lineCap  = 'round';
      ctx.lineJoin = 'round';

      // Catmull-Rom smooth spline
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      if (trail.length === 2) {
        ctx.lineTo(trail[1].x, trail[1].y);
      } else {
        for (let i = 0; i < trail.length - 1; i++) {
          const p0 = trail[Math.max(i-1, 0)];
          const p1 = trail[i];
          const p2 = trail[i+1];
          const p3 = trail[Math.min(i+2, trail.length-1)];
          ctx.bezierCurveTo(
            p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
            p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
            p2.x, p2.y
          );
        }
      }

      const tip = trail[trail.length - 1];
      const grad = ctx.createLinearGradient(trail[0].x, trail[0].y, tip.x, tip.y);
      grad.addColorStop(0, hexToRgba(color, 0));
      grad.addColorStop(1, hexToRgba(color, 0.9));
      ctx.strokeStyle = grad;
      ctx.lineWidth   = Math.max(2, glow * 0.45);
      ctx.stroke();

      // Glowing dot at tip
      ctx.beginPath(); ctx.arc(tip.x, tip.y, glow * 0.45, 0, Math.PI*2); ctx.fillStyle = color; ctx.fill();
      ctx.beginPath(); ctx.arc(tip.x, tip.y, glow * 0.18, 0, Math.PI*2); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();

      ctx.restore();

      if (Math.random() < 0.25) spawnParticles(tip, color);
    }

    updateFloatingParticles(ctx);
  }

  /* ─── PARTICLES ─────────────────────── */
  const floatingParticles = [];

  function spawnParticles(pos, color) {
    for (let i = 0; i < 2; i++) {
      floatingParticles.push({ x: pos.x+(Math.random()-0.5)*8, y: pos.y+(Math.random()-0.5)*8, vx:(Math.random()-0.5)*2.5, vy:(Math.random()-0.5)*2.5-0.8, life:1.0, color, size:Math.random()*3+1 });
    }
    if (floatingParticles.length > 600) floatingParticles.splice(0, 80);
  }

  function updateFloatingParticles(ctx) {
    for (let i = floatingParticles.length-1; i >= 0; i--) {
      const p = floatingParticles[i];
      p.x += p.vx; p.y += p.vy; p.vy -= 0.05; p.life -= 0.028;
      if (p.life <= 0) { floatingParticles.splice(i,1); continue; }
      ctx.save(); ctx.globalAlpha=p.life; ctx.shadowBlur=5; ctx.shadowColor=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size*p.life,0,Math.PI*2); ctx.fillStyle=p.color; ctx.fill();
      ctx.restore();
    }
  }

  /* ─── HAND TRACKING ─────────────────── */
  function onHandResults(results) {
    const lm = GestureUtils.getLandmarks(results, 0);

    if (!lm) {
      state.handPresent   = false;
      state.activeFingers = [];
      state.trails.forEach(t => { if (t.length > 2) t.splice(0, 2); });
      document.getElementById('tele-msg-p3').textContent = 'Point ☝️ or open hand ✋ to paint';
      return;
    }

    state.handPresent = true;

    const w = state.canvas.width;
    const h = state.canvas.height;

    // Determine active fingers
    const pointing = GestureUtils.isPointing(lm);
    const openHand = GestureUtils.isOpenHand(lm);

    let activeTips;
    if (pointing) {
      activeTips = [{ idx: 1, lmIdx: 8 }];
      document.getElementById('tele-msg-p3').textContent = '☝️ Single trail';
    } else if (openHand) {
      activeTips = ALL_TIPS.map((lmIdx, f) => ({ idx: f, lmIdx }));
      document.getElementById('tele-msg-p3').textContent = '🎨 Painting with 5 fingers...';
    } else {
      activeTips = [];
      const defs = [
        { idx:0, tip:4,  pip:2  },
        { idx:1, tip:8,  pip:6  },
        { idx:2, tip:12, pip:10 },
        { idx:3, tip:16, pip:14 },
        { idx:4, tip:20, pip:18 },
      ];
      defs.forEach(f => { if (lm[f.tip].y < lm[f.pip].y) activeTips.push({ idx: f.idx, lmIdx: f.tip }); });
      document.getElementById('tele-msg-p3').textContent = activeTips.length > 0 ? `✏️ ${activeTips.length} finger${activeTips.length>1?'s':''}` : 'Show fingers to paint';
    }

    state.activeFingers = activeTips.map(a => a.idx);

    // Drain inactive trails
    for (let f = 0; f < 5; f++) {
      if (!state.activeFingers.includes(f) && state.trails[f].length > 2) {
        state.trails[f].splice(0, 3);
      }
    }

    // Push positions for active fingers
    // FIX: with selfieMode=true in app.js, lm.x=0 is screen-left
    // so we do NOT flip x here — the coord is already correct
    activeTips.forEach(({ idx, lmIdx }) => {
      const pt = lm[lmIdx];
      const x  = pt.x * w;   // NO flip needed — selfieMode handles it
      const y  = pt.y * h;

      const trail = state.trails[idx];
      if (trail.length > 0) {
        const last = trail[trail.length-1];
        if ((x-last.x)**2 + (y-last.y)**2 < 9) return; // < 3px, skip
      }
      trail.push({ x, y });
      if (trail.length > state.trailLength) trail.shift();
    });
  }

  /* ─── HELPERS ───────────────────────── */
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function clearCanvas() {
    state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    state.trails.forEach(t => { t.length = 0; });
    floatingParticles.length = 0;
  }

  /* ─── CONTROLS ──────────────────────── */
  function wireControls() {
    document.getElementById('trail-length').addEventListener('input', e => { state.trailLength = +e.target.value; });
    document.getElementById('glow-intensity').addEventListener('input', e => { state.glowIntensity = +e.target.value; });
    document.getElementById('btn-clear-p3').addEventListener('click', clearCanvas);
  }

  function init() { wireControls(); initCanvas(); }
  function startTracking() { /* handled by app.js */ }
  function onActivate() {
    NP._callback = onHandResults;
    resizeCanvas();
  }

  return { init, startTracking, onActivate, onHandResults };
})();

document.addEventListener('DOMContentLoaded', () => P3.init());
