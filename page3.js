/* ═══════════════════════════════════════════
   NEUSTER PARTICLES — page3.js
   Air Canvas — Fingertip Particle Trails
═══════════════════════════════════════════ */

'use strict';

window.P3 = (() => {

  const FINGER_TIPS = [4, 8, 12, 16, 20]; // thumb, index, middle, ring, pinky

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

    // Fade / trail persistence
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 0, w, h);

    if (!state.handPresent) return;

    for (let f = 0; f < 5; f++) {
      const trail = state.trails[f];
      if (trail.length < 2) continue;

      const color = FINGER_COLORS[f];
      const glow  = state.glowIntensity;

      ctx.save();
      ctx.shadowBlur  = glow * 3;
      ctx.shadowColor = color;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';

      for (let i = 1; i < trail.length; i++) {
        const t     = i / trail.length;
        const alpha = t * 0.9;
        const width = t * (glow * 0.5);

        ctx.beginPath();
        ctx.moveTo(trail[i-1].x, trail[i-1].y);
        ctx.lineTo(trail[i].x,   trail[i].y);
        ctx.strokeStyle = hexToRgba(color, alpha);
        ctx.lineWidth   = Math.max(1, width);
        ctx.stroke();
      }

      // Bright dot at fingertip
      if (trail.length > 0) {
        const tip = trail[trail.length - 1];
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, glow * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        // Inner white core
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, glow * 0.15, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fill();
      }

      ctx.restore();

      // Particle burst at tip
      if (trail.length > 0 && Math.random() < 0.4) {
        spawnParticles(trail[trail.length - 1], color);
      }
    }

    updateFloatingParticles(ctx);
  }

  /* ─── FLOATING PARTICLES ────────────── */
  const floatingParticles = [];

  function spawnParticles(pos, color) {
    for (let i = 0; i < 2; i++) {
      floatingParticles.push({
        x:     pos.x + (Math.random()-0.5)*6,
        y:     pos.y + (Math.random()-0.5)*6,
        vx:    (Math.random()-0.5)*2,
        vy:    (Math.random()-0.5)*2 - 0.5,
        life:  1.0,
        color,
        size:  Math.random() * 3 + 1,
      });
    }
    if (floatingParticles.length > 800) floatingParticles.splice(0, 100);
  }

  function updateFloatingParticles(ctx) {
    for (let i = floatingParticles.length - 1; i >= 0; i--) {
      const p = floatingParticles[i];
      p.x    += p.vx;
      p.y    += p.vy;
      p.vy   -= 0.04;
      p.life -= 0.025;
      if (p.life <= 0) { floatingParticles.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.shadowBlur  = 6;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
    }
  }

  /* ─── HAND TRACKING ─────────────────── */
  function onHandResults(results) {
    if (NP.currentPage !== 3) return;

    const lm = GestureUtils.getLandmarks(results, 0);

    if (!lm) {
      state.handPresent = false;
      state.trails.forEach(t => { if (t.length > 0) t.shift(); });
      document.getElementById('tele-msg-p3').textContent = 'Raise your hand to paint';
      return;
    }

    state.handPresent = true;
    document.getElementById('tele-msg-p3').textContent = '🎨 Painting...';

    const w = state.canvas.width;
    const h = state.canvas.height;

    FINGER_TIPS.forEach((tipIdx, f) => {
      const tip = lm[tipIdx];
      // Mirror the X axis to match the mirrored PIP view
      const x = (1 - tip.x) * w;
      const y = tip.y * h;

      state.trails[f].push({ x, y });

      if (state.trails[f].length > state.trailLength) {
        state.trails[f].shift();
      }
    });
  }

  /* ─── HELPERS ───────────────────────── */
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function clearCanvas() {
    state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    state.trails.forEach(t => { t.length = 0; });
    floatingParticles.length = 0;
  }

  /* ─── CONTROLS WIRING ───────────────── */
  function wireControls() {
    document.getElementById('trail-length').addEventListener('input', e => {
      state.trailLength = +e.target.value;
    });

    document.getElementById('glow-intensity').addEventListener('input', e => {
      state.glowIntensity = +e.target.value;
    });

    document.getElementById('btn-clear-p3').addEventListener('click', clearCanvas);
  }

  /* ─── PUBLIC API ────────────────────── */
  function init() {
    wireControls();
    initCanvas();
    // Hand tracking started lazily by app.js via startTracking()
  }

  function startTracking() {
    setupHandTracking('video-p3', 'pip-canvas-p3', onHandResults);
  }

  function onActivate() {
    resizeCanvas();
  }

  return { init, startTracking, onActivate };

})();

document.addEventListener('DOMContentLoaded', () => P3.init());
