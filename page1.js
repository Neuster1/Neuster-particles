/* ═══════════════════════════════════════════
   NEUSTER PARTICLES — page1.js
   Particle Shape Visualiser
═══════════════════════════════════════════ */

'use strict';

window.P1 = (() => {

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
    scaleVal: 1.0,
    scaleLocked: false,
    rotVelX: 0, rotVelY: 0,
    exploding: false,
    explodeTime: 0,
    explodeVelocities: null,
    rainbowMode: false,
    morphEnabled: true,
    mirrorMode: false,
    audioEnabled: false,
    analyser: null,
    audioData: null,
    lastHandX: null, lastHandY: null,
    handPresent: false,
    prevGesture: 'none',
    clapCooldown: 0,
    pinchCooldown: 0,
    rainbowFrame: 0,
  };

  /* ─── SHAPE DEFINITIONS ─────────────── */
  const SHAPES = {
    saturn:      { label: '🪐 Saturn',     fn: genSaturn },
    gyroscope:   { label: '⚙️ Gyroscope',  fn: genGyroscope },
    pointy_star: { label: '⭐ Star',        fn: genStar },
    dna:         { label: '🧬 DNA Helix',   fn: genDNA },
    torus_knot:  { label: '∞ Torus Knot',  fn: genTorusKnot },
    galaxy:      { label: '🌌 Galaxy',      fn: genGalaxy },
    mobius:      { label: '∿ Möbius',       fn: genMobius },
    vortex:      { label: '🌀 Vortex',      fn: genVortex },
    black_hole:  { label: '◉ Black Hole',   fn: genBlackHole },
    cube:        { label: '⬜ Cube',         fn: genCube },
    sphere:      { label: '○ Sphere',       fn: genSphere },
    pyramid:     { label: '△ Pyramid',      fn: genPyramid },
    cone:        { label: '▽ Cone',         fn: genCone },
    heart:       { label: '♥ Heart',        fn: genHeart },
    triangle:    { label: '▲ Triangle',     fn: genTriangle },
    donut:       { label: '⬭ Donut',        fn: genDonut },
    wave:        { label: '〜 Wave',         fn: genWave },
    helix:       { label: '⟳ Spring',       fn: genSpring },
  };

  function genPositions(n, fn) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const [x,y,z] = fn(i,n); pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z; }
    return pos;
  }
  function genSaturn(i,n) {
    if (Math.random()<0.38) { const a=Math.random()*Math.PI*2,r=1.8+Math.random()*1.6; return [Math.cos(a)*r,(Math.random()-0.5)*0.12,Math.sin(a)*r]; }
    const u=Math.random()*Math.PI*2,v=Math.acos(2*Math.random()-1);
    return [Math.sin(v)*Math.cos(u)*1.05,Math.sin(v)*Math.sin(u)*0.9,Math.cos(v)*1.05];
  }
  function genGyroscope(i,n) {
    const seg=i%4,a=(i/n)*Math.PI*2*6,R=2.2;
    if(seg===0) return [Math.cos(a)*R,Math.sin(a)*R,(Math.random()-0.5)*0.08];
    if(seg===1) return [Math.cos(a)*R,(Math.random()-0.5)*0.08,Math.sin(a)*R];
    if(seg===2) return [(Math.random()-0.5)*0.08,Math.cos(a)*R,Math.sin(a)*R];
    const u=Math.random()*Math.PI*2,v=Math.acos(2*Math.random()-1),r=R*0.35;
    return [Math.sin(v)*Math.cos(u)*r,Math.cos(v)*r,Math.sin(v)*Math.sin(u)*r];
  }
  function genStar(i,n) {
    const numPoints=5,pointIdx=i%numPoints;
    const angle=(pointIdx/numPoints)*Math.PI*2-Math.PI/2;
    const valleyAngle=angle+Math.PI/numPoints;
    const outerR=2.4,innerR=1.0,t=Math.random(),s=Math.random();
    const px=outerR*Math.cos(angle)*t+innerR*Math.cos(valleyAngle)*s*(1-t);
    const py=outerR*Math.sin(angle)*t+innerR*Math.sin(valleyAngle)*s*(1-t);
    return [px,py,(Math.random()-0.5)*0.55*(1-Math.abs(px)/outerR)];
  }
  function genDNA(i,n) {
    const third=n/3;
    if (i<third*2) {
      const strand=i%2,t=(Math.floor(i/2)/third)*Math.PI*10,offset=strand*Math.PI;
      const r=1.3+Math.random()*0.15,theta=Math.random()*Math.PI*2;
      return [Math.cos(t+offset)*r+Math.cos(theta)*0.12,(i/(third*2))*5-2.5,Math.sin(t+offset)*r+Math.sin(theta)*0.12];
    }
    const ri=i-Math.floor(third*2),t=(ri/(n-Math.floor(third*2)))*Math.PI*10,frac=Math.random();
    const r0x=Math.cos(t)*1.3,r0z=Math.sin(t)*1.3,r1x=Math.cos(t+Math.PI)*1.3,r1z=Math.sin(t+Math.PI)*1.3;
    return [r0x+(r1x-r0x)*frac,(ri/(n-Math.floor(third*2)))*5-2.5,r0z+(r1z-r0z)*frac];
  }
  function genTorusKnot(i,n) {
    const t=(i/n)*Math.PI*2,p=2,q=3,r1=1.5,r2=0.5;
    return [(r1+r2*Math.cos(q*t))*Math.cos(p*t),(r1+r2*Math.cos(q*t))*Math.sin(p*t),r2*Math.sin(q*t)];
  }
  function genGalaxy(i,n) {
    const cN=Math.floor(n*0.2);
    if(i<cN){const u=Math.random()*Math.PI*2,v=Math.acos(2*Math.random()-1),r=Math.pow(Math.random(),0.5)*0.9;return [Math.sin(v)*Math.cos(u)*r,Math.cos(v)*r*0.4,Math.sin(v)*Math.sin(u)*r];}
    const arms=4,idx=i-cN,arm=idx%arms,frac=(Math.floor(idx/arms)/((n-cN)/arms));
    const angle=frac*Math.PI*3+(arm/arms)*Math.PI*2,r=0.5+frac*3.0,sp=frac*0.5;
    return [Math.cos(angle)*r+(Math.random()-0.5)*sp,(Math.random()-0.5)*(0.15+frac*0.1),Math.sin(angle)*r+(Math.random()-0.5)*sp];
  }
  function genMobius(i,n) {
    const t=(i/n)*Math.PI*2,s=(Math.random()-0.5)*0.9;
    return [(1+s/2*Math.cos(t/2))*Math.cos(t)*2,(1+s/2*Math.cos(t/2))*Math.sin(t)*2,s/2*Math.sin(t/2)];
  }
  function genVortex(i,n) {
    const frac=i/n,t=frac*Math.PI*8,r=Math.pow(frac,0.6)*3.0,tubeA=Math.random()*Math.PI*2,tubeR=(1-frac)*0.25;
    return [Math.cos(t)*r+Math.cos(tubeA)*tubeR,frac*5-2.5,Math.sin(t)*r+Math.sin(tubeA)*tubeR];
  }
  function genBlackHole(i,n) {
    const seg=i%3;
    if(seg===0){const a=Math.random()*Math.PI*2,r=0.4+Math.pow(Math.random(),1.5)*3.5,warp=0.08/(r*0.5+0.1);return [Math.cos(a)*r,(Math.random()-0.5)*warp*3,Math.sin(a)*r];}
    if(seg===1){const angle=Math.random()*Math.PI*2,h=(Math.random()-0.5)*4,r=Math.abs(h)*0.08;return [Math.cos(angle)*r,h,Math.sin(angle)*r];}
    const u=Math.random()*Math.PI*2,v=Math.acos(2*Math.random()-1);return [Math.sin(v)*Math.cos(u)*0.38,Math.cos(v)*0.38,Math.sin(v)*Math.sin(u)*0.38];
  }
  function genCube(i,n){const face=i%6,u=(Math.random()-0.5)*2,v=(Math.random()-0.5)*2,s=1.8;if(face===0)return[u*s,v*s,s];if(face===1)return[u*s,v*s,-s];if(face===2)return[s,u*s,v*s];if(face===3)return[-s,u*s,v*s];if(face===4)return[u*s,s,v*s];return[u*s,-s,v*s];}
  function genSphere(i,n){const u=Math.random()*Math.PI*2,v=Math.acos(2*Math.random()-1);return[Math.sin(v)*Math.cos(u)*2,Math.cos(v)*2,Math.sin(v)*Math.sin(u)*2];}
  function genPyramid(i,n){const apex=[0,2.2,0],base=[[-1.8,-1.2,-1.8],[1.8,-1.2,-1.8],[1.8,-1.2,1.8],[-1.8,-1.2,1.8]],seg=i%5;if(seg===4){const u=Math.random(),v=Math.random();return[base[0][0]+(base[2][0]-base[0][0])*u,base[0][1],base[0][2]+(base[2][2]-base[0][2])*v];}const b0=base[seg],b1=base[(seg+1)%4],u=Math.random(),v=Math.random()*(1-u);return[b0[0]*u+b1[0]*v+apex[0]*(1-u-v),b0[1]*u+b1[1]*v+apex[1]*(1-u-v),b0[2]*u+b1[2]*v+apex[2]*(1-u-v)];}
  function genCone(i,n){const half=Math.floor(n/2);if(i<half){const t=i/half,a=Math.random()*Math.PI*2,r=(1-t)*2.0;return[Math.cos(a)*r,t*4-2,Math.sin(a)*r];}const t=Math.random(),r2=Math.random()*(1-t)*2.0,a2=Math.random()*Math.PI*2;return[Math.cos(a2)*r2,t*4-2,Math.sin(a2)*r2];}
  function genHeart(i,n){const t=(i/n)*Math.PI*2,x=16*Math.pow(Math.sin(t),3),y=13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t);const cx=0,cy=4,dx=x-cx,dy=y-cy,d=Math.sqrt(dx*dx+dy*dy)||1;return[x*0.145,y*0.145-0.3,(Math.random()-0.5)*1.4*(d/16)];}
  function genTriangle(i,n){const verts=[[-2,-1.15,0],[2,-1.15,0],[0,1.72,0]],seg=i%5;if(seg<2){const u=Math.random(),v=Math.random()*(1-u),z=seg===0?0.5:-0.5;return[verts[0][0]*u+verts[1][0]*v+verts[2][0]*(1-u-v),verts[0][1]*u+verts[1][1]*v+verts[2][1]*(1-u-v),z];}const si=seg-2,v0=verts[si%3],v1=verts[(si+1)%3],t=Math.random();return[v0[0]+(v1[0]-v0[0])*t,v0[1]+(v1[1]-v0[1])*t,(Math.random()-0.5)*1.0];}
  function genDonut(i,n){const u=Math.random()*Math.PI*2,v=Math.random()*Math.PI*2,R=2,r=0.7;return[(R+r*Math.cos(v))*Math.cos(u),r*Math.sin(v),(R+r*Math.cos(v))*Math.sin(u)];}
  function genWave(i,n){const x=(Math.random()-0.5)*6,z=(Math.random()-0.5)*6;return[x,Math.sin(x)*Math.cos(z)*1.2,z];}
  function genSpring(i,n){const t=(i/n)*Math.PI*14,tubeA=Math.random()*Math.PI*2,tubeR=0.12;return[Math.cos(t)*1.5+Math.cos(tubeA)*tubeR,t/7-2.5,Math.sin(t)*1.5+Math.sin(tubeA)*tubeR];}

  /* ─── THREE.JS ──────────────────────── */
  function initThree() {
    const canvas = document.getElementById('canvas-p1');
    const w = canvas.offsetWidth || window.innerWidth;
    const h = canvas.offsetHeight || (window.innerHeight - 56);
    state.scene    = new THREE.Scene();
    state.camera   = new THREE.PerspectiveCamera(60, w/h, 0.1, 100);
    state.camera.position.set(0, 0, 7);
    state.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    state.renderer.setSize(w, h);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.setClearColor(0x000000, 0);
    buildParticles();
    window.addEventListener('resize', () => {
      const w2 = canvas.offsetWidth, h2 = canvas.offsetHeight;
      if (!w2 || !h2) return;
      state.camera.aspect = w2/h2;
      state.camera.updateProjectionMatrix();
      state.renderer.setSize(w2, h2);
    });
    animate();
  }

  function makeCircleSprite() {
    const sz = 64, cv = document.createElement('canvas');
    cv.width = cv.height = sz;
    const cx = cv.getContext('2d'), h = sz/2;
    const g = cx.createRadialGradient(h,h,0,h,h,h);
    g.addColorStop(0,   'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.8)');
    g.addColorStop(1,   'rgba(255,255,255,0)');
    cx.fillStyle = g; cx.fillRect(0,0,sz,sz);
    return new THREE.CanvasTexture(cv);
  }

  function buildParticles() {
    if (state.particles) { state.scene.remove(state.particles); state.geometry.dispose(); state.material.dispose(); }
    const n = state.particleCount;
    state.geometry = new THREE.BufferGeometry();
    const positions = genPositions(n, SHAPES[state.currentShape].fn);
    state.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const colors = new Float32Array(n*3);
    const c = new THREE.Color(state.color);
    for (let i = 0; i < n; i++) {
      if (state.rainbowMode) { const rc = new THREE.Color().setHSL(i/n,1,0.6); colors[i*3]=rc.r; colors[i*3+1]=rc.g; colors[i*3+2]=rc.b; }
      else { colors[i*3]=c.r; colors[i*3+1]=c.g; colors[i*3+2]=c.b; }
    }
    state.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    state.material = new THREE.PointsMaterial({ size: state.particleSize*0.022, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, map: makeCircleSprite(), alphaTest: 0.01, sizeAttenuation: true });
    state.particles = new THREE.Points(state.geometry, state.material);
    state.scene.add(state.particles);
    state.explodeVelocities = null;
  }

  function morphTo(shapeName) {
    if (state.morphing || !SHAPES[shapeName]) return;
    state.currentShape = shapeName;
    document.querySelectorAll('.shape-btn').forEach(b => b.classList.toggle('active', b.dataset.shape === shapeName));
    if (!state.morphEnabled) { buildParticles(); return; }
    state.targetPositions = genPositions(state.particleCount, SHAPES[shapeName].fn);
    state.morphing = true; state.morphProgress = 0;
  }

  function triggerExplode() {
    if (state.exploding) return;
    const n = state.particleCount;
    state.explodeVelocities = new Float32Array(n*3);
    for (let i = 0; i < n; i++) { state.explodeVelocities[i*3]=(Math.random()-0.5)*0.35; state.explodeVelocities[i*3+1]=(Math.random()-0.5)*0.35; state.explodeVelocities[i*3+2]=(Math.random()-0.5)*0.35; }
    state.exploding = true; state.explodeTime = 0;
    updateTelemetry('Clap', state.scaleVal, '💥 BOOM! Reforming...');
  }

  function animate() {
    requestAnimationFrame(animate);
    const pos = state.geometry.attributes.position.array;
    const n   = state.particleCount;

    if (state.morphing && state.targetPositions) {
      state.morphProgress += 0.025;
      const tt = Math.min(state.morphProgress,1), ease = tt<0.5?2*tt*tt:-1+(4-2*tt)*tt;
      for (let i = 0; i < n*3; i++) pos[i] += (state.targetPositions[i]-pos[i])*ease*0.1;
      if (state.morphProgress >= 1) state.morphing = false;
      state.geometry.attributes.position.needsUpdate = true;
    }

    if (state.exploding) {
      state.explodeTime += 0.016;
      const vel = state.explodeVelocities, fade = Math.max(0,1-state.explodeTime/1.5);
      for (let i = 0; i < n; i++) { pos[i*3]+=vel[i*3]*fade; pos[i*3+1]+=vel[i*3+1]*fade; pos[i*3+2]+=vel[i*3+2]*fade; }
      if (state.explodeTime > 1.5) { state.exploding = false; buildParticles(); morphTo(state.currentShape); }
      state.geometry.attributes.position.needsUpdate = true;
    }

    if (state.audioEnabled && state.analyser) {
      state.analyser.getByteFrequencyData(state.audioData);
      const avg = state.audioData.reduce((a,b)=>a+b,0)/state.audioData.length;
      state.particles.scale.setScalar(state.scaleVal * (1+(avg/255)*0.4));
    } else {
      state.particles.scale.setScalar(state.scaleVal);
    }

    state.particles.rotation.y += state.rotVelX;
    state.particles.rotation.x += state.rotVelY;
    state.rotVelX *= 0.92; state.rotVelY *= 0.92;

    if (state.mirrorMode) { state.particles.scale.x = -Math.abs(state.particles.scale.x); }
    else { state.particles.scale.x = Math.abs(state.particles.scale.x); }

    if (state.rainbowMode) {
      state.rainbowFrame = (state.rainbowFrame+1)%2;
      if (state.rainbowFrame === 0) {
        const colors = state.geometry.attributes.color.array;
        const t = Date.now()*0.00015;
        for (let i = 0; i < n; i++) { const rc = new THREE.Color().setHSL((i/n+t)%1,1,0.6); colors[i*3]=rc.r; colors[i*3+1]=rc.g; colors[i*3+2]=rc.b; }
        state.geometry.attributes.color.needsUpdate = true;
      }
    }

    state.renderer.render(state.scene, state.camera);
  }

  function updateTelemetry(gesture, scale, msg) {
    document.getElementById('telemetry-p1').className = 'telemetry' + (gesture==='none'?' danger':'');
    document.getElementById('tele-gesture').textContent = gesture || '—';
    document.getElementById('tele-scale').textContent   = (scale||1).toFixed(2)+'×';
    document.getElementById('tele-msg').textContent     = msg || '';
  }

  /* ─── HAND CALLBACK ─────────────────── */
  function onHandResults(results) {
    const lm0 = GestureUtils.getLandmarks(results, 0);
    const lm1 = GestureUtils.getLandmarks(results, 1);

    if (!lm0) {
      state.handPresent = false; state.lastHandX = null; state.lastHandY = null; state.prevGesture = 'none';
      updateTelemetry('none', state.scaleVal, 'Show your hand to begin');
      return;
    }

    state.handPresent = true;
    const gesture = GestureUtils.detectGesture(results);
    NP.handData.gesture = gesture;
    if (state.clapCooldown  > 0) state.clapCooldown--;
    if (state.pinchCooldown > 0) state.pinchCooldown--;

    const handSize = GestureUtils.getHandSize(lm0);

    if (gesture === 'fist') {
      state.scaleVal   = Math.min(Math.max(handSize*8, 0.3), 3.5);
      state.scaleLocked = false;
      state.lastHandX  = null; state.lastHandY = null;
      updateTelemetry('Fist ✊', state.scaleVal, 'Scale: move hand closer/further');

    } else if (state.prevGesture === 'fist' && gesture !== 'fist') {
      state.scaleLocked = true;
      updateTelemetry(gesture, state.scaleVal, `Scale locked at ${state.scaleVal.toFixed(2)}×`);

    } else if (gesture === 'open') {
      if (state.lastHandX !== null) {
        // FIX: with selfieMode=true, x increases left→right on screen (mirrored)
        // Moving hand right on screen → lm[9].x increases → we want to rotate right
        // So sign is already correct: dx positive = rotate right = +rotVelX
        const dx = lm0[9].x - state.lastHandX;
        const dy = lm0[9].y - state.lastHandY;
        state.rotVelX += dx * 4;
        state.rotVelY += dy * 4;
      }
      state.lastHandX = lm0[9].x; state.lastHandY = lm0[9].y;
      updateTelemetry('Open ✋', state.scaleVal, 'Rotating...');

    } else if (gesture === 'clap') {
      state.lastHandX = null;
      if (state.clapCooldown <= 0) { triggerExplode(); state.clapCooldown = 60; }

    } else if (gesture === 'pinch' && state.morphEnabled) {
      if (state.pinchCooldown <= 0) {
        const keys = Object.keys(SHAPES);
        morphTo(keys[(keys.indexOf(state.currentShape)+1) % keys.length]);
        state.pinchCooldown = 60;
        updateTelemetry('Pinch 🤏', state.scaleVal, `→ ${SHAPES[state.currentShape].label}`);
      }
    } else {
      state.lastHandX = null; state.lastHandY = null;
      if (gesture !== 'fist') updateTelemetry(gesture, state.scaleVal, '');
    }
    state.prevGesture = gesture;
  }

  /* ─── CONTROLS ──────────────────────── */
  function buildShapeGrid() {
    const grid = document.getElementById('shape-grid'); grid.innerHTML = '';
    Object.entries(SHAPES).forEach(([key, s]) => {
      const btn = document.createElement('button');
      btn.className = 'shape-btn'+(key===state.currentShape?' active':'');
      btn.dataset.shape = key; btn.textContent = s.label;
      btn.addEventListener('click', () => morphTo(key));
      grid.appendChild(btn);
    });
  }

  function wireControls() {
    document.getElementById('btn-rainbow').addEventListener('click', () => {
      state.rainbowMode = !state.rainbowMode;
      document.getElementById('toggle-rainbow').classList.toggle('active', state.rainbowMode);
      if (!state.rainbowMode) { const c=new THREE.Color(state.color),colors=state.geometry.attributes.color.array; for(let i=0;i<state.particleCount;i++){colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;} state.geometry.attributes.color.needsUpdate=true; }
    });
    document.getElementById('btn-morph').addEventListener('click', () => { state.morphEnabled=!state.morphEnabled; document.getElementById('toggle-morph').classList.toggle('active',state.morphEnabled); });
    document.getElementById('btn-mirror').addEventListener('click', () => { state.mirrorMode=!state.mirrorMode; document.getElementById('toggle-mirror').classList.toggle('active',state.mirrorMode); });
    document.getElementById('btn-audio').addEventListener('click', async () => {
      state.audioEnabled = !state.audioEnabled;
      document.getElementById('toggle-audio').classList.toggle('active', state.audioEnabled);
      if (state.audioEnabled && !state.analyser) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const ctx = new (window.AudioContext||window.webkitAudioContext)();
          const src = ctx.createMediaStreamSource(stream);
          state.analyser = ctx.createAnalyser(); state.analyser.fftSize = 256;
          state.audioData = new Uint8Array(state.analyser.frequencyBinCount);
          src.connect(state.analyser);
        } catch(e) { state.audioEnabled=false; document.getElementById('toggle-audio').classList.remove('active'); alert('Mic denied.'); }
      }
    });
    document.getElementById('particle-color').addEventListener('input', e => {
      state.color = e.target.value;
      if (!state.rainbowMode) { const c=new THREE.Color(state.color),colors=state.geometry.attributes.color.array; for(let i=0;i<state.particleCount;i++){colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;} state.geometry.attributes.color.needsUpdate=true; }
    });
    document.getElementById('particle-size').addEventListener('input', e => { state.particleSize=+e.target.value; if(state.material) state.material.size=state.particleSize*0.022; });
    document.getElementById('particle-count').addEventListener('input', e => { state.particleCount=+e.target.value; buildParticles(); });
    document.getElementById('btn-export-p1').addEventListener('click', () => { alert('Export: would use THREE.STLExporter in a full build.'); });
  }

  function init() { buildShapeGrid(); wireControls(); initThree(); }
  function startTracking() { /* handled by app.js shared pipeline */ }
  function onActivate() {
    NP._callback = onHandResults;
    if (state.renderer) { const canvas=document.getElementById('canvas-p1'); const w=canvas.offsetWidth||window.innerWidth,h=canvas.offsetHeight||(window.innerHeight-56); state.camera.aspect=w/h; state.camera.updateProjectionMatrix(); state.renderer.setSize(w,h); }
  }

  return { init, startTracking, onActivate, onHandResults };
})();

document.addEventListener('DOMContentLoaded', () => P1.init());
