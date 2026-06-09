/* -------------------------------------------------------------
 * Quantum Flow - Simulation Engine
 * Optimized Particle Physics, Web Audio Synth, and UI Handlers
 * ------------------------------------------------------------- */

// State configurations
const state = {
  activePreset: 'galaxy',
  interactionMode: 'attract',
  particleCount: 1000,
  maxSpeed: 6.0,
  particleSize: 2.5,
  gravity: 0.00,
  damping: 0.985,
  trailIntensity: 0.12,
  theme: 'nebula',
  audioEnabled: false,
  
  // Color presets (RGB triples for blending and transparency control)
  themes: {
    nebula: {
      primary: [34, 211, 238],     // Cyan
      secondary: [168, 85, 247],   // Purple
    },
    solar: {
      primary: [249, 115, 22],     // Orange
      secondary: [239, 68, 68],    // Red
    },
    aurora: {
      primary: [34, 197, 94],      // Green
      secondary: [20, 184, 166],   // Teal
    },
    rainbow: {
      primary: [0, 0, 0],          // Dynamic
      secondary: [0, 0, 0],
    },
    monochrome: {
      primary: [241, 245, 249],    // Slate-100
      secondary: [100, 116, 139],  // Slate-500
    }
  }
};

// Canvas Setup
const canvas = document.getElementById('flow-canvas');
const ctx = canvas.getContext('2d', { alpha: false }); // Optimize canvas for opaque background rendering
let width = canvas.width = window.innerWidth;
let height = canvas.height = window.innerHeight;

// Physics Array & Mouse tracking
let particles = [];
const mouse = {
  x: width / 2,
  y: height / 2,
  vx: 0,
  vy: 0,
  lastX: width / 2,
  lastY: height / 2,
  isDown: false,
  isInside: false
};

// Real-time metrics
let lastTime = performance.now();
let frameCount = 0;
let fps = 60;
const fpsVal = document.getElementById('fps-val');
const particleCountVal = document.getElementById('particle-count-val');

/* -------------------------------------------------------------
 * Ambient Web Audio Synthesis
 * ------------------------------------------------------------- */
class AmbientSynth {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.lowpass = null;
    this.oscillators = [];
    this.synthGains = [];
    this.initialized = false;
    // Harmonious pentatonic scale frequencies (Eb minor pentatonic: Eb, Gb, Ab, Bb, Db)
    this.scale = [155.56, 185.00, 207.65, 233.08, 277.18, 311.13, 369.99, 415.30, 466.16, 554.37];
  }

  init() {
    if (this.initialized) return;
    
    // Create AudioContext (fallback for browser compatibility)
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    // Master Low Pass Filter to keep sounds warm and remove harsh high frequencies
    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.setValueAtTime(650, this.ctx.currentTime);
    this.lowpass.Q.setValueAtTime(1.5, this.ctx.currentTime);
    
    // Master Gain for volume control
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // Start silent
    
    // Connections: Osc -> SynthGain -> Lowpass -> MasterGain -> Destination
    this.lowpass.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    
    // Setup 3 drone oscillators for ambient harmony
    const waveTypes = ['sine', 'triangle', 'sine'];
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = waveTypes[i];
      // Select base notes Eb2, Eb3, Bb3
      const baseFreq = i === 0 ? 77.78 : (i === 1 ? 155.56 : 233.08);
      osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
      
      gain.gain.setValueAtTime(0.0, this.ctx.currentTime);
      
      osc.connect(gain);
      gain.connect(this.lowpass);
      osc.start();
      
      this.oscillators.push(osc);
      this.synthGains.push(gain);
    }
    
    this.initialized = true;
  }

  update(mouseSpeed, mouseRelativeX, mouseRelativeY) {
    if (!this.initialized || this.ctx.state === 'suspended') return;
    
    const now = this.ctx.currentTime;
    
    if (state.audioEnabled) {
      // Fade in master if muted
      if (this.masterGain.gain.value < 0.15) {
        this.masterGain.gain.linearRampToValueAtTime(0.25, now + 1.5);
      }
      
      // Modulate oscillator volumes and pitches based on mouse positions
      // Osc 0 (Bass): Responds to mouse click/movement
      const bassVolume = 0.08 + (mouseSpeed * 0.02);
      this.synthGains[0].gain.setTargetAtTime(Math.min(bassVolume, 0.15), now, 0.3);
      
      // Osc 1 (Mid): Responds to horizontal mouse position
      const midFreqIndex = Math.floor(mouseRelativeX * (this.scale.length / 2));
      const midFreq = this.scale[midFreqIndex];
      this.oscillators[1].frequency.setTargetAtTime(midFreq, now, 0.4);
      this.synthGains[1].gain.setTargetAtTime(0.06, now, 0.5);
      
      // Osc 2 (High): Responds to vertical mouse position and movement speed
      const highFreqIndex = Math.floor((1 - mouseRelativeY) * (this.scale.length / 2) + (this.scale.length / 2));
      const highFreq = this.scale[Math.min(highFreqIndex, this.scale.length - 1)];
      this.oscillators[2].frequency.setTargetAtTime(highFreq, now, 0.3);
      
      const trebleVolume = 0.01 + (mouseSpeed * 0.015);
      this.synthGains[2].gain.setTargetAtTime(Math.min(trebleVolume, 0.07), now, 0.2);
      
      // Dynamically open filter based on speed
      const filterCutoff = 400 + (mouseSpeed * 100);
      this.lowpass.frequency.setTargetAtTime(Math.min(filterCutoff, 1200), now, 0.2);
    } else {
      // Fade out master
      if (this.masterGain.gain.value > 0) {
        this.masterGain.gain.linearRampToValueAtTime(0.0, now + 0.3);
      }
    }
  }

  triggerImpact() {
    if (!this.initialized || !state.audioEnabled || this.ctx.state === 'suspended') return;
    
    // Quick chime burst (synthesize a soft pluck)
    const now = this.ctx.currentTime;
    const chime = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    chime.type = 'triangle';
    // Choose a high random note from scale
    const note = this.scale[Math.floor(Math.random() * 4) + 6];
    chime.frequency.setValueAtTime(note, now);
    
    gain.gain.setValueAtTime(0.0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    
    chime.connect(gain);
    gain.connect(this.lowpass);
    
    chime.start();
    chime.stop(now + 0.85);
  }

  suspend() {
    if (this.ctx) this.ctx.suspend();
  }

  resume() {
    if (this.ctx) this.ctx.resume();
  }
}

const synth = new AmbientSynth();

/* -------------------------------------------------------------
 * Particle Simulation Engine
 * ------------------------------------------------------------- */
class Particle {
  constructor(x, y, isTemporary = false, vx = 0, vy = 0) {
    this.x = x;
    this.y = y;
    
    // Set random velocities if not specified
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 2 + 0.5;
    this.vx = vx || Math.cos(angle) * speed;
    this.vy = vy || Math.sin(angle) * speed;
    
    this.baseSize = state.particleSize;
    this.size = this.baseSize * (Math.random() * 0.6 + 0.7);
    this.isTemporary = isTemporary;
    
    this.maxLife = Math.random() * 100 + 40;
    this.life = this.maxLife;
    this.alpha = 1.0;
    this.hueOffset = Math.random() * 40 - 20; // For color blending
  }

  update() {
    // Apply gravity
    this.vy += state.gravity;
    
    // Apply damping / drag
    this.vx *= state.damping;
    this.vy *= state.damping;
    
    // Move position
    this.x += this.vx;
    this.y += this.vy;
    
    // Speed limit
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > state.maxSpeed) {
      this.vx = (this.vx / speed) * state.maxSpeed;
      this.vy = (this.vy / speed) * state.maxSpeed;
    }
    
    if (this.isTemporary) {
      this.life--;
      this.alpha = Math.max(0, this.life / this.maxLife);
    } else {
      // Screen edge boundary logic for persistent particles
      if (state.activePreset === 'snow') {
        // Snow drifts wrap around edges
        if (this.x < 0) this.x = width;
        if (this.x > width) this.x = 0;
        if (this.y > height) {
          this.y = 0;
          this.x = Math.random() * width;
          this.vy = Math.random() * 1.5 + 0.5;
        }
      } else {
        // bounce with energy loss
        if (this.x - this.size < 0) {
          this.x = this.size;
          this.vx *= -0.7;
        } else if (this.x + this.size > width) {
          this.x = width - this.size;
          this.vx *= -0.7;
        }
        
        if (this.y - this.size < 0) {
          this.y = this.size;
          this.vy *= -0.7;
        } else if (this.y + this.size > height) {
          this.y = height - this.size;
          this.vy *= -0.7;
        }
      }
    }
  }

  draw(themeColors, time) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    
    let colorString;
    
    if (state.theme === 'rainbow') {
      const hue = (time * 0.05 + this.x * 0.1 + this.hueOffset) % 360;
      colorString = `hsla(${hue}, 90%, 60%, ${this.alpha})`;
    } else {
      // Interpolate between primary and secondary colors based on velocity/position
      const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      const ratio = Math.min(speed / state.maxSpeed, 1.0);
      
      const r = Math.round(themeColors.primary[0] * (1 - ratio) + themeColors.secondary[0] * ratio);
      const g = Math.round(themeColors.primary[1] * (1 - ratio) + themeColors.secondary[1] * ratio);
      const b = Math.round(themeColors.primary[2] * (1 - ratio) + themeColors.secondary[2] * ratio);
      
      colorString = `rgba(${r}, ${g}, ${b}, ${this.alpha})`;
    }
    
    ctx.fillStyle = colorString;
    ctx.fill();
  }
}

// Populate persistent particles
function initParticles() {
  particles = [];
  const count = state.particleCount;
  
  if (state.activePreset === 'galaxy') {
    // Generate a spinning spiral disk of particles
    const centerX = width / 2;
    const centerY = height / 2;
    for (let i = 0; i < count; i++) {
      const distance = Math.random() * Math.min(width, height) * 0.45 + 10;
      const angle = Math.random() * Math.PI * 2;
      
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;
      
      // Speed tangential to center to initiate rotation
      const speed = Math.sqrt(distance) * 0.25;
      const vx = -Math.sin(angle) * speed;
      const vy = Math.cos(angle) * speed;
      
      particles.push(new Particle(x, y, false, vx, vy));
    }
  } else {
    // Distribute uniformly
    for (let i = 0; i < count; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      particles.push(new Particle(x, y, false));
    }
  }
}

// Spawns bursting explosion of particles
function explodeParticles(x, y, count = 120) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const force = Math.random() * 8 + 3;
    const vx = Math.cos(angle) * force;
    const vy = Math.sin(angle) * force;
    particles.push(new Particle(x, y, true, vx, vy));
  }
  synth.triggerImpact();
}

/* -------------------------------------------------------------
 * Main Animation Render Loop
 * ------------------------------------------------------------- */
function animate(time) {
  // Compute frame rates
  frameCount++;
  const elapsed = time - lastTime;
  if (elapsed >= 1000) {
    fps = Math.round((frameCount * 1000) / elapsed);
    fpsVal.textContent = fps;
    frameCount = 0;
    lastTime = time;
  }
  
  // Create beautiful trails by drawing translucent fill rect over canvas
  ctx.fillStyle = `rgba(7, 7, 12, ${state.trailIntensity})`;
  ctx.fillRect(0, 0, width, height);
  
  // Calculate mouse speed
  mouse.vx = mouse.x - mouse.lastX;
  mouse.vy = mouse.y - mouse.lastY;
  const mouseSpeed = Math.sqrt(mouse.vx * mouse.vx + mouse.vy * mouse.vy);
  mouse.lastX = mouse.x;
  mouse.lastY = mouse.y;
  
  // Update Audio Synth parameters based on mouse coordinates & movement
  if (state.audioEnabled) {
    synth.update(mouseSpeed, mouse.x / width, mouse.y / height);
  }
  
  // Handle continuous emitters if in spawn mode
  if (mouse.isInside && state.interactionMode === 'spawn' && (mouse.isDown || Math.random() < 0.25)) {
    const spawnRate = mouse.isDown ? 6 : 2;
    for (let i = 0; i < spawnRate; i++) {
      const offsetAngle = Math.random() * Math.PI * 2;
      const offsetDist = Math.random() * 15;
      const pX = mouse.x + Math.cos(offsetAngle) * offsetDist;
      const pY = mouse.y + Math.sin(offsetAngle) * offsetDist;
      
      // Drift velocity
      const driftAngle = Math.random() * Math.PI * 2;
      const driftSpeed = Math.random() * 2 + 1;
      particles.push(new Particle(pX, pY, true, Math.cos(driftAngle) * driftSpeed, Math.sin(driftAngle) * driftSpeed));
    }
  }
  
  // Retrieve current active color theme object
  const themeColors = state.themes[state.theme];
  
  // Update and render particles
  let activePersistentCount = 0;
  
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    
    // Physics interaction with active pointer
    if (mouse.isInside && state.interactionMode !== 'spawn') {
      const dx = mouse.x - p.x;
      const dy = mouse.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const limit = 350;
      
      if (dist < limit && dist > 2) {
        // Distance attenuation force
        const force = (limit - dist) / limit;
        
        if (state.interactionMode === 'attract') {
          // Attract towards center
          const pull = force * 0.45;
          p.vx += (dx / dist) * pull;
          p.vy += (dy / dist) * pull;
        } else if (state.interactionMode === 'repel') {
          // Repel away from center
          const push = force * 0.95;
          p.vx -= (dx / dist) * push;
          p.vy -= (dy / dist) * push;
        } else if (state.interactionMode === 'vortex') {
          // Tangential vortex rotation force (90-degree orthogonal vector)
          const orbitForce = force * 0.85;
          const tx = -dy / dist;
          const ty = dx / dist;
          p.vx += tx * orbitForce;
          p.vy += ty * orbitForce;
          
          // Subtle drag towards center so they orbit instead of flying off
          p.vx += (dx / dist) * (force * 0.15);
          p.vy += (dy / dist) * (force * 0.15);
        }
      }
    }
    
    // Update physics positions & decay lifespans
    p.update();
    
    // Remove dead temporary particles
    if (p.isTemporary && p.life <= 0) {
      particles.splice(i, 1);
    } else {
      p.draw(themeColors, time);
      if (!p.isTemporary) {
        activePersistentCount++;
      }
    }
  }
  
  // Top up missing persistent particles if count changed
  if (activePersistentCount < state.particleCount) {
    const difference = state.particleCount - activePersistentCount;
    for (let i = 0; i < difference; i++) {
      particles.push(new Particle(Math.random() * width, Math.random() * height, false));
    }
  } else if (activePersistentCount > state.particleCount) {
    // Prune excessive persistent particles
    let removed = 0;
    const targetRemove = activePersistentCount - state.particleCount;
    for (let i = particles.length - 1; i >= 0; i--) {
      if (!particles[i].isTemporary) {
        particles.splice(i, 1);
        removed++;
        if (removed >= targetRemove) break;
      }
    }
  }
  
  // Update UI Stats value
  particleCountVal.textContent = particles.length;
  
  requestAnimationFrame(animate);
}

/* -------------------------------------------------------------
 * Preset Configuration Management
 * ------------------------------------------------------------- */
const presets = {
  galaxy: {
    interactionMode: 'attract',
    particleCount: 1500,
    maxSpeed: 5.5,
    particleSize: 2.0,
    gravity: 0.00,
    damping: 0.99,
    trailIntensity: 0.08,
    theme: 'nebula'
  },
  fireworks: {
    interactionMode: 'spawn',
    particleCount: 200, // Small baseline, users trigger click explosions
    maxSpeed: 12.0,
    particleSize: 3.5,
    gravity: 0.18,
    damping: 0.965,
    trailIntensity: 0.18,
    theme: 'solar'
  },
  snow: {
    interactionMode: 'repel',
    particleCount: 1000,
    maxSpeed: 2.2,
    particleSize: 3.0,
    gravity: 0.04,
    damping: 0.995,
    trailIntensity: 0.28,
    theme: 'monochrome'
  },
  chaos: {
    interactionMode: 'vortex',
    particleCount: 2200,
    maxSpeed: 9.0,
    particleSize: 1.5,
    gravity: -0.02, // Floating drift upward
    damping: 0.992,
    trailIntensity: 0.05,
    theme: 'aurora'
  }
};

function applyPreset(presetKey) {
  const config = presets[presetKey];
  if (!config) return;
  
  state.activePreset = presetKey;
  
  // Load configuration parameters into active state
  Object.keys(config).forEach(key => {
    state[key] = config[key];
  });
  
  // Sync state to DOM controls
  syncStateToUI();
  
  // Re-generate background fields
  initParticles();
}

/* -------------------------------------------------------------
 * UI DOM Event Binding & Syncing
 * ------------------------------------------------------------- */
function syncStateToUI() {
  // Sync Sliders
  setSliderValue('particles-slider', state.particleCount);
  setSliderValue('speed-slider', state.maxSpeed);
  setSliderValue('size-slider', state.particleSize);
  setSliderValue('gravity-slider', state.gravity);
  setSliderValue('friction-slider', state.damping);
  setSliderValue('trail-slider', state.trailIntensity);
  
  // Sync Radios
  const radios = document.querySelectorAll('input[name="interaction-mode"]');
  radios.forEach(radio => {
    radio.checked = radio.value === state.interactionMode;
  });
  
  // Sync Preset button states
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.preset === state.activePreset);
  });
  
  // Sync Color buttons
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === state.theme);
  });
  
  // Sync audio toggle
  document.getElementById('audio-toggle').checked = state.audioEnabled;
  
  // Apply visual theme color references to CSS variables
  applyThemeColorsCSS();
}

function setSliderValue(id, value) {
  const slider = document.getElementById(id);
  slider.value = value;
  
  // Format values for human-readable labels
  let displayVal = value;
  if (id === 'speed-slider' || id === 'size-slider') displayVal = Number(value).toFixed(1);
  if (id === 'gravity-slider') displayVal = Number(value).toFixed(2);
  if (id === 'friction-slider') displayVal = Number(value).toFixed(3);
  if (id === 'trail-slider') displayVal = Number(value).toFixed(2);
  
  document.getElementById(`${id}-val`).textContent = displayVal;
}

function applyThemeColorsCSS() {
  const primaryColors = {
    nebula: 'var(--color-nebula-primary)',
    solar: 'var(--color-solar-primary)',
    aurora: 'var(--color-aurora-primary)',
    rainbow: '0, 170, 255', // fallback swatch
    monochrome: 'var(--color-mono-primary)'
  };
  
  const secondaryColors = {
    nebula: 'var(--color-nebula-secondary)',
    solar: 'var(--color-solar-secondary)',
    aurora: 'var(--color-aurora-secondary)',
    rainbow: '255, 0, 85', // fallback swatch
    monochrome: 'var(--color-mono-secondary)'
  };
  
  const root = document.documentElement;
  root.style.setProperty('--theme-primary', primaryColors[state.theme]);
  root.style.setProperty('--theme-secondary', secondaryColors[state.theme]);
}

// Bind DOM event listeners
function bindEvents() {
  // Preset Button clicks
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      applyPreset(e.target.dataset.preset);
    });
  });
  
  // Radio clicks (interaction modes)
  document.querySelectorAll('input[name="interaction-mode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.interactionMode = e.target.value;
      state.activePreset = ''; // break preset link when customized
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    });
  });
  
  // Slider listeners
  bindSlider('particles-slider', 'particleCount', val => Math.round(Number(val)));
  bindSlider('speed-slider', 'maxSpeed', val => Number(val));
  bindSlider('size-slider', 'particleSize', val => {
    const num = Number(val);
    particles.forEach(p => p.size = num * (Math.random() * 0.6 + 0.7)); // sync sizes immediately
    return num;
  });
  bindSlider('gravity-slider', 'gravity', val => Number(val));
  bindSlider('friction-slider', 'damping', val => Number(val));
  bindSlider('trail-slider', 'trailIntensity', val => Number(val));
  
  function bindSlider(id, stateKey, parser) {
    const slider = document.getElementById(id);
    slider.addEventListener('input', (e) => {
      const val = parser(e.target.value);
      state[stateKey] = val;
      setSliderValue(id, val);
      state.activePreset = ''; // Break preset link
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    });
  }
  
  // Color Palette Theme Button clicks
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetBtn = e.target.closest('.color-btn');
      state.theme = targetBtn.dataset.color;
      document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      targetBtn.classList.add('active');
      applyThemeColorsCSS();
      
      state.activePreset = ''; // Break preset link
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    });
  });
  
  // Audio toggle
  const audioToggle = document.getElementById('audio-toggle');
  audioToggle.addEventListener('change', (e) => {
    state.audioEnabled = e.target.checked;
    if (state.audioEnabled) {
      synth.init();
      synth.resume();
    } else {
      synth.suspend();
    }
  });
  
  // Action buttons
  document.getElementById('clear-btn').addEventListener('click', () => {
    explodeParticles(mouse.x, mouse.y, 250);
  });
  
  document.getElementById('reset-btn').addEventListener('click', () => {
    applyPreset('galaxy');
  });
  
  // Collapsing Control Panel Drawer
  const panel = document.getElementById('control-panel');
  const collapseBtn = document.getElementById('toggle-panel-btn');
  const expandBtn = document.getElementById('expand-panel-btn');
  
  collapseBtn.addEventListener('click', () => {
    panel.classList.add('collapsed');
    expandBtn.classList.remove('hidden');
  });
  
  expandBtn.addEventListener('click', () => {
    panel.classList.remove('collapsed');
    expandBtn.classList.add('hidden');
  });
  
  // Mouse & Touch Tracking Canvas Events
  canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.isInside = true;
    
    // In spawn mode, moving the mouse produces sound chiming
    if (state.interactionMode === 'spawn' && Math.random() < 0.12) {
      synth.triggerImpact();
    }
  });
  
  canvas.addEventListener('mouseenter', () => {
    mouse.isInside = true;
    synth.resume();
  });
  
  canvas.addEventListener('mouseleave', () => {
    mouse.isInside = false;
  });
  
  canvas.addEventListener('mousedown', (e) => {
    mouse.isDown = true;
    
    // Resume context if browser blocked it
    if (state.audioEnabled) {
      synth.init();
      synth.resume();
    }
    
    // Right or left clicks make particle explosions
    explodeParticles(e.clientX, e.clientY, 150);
  });
  
  canvas.addEventListener('mouseup', () => {
    mouse.isDown = false;
  });
  
  // Touch support for mobile devices
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
      mouse.isInside = true;
    }
  }, { passive: true });
  
  canvas.addEventListener('touchstart', (e) => {
    mouse.isInside = true;
    mouse.isDown = true;
    if (e.touches.length > 0) {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
    }
    if (state.audioEnabled) {
      synth.init();
      synth.resume();
    }
    explodeParticles(mouse.x, mouse.y, 80);
  }, { passive: true });
  
  canvas.addEventListener('touchend', () => {
    mouse.isDown = false;
    mouse.isInside = false;
  });
  
  // Handle viewport resize
  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    initParticles(); // Re-scatter persistent particles to fit new window bounds
  });
}

/* -------------------------------------------------------------
 * Start Simulation
 * ------------------------------------------------------------- */
bindEvents();
applyPreset('galaxy'); // Start in standard Galaxy mode
requestAnimationFrame(animate);
