/* ═══════════════════════════════════════════
   NEUSTER PARTICLES — page1.js
   Particle Shape Visualiser
═══════════════════════════════════════════ */

'use strict';

window.P1 = (() => {

  /* ─── STATE ─────────────────────────── */
  const state = {
    scene: null, camera: null, renderer: null,
    particles: null, geometry: null, material: null,
    currentShape: 'saturn',
    targetPositions: null,
    morphProgress: 0,
    morphing: false,
    color: '#39db87',
    particleCount: 5000,
    particleSize: 1.5,
    // Gesture state
    rotVelX: 0, rotVelY: 0,
    scaleVal: 1.0,
    exploding: false,
    explodeTime: 0,
    explodeVelocities: null,
    // Toggles
    rainbowMode: false,
    morphEnabled: true,
    mirrorMode: false,
    audioEnabled: false,
    // Audio
    analyser: null,
    audioData: null,
    // Hand
    lastHandX: null, lastHandY: null,
    handPresent: false,
    clapCooldown: 0,
    pinchCooldown: 0,   // prevent runaway morphing
  };

  /* ─── SHAPE DEFINITIONS ─────────────── */
  const SHAPES = {
    saturn:       { label: '🪐 Saturn',       fn: genSaturn },
    gyroscope:    { label: '⚙️ Gyroscope',    fn: genGyroscope },
    pointy_star:  { label: '⭐ Star',          fn: genStar },
    dna:          { label: '🧬 DNA Helix',     fn: genDNA },
    torus_knot:   { label: '∞ Torus Knot',    fn: genTorusKnot },
    galaxy:       { label: '🌌 Galaxy',        fn: genGalaxy },
    mobius:       { label: '∿ Möbius',         fn: genMobius },
    vortex:       { label: '🌀 Vortex',        fn: genVortex },
    black_hole:   { label: '◉ Black Hole',     fn: genBlackHole },
    cube:         { label: '⬜ Cube',           fn: genCube },
    sphere:       { label: '○ Sphere',         fn: genSphere },
    pyramid:      { label: '△ Pyramid',        fn: genPyramid },
    cone:         { label: '▽ Cone',           fn: genCone },
    heart:        { label: '♥ Heart',          fn: genHeart },
    triangle:     { label: '▲ Triangle',       fn: genTriangle },
    donut:        { label: '⬭ Donut',          fn: genDonut },
    wave:         { label: '〜 Wave',           fn: genWave },
    helix:        { label: '⟳ Spring',         fn: genSpring },
  };

  /* ─── SHAPE GENERATORS ──────────────── */
  function genPositions(n, fn) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = fn(i, n);
      pos[i*3] = x; pos[i*3+1] = y; pos[i*3+2] = z;
    }
    return pos;
  }

  function genSaturn(i, n) {
    const ring = Math.random() < 0.4;
    if (ring) {
      const a = Math.random() * Math.PI * 2;
      const r = 2.2 + Math.random() * 1.3;
      return [Math.cos(a)*r, (Math.random()-0.5)*0.18, Math.sin(a)*r];
    }
    const u = Math.random()*Math.PI*2, v = Math.acos(2*Math.random()-1);
    return [Math.sin(v)*Math.cos(u)*1.1, Math.sin(v)*Math.sin(u)*1.1, Math.cos(v)*1.1];
  }

  function genGyroscope(i, n) {
    const ring = i % 3;
    const a = (i / n) * Math.PI * 2 * 5;
    if (ring === 0) return [Math.cos(a)*2, Math.sin(a)*2, (Math.random()-0.5)*0.1];
    if (ring === 1) return [Math.cos(a)*2, (Math.random()-0.5)*0.1, Math.sin(a)*2];
    return [(Math.random()-0.5)*0.1, Math.cos(a)*2, Math.sin(a)*2];
  }

  function genStar(i, n) {
    const t = (i/n) * Math.PI * 2;
    const r = (i % 2 === 0) ? 2.5 : 1.0;
    return [Math.cos(t)*r, Math.sin(t)*r, (Math.random()-0.5)*0.3];
  }

  function genDNA(i, n) {
    const t = (i/n) * Math.PI * 8;
    const strand = i % 2;
    const offset = strand * Math.PI;
    return [Math.cos(t+offset)*1.2, (i/n)*5 - 2.5, Math.sin(t+offset)*1.2];
  }

  function genTorusKnot(i, n) {
    const t = (i/n)*Math.PI*2, p=2, q=3;
    const r1=1.5, r2=0.5;
    const x = (r1+r2*Math.cos(q*t))*Math.cos(p*t);
    const y = (r1+r2*Math.cos(q*t))*Math.sin(p*t);
    const z = r2*Math.sin(q*t);
    return [x, y, z];
  }

  function genGalaxy(i, n) {
    const arms=3, a=(i/n)*Math.PI*2*arms;
    const r = (i/n)*3.5;
    const spread = (1-i/n)*0.5;
    return [
      Math.cos(a)*r + (Math.random()-0.5)*spread,
      (Math.random()-0.5)*0.3,
      Math.sin(a)*r + (Math.random()-0.5)*spread
    ];
  }

  function genMobius(i, n) {
    const t=(i/n)*Math.PI*2, s=(Math.random()-0.5)*0.8;
    return [
      (1+s/2*Math.cos(t/2))*Math.cos(t)*2,
      (1+s/2*Math.cos(t/2))*Math.sin(t)*2,
      s/2*Math.sin(t/2)
    ];
  }

  function genVortex(i, n) {
    const t=(i/n)*Math.PI*6;
    const r=Math.pow(i/n, 0.5)*2.5;
    return [Math.cos(t)*r, (i/n)*4-2, Math.sin(t)*r];
  }

  function genBlackHole(i, n) {
    const a=Math.random()*Math.PI*2;
    const r=0.5+Math.pow(Math.random(),3)*3.5;
    const warp=0.3/(r*r+0.1);
    return [Math.cos(a)*r, (Math.random()-0.5)*warp*2, Math.sin(a)*r];
  }

  function genCube(i, n) {
    const face=i%6;
    const u=(Math.random()-0.5)*2, v=(Math.random()-0.5)*2;
    const s=1.8;
    if(face===0) return [u*s, v*s, s];
    if(face===1) return [u*s, v*s, -s];
    if(face===2) return [s, u*s, v*s];
    if(face===3) return [-s, u*s, v*s];
    if(face===4) return [u*s, s, v*s];
    return [u*s, -s, v*s];
  }

  function genSphere(i, n) {
    const u=Math.random()*Math.PI*2, v=Math.acos(2*Math.random()-1);
    return [Math.sin(v)*Math.cos(u)*2, Math.cos(v)*2, Math.sin(v)*Math.sin(u)*2];
  }

  function genPyramid(i, n) {
    const side=i%4, t=Math.random(), s=Math.random();
    const h=2.5, base=2;
    if(side===0) return [t*base-base/2, s*h-h, (1-s)*base/2];
    if(side===1) return [t*base-base/2, s*h-h, -(1-s)*base/2];
    if(side===2) return [(1-s)*base/2, s*h-h, t*base-base/2];
    return [-(1-s)*base/2, s*h-h, t*base-base/2];
  }

  function genCone(i, n) {
    const t=(i/n), a=Math.random()*Math.PI*2;
    const r=(1-t)*2;
    return [Math.cos(a)*r, t*4-2, Math.sin(a)*r];
  }

  function genHeart(i, n) {
    const t=(i/n)*Math.PI*2;
    const x=16*Math.pow(Math.sin(t),3);
    const y=13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t);
    return [x*0.13, y*0.13, (Math.random()-0.5)*0.3];
  }

  function genTriangle(i, n) {
    const side=i%3;
    const t=Math.random();
    const h=Math.sqrt(3)/2*2;
    if(side===0) return [t*2-1, -h*0.6, 0];
    if(side===1) return [1-t, (t*h)-h*0.6+h, 0];
    return [-1+t, (1-t)*h-h*0.6+h, 0];
  }

  function genDonut(i, n) {
    const u=Math.random()*Math.PI*2, v=Math.random()*Math.PI*2;
    const R=2, r=0.7;
    return [(R+r*Math.cos(v))*Math.cos(u), r*Math.sin(v), (R+r*Math.cos(v))*Math.sin(u)];
  }

  function genWave(i, n) {
    const x=(Math.random()-0.5)*6;
    const z=(Math.random()-0.5)*6;
    const y=Math.sin(x)*Math.cos(z)*1.2;
    return [x, y, z];
  }

  function genSpring(i, n) {
    const t=(i/n)*Math.PI*12;
    return [Math.cos(t)*1.5, t/6-2.5, Math.sin(t)*1.5];
  }

  /* ─── THREE.JS INIT ─────────────────── */
  function initThree() {
    const canvas = document.getElementById('canvas-p1');
    const w = canvas.offsetWidth  || window.innerWidth;
    const h = canvas.offsetHeight || (window.innerHeight - 56);

    state.scene = new THREE.Scene();

    state.camera = new THREE.PerspectiveCamera(60, w/h, 0.1, 100);
    state.camera.position.set(0, 0, 7);

    state.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    state.renderer.setSize(w, h);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.setClearColor(0x000000, 0);

    buildParticles();

    window.addEventListener('resize', () => {
      const w2 = canvas.offsetWidth, h2 = canvas.offsetHeight;
      state.camera.aspect = w2/h2;
      state.camera.updateProjectionMatrix();
      state.renderer.setSize(w2, h2);
    });

    animate();
  }

  function buildParticles() {
    if (state.particles) {
      state.scene.remove(state.particles);
      state.geometry.dispose();
      state.material.dispose();
    }

    const n = state.particleCount;
    state.geometry = new THREE.BufferGeometry();
    const positions = genPositions(n, SHAPES[state.currentShape].fn);
    state.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const colors = new Float32Array(n * 3);
    const c = new THREE.Color(state.color);
    for (let i = 0; i < n; i++) {
      if (state.rainbowMode) {
        const rc = new THREE.Color().setHSL(i/n, 1, 0.6);
        colors[i*3] = rc.r; colors[i*3+1] = rc.g; colors[i*3+2] = rc.b;
      } else {
        colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
      }
    }
    state.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    state.material = new THREE.PointsMaterial({
      size: state.particleSize * 0.02,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    state.particles = new THREE.Points(state.geometry, state.material);
    state.scene.add(state.particles);
    state.explodeVelocities = null;
  }

  /* ─── MORPH ─────────────────────────── */
  function morphTo(shapeName) {
    if (state.morphing || !SHAPES[shapeName]) return;
    state.currentShape = shapeName;

    document.querySelectorAll('.shape-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.shape === shapeName);
    });

    if (!state.morphEnabled) { buildParticles(); return; }

    state.targetPositions = genPositions(state.particleCount, SHAPES[shapeName].fn);
    state.morphing = true;
    state.morphProgress = 0;
  }

  /* ─── EXPLODE ───────────────────────── */
  function triggerExplode() {
    if (state.exploding) return;
    const n = state.particleCount;
    state.explodeVelocities = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      state.explodeVelocities[i*3]   = (Math.random()-0.5)*0.3;
      state.explodeVelocities[i*3+1] = (Math.random()-0.5)*0.3;
      state.explodeVelocities[i*3+2] = (Math.random()-0.5)*0.3;
    }
    state.exploding = true;
    state.explodeTime = 0;
    updateTelemetry('Clap', state.scaleVal, '💥 BOOM! Reforming...');
  }

  /* ─── ANIMATE ───────────────────────── */
  function animate() {
    requestAnimationFrame(animate);

    const pos = state.geometry.attributes.position.array;
    const n   = state.particleCount;

    // Morph
    if (state.morphing && state.targetPositions) {
      state.morphProgress += 0.02;
      const t = Math.min(state.morphProgress, 1);
      const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
      for (let i = 0; i < n*3; i++) {
        pos[i] += (state.targetPositions[i] - pos[i]) * ease * 0.08;
      }
      if (state.morphProgress >= 1) state.morphing = false;
      state.geometry.attributes.position.needsUpdate = true;
    }

    // Explode & reform
    if (state.exploding) {
      state.explodeTime += 0.016;
      const vel = state.explodeVelocities;
      for (let i = 0; i < n; i++) {
        pos[i*3]   += vel[i*3]   * (1 - state.explodeTime/1.5);
        pos[i*3+1] += vel[i*3+1] * (1 - state.explodeTime/1.5);
        pos[i*3+2] += vel[i*3+2] * (1 - state.explodeTime/1.5);
      }
      if (state.explodeTime > 1.5) {
        state.exploding = false;
        morphTo(state.currentShape);
        buildParticles();
      }
      state.geometry.attributes.position.needsUpdate = true;
    }

    // Audio reactivity
    if (state.audioEnabled && state.analyser) {
      state.analyser.getByteFrequencyData(state.audioData);
      const avg = state.audioData.reduce((a,b)=>a+b,0) / state.audioData.length;
      const pulse = 1 + (avg/255)*0.4;
      state.particles.scale.setScalar(state.scaleVal * pulse);
    } else {
      state.particles.scale.setScalar(state.scaleVal);
    }

    // Smooth rotation damping
    state.particles.rotation.y += state.rotVelX;
    state.particles.rotation.x += state.rotVelY;
    state.rotVelX *= 0.95;
    state.rotVelY *= 0.95;

    // Mirror mode
    if (state.mirrorMode) {
      state.particles.scale.x = -Math.abs(state.particles.scale.x);
    } else {
      state.particles.scale.x = Math.abs(state.particles.scale.x);
    }

    // Rainbow color shift
    if (state.rainbowMode) {
      const colors = state.geometry.attributes.color.array;
      const t = Date.now() * 0.0002;
      for (let i = 0; i < n; i++) {
        const h = (i/n + t) % 1;
        const rc = new THREE.Color().setHSL(h, 1, 0.6);
        colors[i*3] = rc.r; colors[i*3+1] = rc.g; colors[i*3+2] = rc.b;
      }
      state.geometry.attributes.color.needsUpdate = true;
    }

    state.renderer.render(state.scene, state.camera);
  }

  /* ─── TELEMETRY ─────────────────────── */
  function updateTelemetry(gesture, scale, msg) {
    const tel = document.getElementById('telemetry-p1');
    const danger = gesture === 'none';
    tel.className = 'telemetry' + (danger ? ' danger' : '');
    document.getElementById('tele-gesture').textContent = gesture || '—';
    document.getElementById('tele-scale').textContent = (scale||1).toFixed(2) + '×';
    document.getElementById('tele-msg').textContent = msg || '';
  }

  /* ─── HAND TRACKING ─────────────────── */
  function onHandResults(results) {
    if (NP.currentPage !== 1) return;

    const lm0 = GestureUtils.getLandmarks(results, 0);
    const lm1 = GestureUtils.getLandmarks(results, 1);

    if (!lm0) {
      state.handPresent = false;
      state.lastHandX = null; state.lastHandY = null;
      updateTelemetry('none', state.scaleVal, 'No hand detected. Show your hand.');
      return;
    }

    state.handPresent = true;
    const gesture = GestureUtils.detectGesture(results);
    NP.handData.gesture = gesture;

    const handSize = GestureUtils.getHandSize(lm0);
    state.scaleVal = Math.min(Math.max(handSize * 8, 0.5), 3.0);

    // Decrement cooldowns
    if (state.clapCooldown  > 0) state.clapCooldown--;
    if (state.pinchCooldown > 0) state.pinchCooldown--;

    if (gesture === 'open') {
      if (state.lastHandX !== null) {
        const dx = lm0[9].x - state.lastHandX;
        const dy = lm0[9].y - state.lastHandY;
        state.rotVelX += dx * 3;
        state.rotVelY += dy * 3;
      }
      state.lastHandX = lm0[9].x;
      state.lastHandY = lm0[9].y;
      updateTelemetry('Open ✋', state.scaleVal, 'Rotation mode active');

    } else if (gesture === 'fist') {
      state.lastHandX = null; state.lastHandY = null;
      updateTelemetry('Fist ✊', state.scaleVal, 'Move closer to scale up');

    } else if (gesture === 'clap') {
      state.lastHandX = null;
      if (state.clapCooldown <= 0) {
        triggerExplode();
        state.clapCooldown = 60;
      }

    } else if (gesture === 'pinch' && state.morphEnabled) {
      // Only morph once per pinch gesture, not every frame
      if (state.pinchCooldown <= 0) {
        const shapeKeys = Object.keys(SHAPES);
        const idx  = shapeKeys.indexOf(state.currentShape);
        const next = shapeKeys[(idx+1) % shapeKeys.length];
        morphTo(next);
        state.pinchCooldown = 60;
        updateTelemetry('Pinch 🤏', state.scaleVal, `Morphing to ${SHAPES[next].label}`);
      }

    } else {
      state.lastHandX = null; state.lastHandY = null;
      updateTelemetry(gesture, state.scaleVal, '');
    }
  }

  /* ─── CONTROL PANEL WIRING ───────────── */
  function buildShapeGrid() {
    const grid = document.getElementById('shape-grid');
    grid.innerHTML = '';
    Object.entries(SHAPES).forEach(([key, s]) => {
      const btn = document.createElement('button');
      btn.className = 'shape-btn' + (key === state.currentShape ? ' active' : '');
      btn.dataset.shape = key;
      btn.textContent = s.label;
      btn.addEventListener('click', () => morphTo(key));
      grid.appendChild(btn);
    });
  }

  function wireControls() {
    document.getElementById('btn-rainbow').addEventListener('click', () => {
      state.rainbowMode = !state.rainbowMode;
      document.getElementById('toggle-rainbow').classList.toggle('active', state.rainbowMode);
      if (!state.rainbowMode) {
        const c = new THREE.Color(state.color);
        const colors = state.geometry.attributes.color.array;
        for (let i = 0; i < state.particleCount; i++) {
          colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
        }
        state.geometry.attributes.color.needsUpdate = true;
      }
    });

    document.getElementById('btn-morph').addEventListener('click', () => {
      state.morphEnabled = !state.morphEnabled;
      document.getElementById('toggle-morph').classList.toggle('active', state.morphEnabled);
    });

    document.getElementById('btn-mirror').addEventListener('click', () => {
      state.mirrorMode = !state.mirrorMode;
      document.getElementById('toggle-mirror').classList.toggle('active', state.mirrorMode);
    });

    document.getElementById('btn-audio').addEventListener('click', async () => {
      state.audioEnabled = !state.audioEnabled;
      document.getElementById('toggle-audio').classList.toggle('active', state.audioEnabled);
      if (state.audioEnabled && !state.analyser) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const source = ctx.createMediaStreamSource(stream);
          state.analyser = ctx.createAnalyser();
          state.analyser.fftSize = 256;
          state.audioData = new Uint8Array(state.analyser.frequencyBinCount);
          source.connect(state.analyser);
        } catch(e) {
          state.audioEnabled = false;
          document.getElementById('toggle-audio').classList.remove('active');
          alert('Microphone access denied.');
        }
      }
    });

    document.getElementById('particle-color').addEventListener('input', e => {
      state.color = e.target.value;
      if (!state.rainbowMode) {
        const c = new THREE.Color(state.color);
        const colors = state.geometry.attributes.color.array;
        for (let i = 0; i < state.particleCount; i++) {
          colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
        }
        state.geometry.attributes.color.needsUpdate = true;
      }
    });

    document.getElementById('particle-size').addEventListener('input', e => {
      state.particleSize = +e.target.value;
      if (state.material) state.material.size = state.particleSize * 0.02;
    });

    document.getElementById('particle-count').addEventListener('input', e => {
      state.particleCount = +e.target.value;
      buildParticles();
    });

    document.getElementById('btn-export-p1').addEventListener('click', () => {
      alert('Export feature: In a full build, this would export the current particle configuration as an STL file using a custom serialiser.');
    });
  }

  /* ─── PUBLIC API ────────────────────── */
  function init() {
    buildShapeGrid();
    wireControls();
    initThree();
    // Hand tracking is started lazily by app.js via startTracking()
  }

  function startTracking() {
    setupHandTracking('video-p1', 'pip-canvas-p1', onHandResults);
  }

  function onActivate() {
    if (state.renderer) {
      const canvas = document.getElementById('canvas-p1');
      const w = canvas.offsetWidth  || window.innerWidth;
      const h = canvas.offsetHeight || (window.innerHeight - 56);
      state.camera.aspect = w/h;
      state.camera.updateProjectionMatrix();
      state.renderer.setSize(w, h);
    }
  }

  return { init, startTracking, onActivate };

})();

document.addEventListener('DOMContentLoaded', () => P1.init());
