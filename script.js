/**
 * Robot Rush — Original 2D side-scrolling platformer
 * HTML5 Canvas · requestAnimationFrame · delta-time physics
 *
 * Modules: AudioManager, InputManager, Particle, Robot, Obstacle,
 * ObstacleManager, Coin, PowerUp, Background, UIManager, Game
 */

(() => {
  "use strict";

  // ============================================================
  // Constants
  // ============================================================
  const LOGICAL_W = 960;
  const LOGICAL_H = 540;
  const GROUND_Y = 440;
  const GRAVITY = 2200;
  const JUMP_VELOCITY = -720;
  const DOUBLE_JUMP_VELOCITY = -640;
  const BASE_SPEED = 220;
  const MAX_SPEED = 580;
  const ROBOT_X = 140;
  const STORAGE_KEY = "robotRushHighScore";
  const COIN_VALUE = 25;
  const COMBO_BONUS = 10;

  const ENVIRONMENTS = [
    { id: "desert", name: "Desert Road", unlockAt: 0 },
    { id: "city", name: "Futuristic City", unlockAt: 1500 },
    { id: "factory", name: "Dangerous Factory", unlockAt: 4000 },
  ];

  // ============================================================
  // Utility helpers
  // ============================================================
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const chance = (p) => Math.random() < p;

  function aabb(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }

  // ============================================================
  // AudioManager — Web Audio API synth (works without files)
  // ============================================================
  class AudioManager {
    constructor() {
      this.enabled = true;
      this.ctx = null;
      this.musicNodes = null;
      this.musicPlaying = false;
      this._loadPref();
    }

    _loadPref() {
      try {
        const v = localStorage.getItem("robotRushSound");
        if (v !== null) this.enabled = v === "1";
      } catch (_) { /* ignore */ }
    }

    _savePref() {
      try {
        localStorage.setItem("robotRushSound", this.enabled ? "1" : "0");
      } catch (_) { /* ignore */ }
    }

    ensureCtx() {
      if (!this.ctx) {
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          this.ctx = new AC();
        } catch (_) {
          this.ctx = null;
        }
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    toggle() {
      this.enabled = !this.enabled;
      this._savePref();
      if (!this.enabled) this.stopMusic();
      else if (this.musicPlaying) this.startMusic();
      return this.enabled;
    }

    /** Play a short synthesised tone */
    _tone(freq, dur, type = "square", vol = 0.08, slideTo = null) {
      if (!this.enabled) return;
      const ctx = this.ensureCtx();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (slideTo != null) {
          osc.frequency.linearRampToValueAtTime(slideTo, ctx.currentTime + dur);
        }
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + dur + 0.02);
      } catch (_) { /* audio may fail silently */ }
    }

    /** Soft noise burst for collisions / dust */
    _noise(dur = 0.15, vol = 0.06) {
      if (!this.enabled) return;
      const ctx = this.ensureCtx();
      if (!ctx) return;
      try {
        const len = Math.floor(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 800;
        src.buffer = buf;
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        src.start();
      } catch (_) { /* ignore */ }
    }

    playJump() {
      this._tone(420, 0.1, "square", 0.07, 680);
    }

    playDoubleJump() {
      this._tone(520, 0.08, "square", 0.07, 900);
      setTimeout(() => this._tone(700, 0.08, "triangle", 0.05, 1100), 40);
    }

    playCoin() {
      this._tone(880, 0.07, "sine", 0.06, 1400);
    }

    playPowerUp() {
      this._tone(300, 0.12, "sawtooth", 0.05, 600);
      setTimeout(() => this._tone(600, 0.15, "sine", 0.06, 1200), 80);
    }

    playCollision() {
      this._noise(0.3, 0.12);
      this._tone(120, 0.25, "sawtooth", 0.1, 40);
    }

    playMilestone() {
      this._tone(523, 0.1, "sine", 0.07);
      setTimeout(() => this._tone(659, 0.1, "sine", 0.07), 100);
      setTimeout(() => this._tone(784, 0.18, "sine", 0.08), 200);
    }

    playClick() {
      this._tone(600, 0.04, "square", 0.04);
    }

    startMusic() {
      this.musicPlaying = true;
      if (!this.enabled) return;
      const ctx = this.ensureCtx();
      if (!ctx || this.musicNodes) return;
      try {
        // Simple looping arpeggio pad
        const master = ctx.createGain();
        master.gain.value = 0.035;
        master.connect(ctx.destination);

        const notes = [262, 330, 392, 523, 392, 330];
        let step = 0;
        const playStep = () => {
          if (!this.musicNodes) return;
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.value = notes[step % notes.length];
          g.gain.setValueAtTime(0.001, ctx.currentTime);
          g.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.02);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
          osc.connect(g);
          g.connect(master);
          osc.start();
          osc.stop(ctx.currentTime + 0.3);
          step++;
        };

        const interval = setInterval(playStep, 320);
        playStep();
        this.musicNodes = { master, interval };
      } catch (_) {
        this.musicNodes = null;
      }
    }

    stopMusic() {
      if (this.musicNodes) {
        clearInterval(this.musicNodes.interval);
        try {
          this.musicNodes.master.disconnect();
        } catch (_) { /* ignore */ }
        this.musicNodes = null;
      }
    }
  }

  // ============================================================
  // InputManager
  // ============================================================
  class InputManager {
    constructor(canvas) {
      this.canvas = canvas;
      this.jumpPressed = false;
      this.jumpQueued = false;
      this.pausePressed = false;
      this.restartPressed = false;
      this._bind();
    }

    _bind() {
      const onJump = (e) => {
        if (e && e.cancelable) e.preventDefault();
        this.jumpPressed = true;
        this.jumpQueued = true;
      };

      window.addEventListener("keydown", (e) => {
        if (e.code === "Space" || e.code === "ArrowUp") {
          e.preventDefault();
          onJump(e);
        } else if (e.code === "KeyP") {
          this.pausePressed = true;
        } else if (e.code === "KeyR") {
          this.restartPressed = true;
        }
      });

      // Prevent page scroll on space/arrows while focused on game
      window.addEventListener(
        "keydown",
        (e) => {
          if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) {
            e.preventDefault();
          }
        },
        { passive: false }
      );

      this.canvas.addEventListener("mousedown", onJump);
      this.canvas.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          onJump(e);
        },
        { passive: false }
      );
    }

    consumeJump() {
      if (this.jumpQueued) {
        this.jumpQueued = false;
        return true;
      }
      return false;
    }

    consumePause() {
      if (this.pausePressed) {
        this.pausePressed = false;
        return true;
      }
      return false;
    }

    consumeRestart() {
      if (this.restartPressed) {
        this.restartPressed = false;
        return true;
      }
      return false;
    }
  }

  // ============================================================
  // Particle system
  // ============================================================
  class Particle {
    constructor(x, y, opts = {}) {
      this.x = x;
      this.y = y;
      this.vx = opts.vx ?? rand(-80, 80);
      this.vy = opts.vy ?? rand(-120, -20);
      this.life = opts.life ?? rand(0.3, 0.8);
      this.maxLife = this.life;
      this.size = opts.size ?? rand(2, 6);
      this.color = opts.color ?? "#fff";
      this.gravity = opts.gravity ?? 400;
      this.friction = opts.friction ?? 0.98;
      this.shape = opts.shape ?? "circle"; // circle | square | spark
      this.alive = true;
    }

    update(dt) {
      this.vy += this.gravity * dt;
      this.vx *= this.friction;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.life -= dt;
      if (this.life <= 0) this.alive = false;
    }

    draw(ctx) {
      const a = clamp(this.life / this.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = this.color;
      if (this.shape === "square") {
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
      } else if (this.shape === "spark") {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(Math.atan2(this.vy, this.vx));
        ctx.fillRect(-this.size, -1, this.size * 2, 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ============================================================
  // Robot character
  // ============================================================
  class Robot {
    constructor() {
      this.reset();
    }

    reset() {
      this.w = 42;
      this.h = 42;
      this.x = ROBOT_X;
      this.y = GROUND_Y - this.h;
      this.vy = 0;
      this.onGround = true;
      this.jumpsUsed = 0;
      this.maxJumps = 2;
      this.state = "run"; // run | jump | fall | crash | fly
      this.animTime = 0;
      this.legPhase = 0;
      this.crashTimer = 0;
      this.rotation = 0;
      this.shield = false;
      this.magnet = false;
      this.superJump = false;
      this.jetpack = false;
      this.invincible = 0;
      this.trail = [];
      this.dustTimer = 0;
      this.glowPulse = 0;
    }

    get hitbox() {
      // Tight collision box matching visible body
      return {
        x: this.x + 6,
        y: this.y + 4,
        w: this.w - 12,
        h: this.h - 6,
      };
    }

    jump(audio) {
      if (this.state === "crash") return false;
      if (this.jetpack) {
        this.vy = JUMP_VELOCITY * 0.7;
        this.state = "fly";
        if (audio) audio.playJump();
        return true;
      }
      if (this.jumpsUsed < this.maxJumps) {
        const isDouble = this.jumpsUsed > 0;
        const power = this.superJump ? 1.35 : 1;
        this.vy = (isDouble ? DOUBLE_JUMP_VELOCITY : JUMP_VELOCITY) * power;
        this.jumpsUsed++;
        this.onGround = false;
        this.state = isDouble ? "jump" : "jump";
        if (audio) {
          if (isDouble) audio.playDoubleJump();
          else audio.playJump();
        }
        return true;
      }
      return false;
    }

    crash() {
      this.state = "crash";
      this.crashTimer = 0;
      this.vy = -200;
      this.rotation = 0;
    }

    update(dt, speed, particles) {
      this.animTime += dt;
      this.glowPulse += dt * 4;

      if (this.invincible > 0) this.invincible -= dt;

      if (this.state === "crash") {
        this.crashTimer += dt;
        this.vy += GRAVITY * dt;
        this.y += this.vy * dt;
        this.rotation += 8 * dt;
        if (this.y > GROUND_Y - this.h) {
          this.y = GROUND_Y - this.h;
          this.vy = 0;
        }
        return;
      }

      // Gravity / jetpack
      if (this.jetpack) {
        this.vy += GRAVITY * 0.25 * dt;
        if (this.vy > 200) this.vy = 200;
        this.state = "fly";
      } else {
        this.vy += GRAVITY * dt;
      }

      this.y += this.vy * dt;

      // Ground collision
      if (this.y >= GROUND_Y - this.h) {
        this.y = GROUND_Y - this.h;
        this.vy = 0;
        this.onGround = true;
        this.jumpsUsed = 0;
        if (!this.jetpack) this.state = "run";
      } else {
        this.onGround = false;
        if (!this.jetpack) {
          this.state = this.vy < 0 ? "jump" : "fall";
        }
      }

      // Running legs
      if (this.state === "run") {
        this.legPhase += dt * (speed / 40);
      }

      // Dust while running
      if (this.onGround && this.state === "run") {
        this.dustTimer -= dt;
        if (this.dustTimer <= 0) {
          this.dustTimer = 0.04;
          particles.push(
            new Particle(this.x + 8, this.y + this.h, {
              vx: rand(-speed * 0.3, -speed * 0.1),
              vy: rand(-40, -10),
              life: rand(0.2, 0.4),
              size: rand(2, 5),
              color: "rgba(200,180,140,0.7)",
              gravity: 50,
            })
          );
        }
      }

      // Speed trail
      if (speed > BASE_SPEED * 1.2) {
        this.trail.push({
          x: this.x + this.w / 2,
          y: this.y + this.h / 2,
          life: 0.25,
          maxLife: 0.25,
        });
      }
      for (let i = this.trail.length - 1; i >= 0; i--) {
        this.trail[i].life -= dt;
        if (this.trail[i].life <= 0) this.trail.splice(i, 1);
      }
      if (this.trail.length > 20) this.trail.shift();
    }

    draw(ctx) {
      // Trail
      for (const t of this.trail) {
        const a = t.life / t.maxLife;
        ctx.globalAlpha = a * 0.45;
        const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, 18);
        g.addColorStop(0, "#00e5ff");
        g.addColorStop(1, "transparent");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 16 * a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.save();
      const cx = this.x + this.w / 2;
      const cy = this.y + this.h / 2;

      if (this.state === "crash") {
        ctx.translate(cx, cy);
        ctx.rotate(this.rotation);
        ctx.translate(-cx, -cy);
      } else if (this.state === "jump") {
        ctx.translate(cx, cy);
        ctx.rotate(-0.15);
        ctx.translate(-cx, -cy);
      } else if (this.state === "fall") {
        ctx.translate(cx, cy);
        ctx.rotate(0.2);
        ctx.translate(-cx, -cy);
      }

      // Shield aura
      if (this.shield) {
        ctx.strokeStyle = `rgba(0,229,255,${0.4 + Math.sin(this.glowPulse) * 0.3})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, 32, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Invincible flash
      if (this.invincible > 0 && Math.floor(this.invincible * 10) % 2 === 0) {
        ctx.globalAlpha = 0.4;
      }

      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(cx, GROUND_Y + 4, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Legs
      const legSwing = this.state === "run" ? Math.sin(this.legPhase) * 8 : 0;
      const legSwing2 = this.state === "run" ? Math.sin(this.legPhase + Math.PI) * 8 : 0;
      this._drawLimb(ctx, this.x + 10, this.y + this.h - 6, 6, 14, legSwing, "#4a5568");
      this._drawLimb(ctx, this.x + this.w - 16, this.y + this.h - 6, 6, 14, legSwing2, "#4a5568");

      // Arms
      const armSwing = this.state === "run" ? Math.sin(this.legPhase + Math.PI) * 10 : this.state === "jump" ? -20 : 5;
      this._drawLimb(ctx, this.x + 2, this.y + 14, 5, 12, armSwing, "#718096");
      this._drawLimb(ctx, this.x + this.w - 7, this.y + 14, 5, 12, -armSwing, "#718096");

      // Body
      const bodyGrad = ctx.createLinearGradient(this.x, this.y, this.x + this.w, this.y + this.h);
      bodyGrad.addColorStop(0, "#e2e8f0");
      bodyGrad.addColorStop(0.4, "#94a3b8");
      bodyGrad.addColorStop(1, "#64748b");
      ctx.fillStyle = bodyGrad;
      ctx.strokeStyle = "#334155";
      ctx.lineWidth = 2;
      roundRect(ctx, this.x, this.y, this.w, this.h - 4, 6);
      ctx.fill();
      ctx.stroke();

      // Chest panel
      ctx.fillStyle = "#1e293b";
      roundRect(ctx, this.x + 10, this.y + 16, this.w - 20, 12, 3);
      ctx.fill();
      ctx.fillStyle = `rgba(0,229,255,${0.6 + Math.sin(this.glowPulse) * 0.4})`;
      ctx.fillRect(this.x + 14, this.y + 19, this.w - 28, 6);

      // Antenna
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, this.y);
      ctx.lineTo(cx, this.y - 10);
      ctx.stroke();
      ctx.fillStyle = this.state === "crash" ? "#ff4444" : "#00e5ff";
      ctx.beginPath();
      ctx.arc(cx, this.y - 12, 4, 0, Math.PI * 2);
      ctx.fill();

      // Eyes
      const eyeY = this.y + 10;
      if (this.state === "crash") {
        ctx.strokeStyle = "#ff4444";
        ctx.lineWidth = 2;
        // X eyes
        [[this.x + 12, eyeY], [this.x + 28, eyeY]].forEach(([ex, ey]) => {
          ctx.beginPath();
          ctx.moveTo(ex - 4, ey - 4);
          ctx.lineTo(ex + 4, ey + 4);
          ctx.moveTo(ex + 4, ey - 4);
          ctx.lineTo(ex - 4, ey + 4);
          ctx.stroke();
        });
      } else {
        const glow = 0.7 + Math.sin(this.glowPulse) * 0.3;
        [[this.x + 12, eyeY], [this.x + 28, eyeY]].forEach(([ex, ey]) => {
          ctx.shadowColor = "#00e5ff";
          ctx.shadowBlur = 10 * glow;
          ctx.fillStyle = `rgba(0,229,255,${glow})`;
          ctx.beginPath();
          ctx.arc(ex, ey, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(ex - 1, ey - 1, 2, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Jetpack flames
      if (this.jetpack) {
        const flicker = rand(8, 16);
        ctx.fillStyle = "#ff6b35";
        ctx.beginPath();
        ctx.moveTo(this.x + 8, this.y + this.h - 4);
        ctx.lineTo(this.x + 16, this.y + this.h - 4);
        ctx.lineTo(this.x + 12, this.y + this.h + flicker);
        ctx.fill();
        ctx.fillStyle = "#ffd166";
        ctx.beginPath();
        ctx.moveTo(this.x + 10, this.y + this.h - 4);
        ctx.lineTo(this.x + 14, this.y + this.h - 4);
        ctx.lineTo(this.x + 12, this.y + this.h + flicker * 0.6);
        ctx.fill();
      }

      ctx.restore();
      ctx.globalAlpha = 1;
    }

    _drawLimb(ctx, x, y, w, h, angleDeg, color) {
      ctx.save();
      ctx.translate(x + w / 2, y);
      ctx.rotate((angleDeg * Math.PI) / 180);
      ctx.fillStyle = color;
      roundRect(ctx, -w / 2, 0, w, h, 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // ============================================================
  // Obstacles
  // ============================================================
  class Obstacle {
    /**
     * @param {string} type
     * @param {number} x
     * @param {object} extras
     */
    constructor(type, x, extras = {}) {
      this.type = type;
      this.x = x;
      this.alive = true;
      this.warned = false;
      this.needsWarning = false;
      this.animTime = 0;
      this.rotation = 0;
      this.passed = false;
      Object.assign(this, extras);
      this._initByType();
    }

    _initByType() {
      const t = this.type;
      switch (t) {
        case "spike_small":
          this.w = 28; this.h = 28; this.y = GROUND_Y - this.h;
          break;
        case "spike_group2":
          this.w = 56; this.h = 28; this.y = GROUND_Y - this.h;
          break;
        case "spike_group3":
          this.w = 84; this.h = 28; this.y = GROUND_Y - this.h;
          break;
        case "spike_tall":
          this.w = 30; this.h = 55; this.y = GROUND_Y - this.h;
          break;
        case "cactus":
          this.w = 28; this.h = 50; this.y = GROUND_Y - this.h;
          break;
        case "cactus_double":
          this.w = 55; this.h = 55; this.y = GROUND_Y - this.h;
          break;
        case "cactus_moving":
          this.w = 28; this.h = 48; this.y = GROUND_Y - this.h;
          this.baseY = this.y; this.moveAmp = 18; this.moveSpeed = 3;
          break;
        case "car_parked":
          this.w = 70; this.h = 36; this.y = GROUND_Y - this.h;
          break;
        case "car_moving":
          this.w = 72; this.h = 34; this.y = GROUND_Y - this.h;
          this.extraSpeed = this.extraSpeed ?? 180;
          this.needsWarning = true;
          break;
        case "car_broken":
          this.w = 75; this.h = 32; this.y = GROUND_Y - this.h;
          break;
        case "barrier":
          this.w = 40; this.h = 40; this.y = GROUND_Y - this.h;
          break;
        case "pit":
          this.w = this.w ?? 70; this.h = 30; this.y = GROUND_Y;
          break;
        case "saw":
          this.w = 50; this.h = 50; this.y = GROUND_Y - this.h;
          this.spinSpeed = 6;
          break;
        case "fire":
          this.w = 48; this.h = 30; this.y = GROUND_Y - this.h;
          break;
        case "bird":
          this.w = 36; this.h = 28;
          this.y = this.y ?? GROUND_Y - 120;
          this.baseY = this.y;
          break;
        case "bird_sine":
          this.w = 36; this.h = 28;
          this.y = this.y ?? GROUND_Y - 140;
          this.baseY = this.y;
          this.moveAmp = 40;
          this.moveSpeed = 2.5;
          break;
        case "plane":
          this.w = 80; this.h = 28;
          this.y = this.y ?? 120;
          this.extraSpeed = this.extraSpeed ?? 120;
          this.needsWarning = true;
          break;
        case "plane_low":
          this.w = 70; this.h = 26;
          this.y = GROUND_Y - 90;
          this.extraSpeed = this.extraSpeed ?? 100;
          this.needsWarning = true;
          break;
        case "rocket":
          this.w = 50; this.h = 22;
          this.y = this.y ?? GROUND_Y - 160;
          this.extraSpeed = this.extraSpeed ?? 220;
          this.needsWarning = true;
          break;
        case "flying_blade":
          this.w = 44; this.h = 44;
          this.y = this.y ?? GROUND_Y - 130;
          this.spinSpeed = 8;
          this.baseY = this.y;
          this.moveAmp = 30;
          this.moveSpeed = 2;
          break;
        case "drone":
          this.w = 40; this.h = 24;
          this.y = this.y ?? GROUND_Y - 150;
          this.baseY = this.y;
          this.moveAmp = 25;
          this.moveSpeed = 3;
          break;
        default:
          this.w = 30; this.h = 30; this.y = GROUND_Y - this.h;
      }
    }

    get hitbox() {
      // Shrink boxes slightly for fairness
      const pad = 4;
      if (this.type === "pit") {
        return { x: this.x + 8, y: this.y - 8, w: this.w - 16, h: 20 };
      }
      if (this.type.startsWith("spike")) {
        return { x: this.x + 4, y: this.y + 6, w: this.w - 8, h: this.h - 6 };
      }
      if (this.type === "fire") {
        return { x: this.x + 6, y: this.y + 8, w: this.w - 12, h: this.h - 8 };
      }
      return {
        x: this.x + pad,
        y: this.y + pad,
        w: this.w - pad * 2,
        h: this.h - pad * 2,
      };
    }

    update(dt, gameSpeed) {
      this.animTime += dt;
      const move = gameSpeed + (this.extraSpeed || 0);
      this.x -= move * dt;

      if (this.moveAmp) {
        this.y = this.baseY + Math.sin(this.animTime * this.moveSpeed) * this.moveAmp;
      }
      if (this.spinSpeed) {
        this.rotation += this.spinSpeed * dt;
      }
      if (this.x + this.w < -50) this.alive = false;
    }

    draw(ctx) {
      // Shadow
      if (this.type !== "pit") {
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.ellipse(
          this.x + this.w / 2,
          GROUND_Y + 3,
          this.w * 0.4,
          4,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      switch (this.type) {
        case "spike_small":
        case "spike_tall":
          this._drawSpike(ctx, this.x, this.y, this.w, this.h);
          break;
        case "spike_group2":
          this._drawSpike(ctx, this.x, this.y, 28, this.h);
          this._drawSpike(ctx, this.x + 28, this.y, 28, this.h);
          break;
        case "spike_group3":
          this._drawSpike(ctx, this.x, this.y, 28, this.h);
          this._drawSpike(ctx, this.x + 28, this.y, 28, this.h);
          this._drawSpike(ctx, this.x + 56, this.y, 28, this.h);
          break;
        case "cactus":
        case "cactus_moving":
          this._drawCactus(ctx, this.x, this.y, this.w, this.h, false);
          break;
        case "cactus_double":
          this._drawCactus(ctx, this.x, this.y, 26, this.h, true);
          this._drawCactus(ctx, this.x + 28, this.y + 8, 24, this.h - 8, false);
          break;
        case "car_parked":
          this._drawCar(ctx, "#3b82f6", false);
          break;
        case "car_moving":
          this._drawCar(ctx, "#ef4444", true);
          break;
        case "car_broken":
          this._drawCar(ctx, "#78716c", false, true);
          break;
        case "barrier":
          this._drawBarrier(ctx);
          break;
        case "pit":
          this._drawPit(ctx);
          break;
        case "saw":
        case "flying_blade":
          this._drawSaw(ctx);
          break;
        case "fire":
          this._drawFire(ctx);
          break;
        case "bird":
        case "bird_sine":
          this._drawBird(ctx);
          break;
        case "plane":
        case "plane_low":
          this._drawPlane(ctx);
          break;
        case "rocket":
          this._drawRocket(ctx);
          break;
        case "drone":
          this._drawDrone(ctx);
          break;
        default:
          ctx.fillStyle = "#f00";
          ctx.fillRect(this.x, this.y, this.w, this.h);
      }
    }

    _drawSpike(ctx, x, y, w, h) {
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.moveTo(x + w * 0.25, y + h);
      ctx.lineTo(x + w / 2, y);
      ctx.lineTo(x + w * 0.5, y + h);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    _drawCactus(ctx, x, y, w, h, arms) {
      ctx.fillStyle = "#16a34a";
      roundRect(ctx, x + w * 0.25, y, w * 0.5, h, 6);
      ctx.fill();
      if (arms !== false) {
        roundRect(ctx, x, y + h * 0.3, w * 0.4, w * 0.35, 4);
        ctx.fill();
        roundRect(ctx, x + w * 0.6, y + h * 0.45, w * 0.4, w * 0.3, 4);
        ctx.fill();
      }
      // Spines
      ctx.strokeStyle = "#15803d";
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const sy = y + 8 + i * (h / 5);
        ctx.beginPath();
        ctx.moveTo(x + w * 0.3, sy);
        ctx.lineTo(x + w * 0.15, sy - 4);
        ctx.stroke();
      }
    }

    _drawCar(ctx, color, moving, broken) {
      const { x, y, w, h } = this;
      ctx.fillStyle = color;
      roundRect(ctx, x, y + 8, w, h - 8, 4);
      ctx.fill();
      // Cabin
      ctx.fillStyle = broken ? "#57534e" : "#1e293b";
      roundRect(ctx, x + 14, y, w - 30, 14, 3);
      ctx.fill();
      if (!broken) {
        ctx.fillStyle = "#7dd3fc";
        ctx.fillRect(x + 18, y + 3, 12, 8);
        ctx.fillRect(x + w - 32, y + 3, 12, 8);
      }
      // Wheels
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.arc(x + 16, y + h, 8, 0, Math.PI * 2);
      ctx.arc(x + w - 16, y + h, 8, 0, Math.PI * 2);
      ctx.fill();
      if (moving) {
        ctx.fillStyle = "rgba(255,200,50,0.7)";
        ctx.beginPath();
        ctx.moveTo(x + w, y + 14);
        ctx.lineTo(x + w + 12, y + 10);
        ctx.lineTo(x + w + 12, y + 18);
        ctx.fill();
      }
      if (broken) {
        ctx.strokeStyle = "#a8a29e";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 20, y + 5);
        ctx.lineTo(x + 40, y + 20);
        ctx.stroke();
      }
    }

    _drawBarrier(ctx) {
      const { x, y, w, h } = this;
      ctx.fillStyle = "#f59e0b";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#1e293b";
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(x + 8 + i * 12, y);
        ctx.rotate(0.5);
        ctx.fillRect(0, 0, 8, h + 5);
        ctx.restore();
      }
    }

    _drawPit(ctx) {
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(this.x, this.y, this.w, 60);
      ctx.fillStyle = "#44403c";
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x + 10, this.y + 20);
      ctx.lineTo(this.x, this.y + 40);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(this.x + this.w, this.y);
      ctx.lineTo(this.x + this.w - 10, this.y + 20);
      ctx.lineTo(this.x + this.w, this.y + 40);
      ctx.fill();
    }

    _drawSaw(ctx) {
      const cx = this.x + this.w / 2;
      const cy = this.y + this.h / 2;
      const r = this.w / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.rotation);
      ctx.fillStyle = "#9ca3af";
      ctx.beginPath();
      const teeth = 12;
      for (let i = 0; i < teeth; i++) {
        const a0 = (i / teeth) * Math.PI * 2;
        const a1 = ((i + 0.5) / teeth) * Math.PI * 2;
        const a2 = ((i + 1) / teeth) * Math.PI * 2;
        ctx.lineTo(Math.cos(a0) * r * 0.7, Math.sin(a0) * r * 0.7);
        ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
        ctx.lineTo(Math.cos(a2) * r * 0.7, Math.sin(a2) * r * 0.7);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    _drawFire(ctx) {
      const t = this.animTime;
      for (let i = 0; i < 5; i++) {
        const fx = this.x + 6 + i * 8;
        const fh = 14 + Math.sin(t * 10 + i) * 8;
        const grad = ctx.createLinearGradient(fx, this.y + this.h, fx, this.y + this.h - fh);
        grad.addColorStop(0, "#fbbf24");
        grad.addColorStop(0.5, "#f97316");
        grad.addColorStop(1, "#ef4444");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(fx, this.y + this.h);
        ctx.quadraticCurveTo(fx - 6, this.y + this.h - fh * 0.5, fx + 4, this.y + this.h - fh);
        ctx.quadraticCurveTo(fx + 10, this.y + this.h - fh * 0.5, fx + 8, this.y + this.h);
        ctx.fill();
      }
    }

    _drawBird(ctx) {
      const wing = Math.sin(this.animTime * 12) * 8;
      ctx.fillStyle = "#7c3aed";
      // Body
      ctx.beginPath();
      ctx.ellipse(this.x + 18, this.y + 14, 14, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      // Spikes on back
      ctx.fillStyle = "#a78bfa";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(this.x + 8 + i * 8, this.y + 8);
        ctx.lineTo(this.x + 12 + i * 8, this.y - 4);
        ctx.lineTo(this.x + 16 + i * 8, this.y + 8);
        ctx.fill();
      }
      // Wing
      ctx.fillStyle = "#6d28d9";
      ctx.beginPath();
      ctx.moveTo(this.x + 16, this.y + 12);
      ctx.lineTo(this.x + 10, this.y + 12 - wing);
      ctx.lineTo(this.x + 24, this.y + 12);
      ctx.fill();
      // Eye
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.arc(this.x + 28, this.y + 12, 3, 0, Math.PI * 2);
      ctx.fill();
      // Beak
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.moveTo(this.x + 32, this.y + 14);
      ctx.lineTo(this.x + 40, this.y + 12);
      ctx.lineTo(this.x + 32, this.y + 16);
      ctx.fill();
    }

    _drawPlane(ctx) {
      const { x, y, w, h } = this;
      ctx.fillStyle = "#64748b";
      roundRect(ctx, x, y + 6, w - 10, h - 10, 4);
      ctx.fill();
      // Cockpit
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.ellipse(x + w - 18, y + h / 2, 10, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      // Wings
      ctx.fillStyle = "#475569";
      ctx.beginPath();
      ctx.moveTo(x + 25, y + 8);
      ctx.lineTo(x + 15, y - 8);
      ctx.lineTo(x + 45, y + 8);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 25, y + h - 4);
      ctx.lineTo(x + 15, y + h + 10);
      ctx.lineTo(x + 45, y + h - 4);
      ctx.fill();
      // Tail
      ctx.fillStyle = "#334155";
      ctx.fillRect(x, y + 4, 10, h - 4);
      // Prop blur
      ctx.strokeStyle = "rgba(200,200,200,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x + w - 2, y + h / 2, 3, 12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    _drawRocket(ctx) {
      const { x, y, w, h } = this;
      ctx.fillStyle = "#e11d48";
      roundRect(ctx, x + 8, y, w - 8, h, 4);
      ctx.fill();
      // Nose
      ctx.fillStyle = "#fda4af";
      ctx.beginPath();
      ctx.moveTo(x + w, y);
      ctx.lineTo(x + w + 14, y + h / 2);
      ctx.lineTo(x + w, y + h);
      ctx.fill();
      // Fins
      ctx.fillStyle = "#be123c";
      ctx.beginPath();
      ctx.moveTo(x + 8, y);
      ctx.lineTo(x, y - 6);
      ctx.lineTo(x + 14, y + 4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + 8, y + h);
      ctx.lineTo(x, y + h + 6);
      ctx.lineTo(x + 14, y + h - 4);
      ctx.fill();
      // Flame
      const fl = 10 + Math.sin(this.animTime * 20) * 6;
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 4);
      ctx.lineTo(x + 8 - fl, y + h / 2);
      ctx.lineTo(x + 8, y + h - 4);
      ctx.fill();
    }

    _drawDrone(ctx) {
      const { x, y, w, h } = this;
      const spin = this.animTime * 20;
      ctx.fillStyle = "#22d3ee";
      roundRect(ctx, x + 8, y + 6, w - 16, h - 8, 4);
      ctx.fill();
      // Lights
      ctx.fillStyle = Math.sin(this.animTime * 8) > 0 ? "#ef4444" : "#22c55e";
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, 4, 0, Math.PI * 2);
      ctx.fill();
      // Rotors
      ctx.strokeStyle = "rgba(200,200,200,0.6)";
      ctx.lineWidth = 2;
      [[x + 4, y + 4], [x + w - 4, y + 4]].forEach(([rx, ry]) => {
        ctx.beginPath();
        ctx.ellipse(rx, ry, 10, 3, spin, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
  }

  // ============================================================
  // ObstacleManager — fair spawning with difficulty curve
  // ============================================================
  class ObstacleManager {
    constructor() {
      this.obstacles = [];
      this.spawnTimer = 0;
      this.lastSpawnX = LOGICAL_W;
      this.minGap = 300;
      this.warnings = [];
    }

    reset() {
      this.obstacles = [];
      this.spawnTimer = 2.2;
      this.lastSpawnX = LOGICAL_W;
      this.warnings = [];
    }

    /**
     * Estimate jump clearance needed for a pattern.
     * Returns minimum gap (pixels) before next obstacle is safe.
     */
    _requiredGap(speed, pattern) {
      // Time to double-jump peak ≈ 0.55s at base; scale with speed
      const jumpDist = speed * 0.55;
      const doubleJumpDist = speed * 0.9;
      let need = jumpDist + 80;
      if (pattern.tall || pattern.combo) need = doubleJumpDist + 100;
      if (pattern.flying && pattern.ground) need = doubleJumpDist + 140;
      return Math.max(this.minGap, need);
    }

    _pickPattern(env, difficulty) {
      const groundDesert = [
        "spike_small", "spike_group2", "cactus", "cactus_double",
        "cactus_moving", "barrier", "spike_tall",
      ];
      const groundCity = [
        "spike_small", "spike_group2", "spike_group3", "car_parked",
        "car_moving", "car_broken", "barrier", "spike_tall",
      ];
      const groundFactory = [
        "spike_tall", "spike_group2", "saw", "fire", "barrier",
        "pit", "spike_group3",
      ];
      const flyDesert = ["bird", "bird_sine", "plane", "plane_low"];
      const flyCity = ["drone", "bird", "plane", "plane_low", "rocket"];
      const flyFactory = ["flying_blade", "rocket", "drone", "bird_sine", "saw"];

      let grounds, flies;
      if (env === "desert") {
        grounds = groundDesert;
        flies = flyDesert;
      } else if (env === "city") {
        grounds = groundCity;
        flies = flyCity;
      } else {
        grounds = groundFactory;
        flies = flyFactory;
      }

      const roll = Math.random();
      // Combo chance rises with difficulty
      const comboChance = clamp(0.1 + difficulty * 0.35, 0.1, 0.5);

      if (roll < comboChance && difficulty > 0.2) {
        // Ground + flying combo (ensure fly height is jumpable)
        const g = grounds[randInt(0, grounds.length - 1)];
        const f = flies[randInt(0, flies.length - 1)];
        const flyY = GROUND_Y - rand(100, 160);
        return {
          items: [
            { type: g },
            { type: f, y: flyY, delay: rand(40, 90) },
          ],
          tall: g.includes("tall") || g === "saw",
          combo: true,
          flying: true,
          ground: true,
        };
      }

      if (roll < 0.55) {
        const g = grounds[randInt(0, grounds.length - 1)];
        return {
          items: [{ type: g }],
          tall: g.includes("tall") || g === "saw" || g === "pit",
          flying: false,
          ground: true,
        };
      }

      const f = flies[randInt(0, flies.length - 1)];
      let y;
      if (f === "plane") y = rand(80, 140);
      else if (f === "plane_low") y = GROUND_Y - 90;
      else if (f === "rocket") y = GROUND_Y - rand(110, 180);
      else y = GROUND_Y - rand(90, 170);

      return {
        items: [{ type: f, y }],
        flying: true,
        ground: false,
        tall: false,
      };
    }

    update(dt, gameSpeed, envId, distance, slowMo) {
      const difficulty = clamp(Math.pow(distance / 12000, 1.15), 0, 1);
      const speed = slowMo ? gameSpeed * 0.45 : gameSpeed;

      // Update existing
      for (const o of this.obstacles) o.update(dt, speed);
      this.obstacles = this.obstacles.filter((o) => o.alive);

      // Spawn cadence tightens with difficulty
      const baseInterval = lerp(1.8, 0.6, difficulty);
      this.spawnTimer -= dt;

      if (this.spawnTimer <= 0) {
        const pattern = this._pickPattern(envId, difficulty);
        const gap = this._requiredGap(gameSpeed, pattern);

        // Ensure fair spacing from last obstacle
        const rightmost = this.obstacles.reduce(
          (m, o) => Math.max(m, o.x + o.w),
          0
        );
        let spawnX = Math.max(LOGICAL_W + 40, rightmost + gap);

        for (const item of pattern.items) {
          const ox = spawnX + (item.delay || 0);
          const obs = new Obstacle(item.type, ox, {
            y: item.y,
            extraSpeed: item.type === "car_moving"
              ? 120 + difficulty * 100
              : item.type === "rocket"
                ? 180 + difficulty * 120
                : item.type.startsWith("plane")
                  ? 80 + difficulty * 80
                  : 0,
          });
          this.obstacles.push(obs);

          if (obs.needsWarning && !obs.warned) {
            this.warnings.push({
              timer: 1.2,
              type: obs.type,
              obstacle: obs,
            });
            obs.warned = true;
          }
        }

        this.spawnTimer = baseInterval + rand(0, 0.4) * (1 - difficulty * 0.5);
      }

      // Warnings
      for (const w of this.warnings) w.timer -= dt;
      this.warnings = this.warnings.filter((w) => w.timer > 0 && w.obstacle.alive);
    }

    checkCollisions(robot) {
      const hb = robot.hitbox;
      for (const o of this.obstacles) {
        if (aabb(hb, o.hitbox)) return o;
      }
      // Pit: fall in if robot is over pit and near ground
      for (const o of this.obstacles) {
        if (o.type === "pit") {
          if (
            hb.x + hb.w > o.x + 10 &&
            hb.x < o.x + o.w - 10 &&
            robot.y + robot.h >= GROUND_Y - 5
          ) {
            return o;
          }
        }
      }
      return null;
    }

    draw(ctx) {
      for (const o of this.obstacles) o.draw(ctx);
    }
  }

  // ============================================================
  // Coins
  // ============================================================
  class Coin {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.r = 10;
      this.alive = true;
      this.animTime = Math.random() * Math.PI * 2;
      this.collected = false;
    }

    get hitbox() {
      return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 };
    }

    update(dt, speed, robot) {
      this.animTime += dt * 5;
      this.x -= speed * dt;

      // Magnet attraction
      if (robot.magnet && this.alive) {
        const dx = robot.x + robot.w / 2 - this.x;
        const dy = robot.y + robot.h / 2 - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 180) {
          this.x += (dx / dist) * 400 * dt;
          this.y += (dy / dist) * 400 * dt;
        }
      }

      if (this.x < -30) this.alive = false;
    }

    draw(ctx) {
      const bob = Math.sin(this.animTime) * 4;
      const scale = 0.85 + Math.sin(this.animTime * 2) * 0.15;
      ctx.save();
      ctx.translate(this.x, this.y + bob);
      ctx.scale(scale, 1);
      // Glow
      ctx.shadowColor = "#fbbf24";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(0, 0, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.arc(-2, -2, this.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#d97706";
      ctx.font = "bold 12px Fredoka, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", 0, 1);
      ctx.restore();
    }
  }

  // ============================================================
  // Power-ups
  // ============================================================
  const POWERUP_TYPES = [
    { id: "shield", label: "Shield", color: "#00e5ff", duration: 0 },
    { id: "magnet", label: "Magnet", color: "#a78bfa", duration: 6 },
    { id: "slowmo", label: "Slow-Mo", color: "#38bdf8", duration: 4 },
    { id: "jetpack", label: "Jetpack", color: "#fb923c", duration: 3.5 },
    { id: "superjump", label: "Super Jump", color: "#4ade80", duration: 5 },
  ];

  class PowerUp {
    constructor(x, y, type) {
      this.x = x;
      this.y = y;
      this.type = type;
      this.w = 28;
      this.h = 28;
      this.alive = true;
      this.animTime = 0;
    }

    get hitbox() {
      return { x: this.x, y: this.y, w: this.w, h: this.h };
    }

    update(dt, speed) {
      this.animTime += dt;
      this.x -= speed * dt;
      this.y += Math.sin(this.animTime * 3) * 0.3;
      if (this.x < -40) this.alive = false;
    }

    draw(ctx) {
      const info = POWERUP_TYPES.find((p) => p.id === this.type) || POWERUP_TYPES[0];
      const bob = Math.sin(this.animTime * 4) * 5;
      ctx.save();
      ctx.translate(this.x + this.w / 2, this.y + this.h / 2 + bob);
      ctx.rotate(this.animTime);
      ctx.shadowColor = info.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = info.color;
      // Draw as hexagon gem
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = Math.cos(a) * 14;
        const py = Math.sin(a) * 14;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(-3, -3, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Label hint
      ctx.fillStyle = info.color;
      ctx.font = "10px Fredoka, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(info.label, this.x + this.w / 2, this.y + this.h + 14 + bob);
    }
  }

  // ============================================================
  // Background — parallax layered environments
  // ============================================================
  class Background {
    constructor() {
      this.envId = "desert";
      this.nextEnvId = null;
      this.transition = 0;
      this.time = 0;
      this.clouds = this._makeClouds();
      this.scroll = 0;
      this.dayNight = 0; // 0 day-ish, 1 night
    }

    _makeClouds() {
      const c = [];
      for (let i = 0; i < 8; i++) {
        c.push({
          x: rand(0, LOGICAL_W),
          y: rand(30, 160),
          w: rand(60, 140),
          speed: rand(8, 25),
          alpha: rand(0.3, 0.7),
        });
      }
      return c;
    }

    setEnvironment(id, animate = true) {
      if (id === this.envId) return;
      if (animate) {
        this.nextEnvId = id;
        this.transition = 0;
      } else {
        this.envId = id;
        this.nextEnvId = null;
      }
    }

    update(dt, speed) {
      this.time += dt;
      this.scroll += speed * dt;
      for (const c of this.clouds) {
        c.x -= c.speed * dt * (speed / BASE_SPEED);
        if (c.x + c.w < 0) {
          c.x = LOGICAL_W + rand(20, 100);
          c.y = rand(30, 160);
        }
      }
      if (this.nextEnvId) {
        this.transition += dt * 0.4;
        if (this.transition >= 1) {
          this.envId = this.nextEnvId;
          this.nextEnvId = null;
          this.transition = 0;
        }
      }
      // Day-night based on scroll within city/factory
      if (this.envId === "city" || this.envId === "factory") {
        this.dayNight = lerp(this.dayNight, 1, dt * 0.3);
      } else {
        this.dayNight = lerp(this.dayNight, 0, dt * 0.3);
      }
    }

    draw(ctx) {
      const id = this.nextEnvId && this.transition > 0.5 ? this.nextEnvId : this.envId;
      this._drawSky(ctx, id);
      this._drawFar(ctx, id, this.scroll * 0.15);
      this._drawMid(ctx, id, this.scroll * 0.4);
      this._drawClouds(ctx);
      this._drawNear(ctx, id, this.scroll * 0.7);
      this._drawGround(ctx, id, this.scroll);

      // Transition flash overlay
      if (this.nextEnvId) {
        const a = Math.sin(this.transition * Math.PI) * 0.35;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      }
    }

    _drawSky(ctx, env) {
      let g;
      if (env === "desert") {
        g = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
        g.addColorStop(0, "#1e3a5f");
        g.addColorStop(0.35, "#e07a3d");
        g.addColorStop(0.65, "#f4a261");
        g.addColorStop(1, "#e9c46a");
      } else if (env === "city") {
        g = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
        g.addColorStop(0, "#0f0c29");
        g.addColorStop(0.4, "#302b63");
        g.addColorStop(1, "#24243e");
      } else {
        g = ctx.createLinearGradient(0, 0, 0, LOGICAL_H);
        g.addColorStop(0, "#1a1a2e");
        g.addColorStop(0.5, "#16213e");
        g.addColorStop(1, "#0f3460");
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

      // Sun / moon
      if (env === "desert") {
        ctx.fillStyle = "#ffcc66";
        ctx.shadowColor = "#ff9944";
        ctx.shadowBlur = 40;
        ctx.beginPath();
        ctx.arc(780, 100, 45, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = "#e2e8f0";
        ctx.shadowColor = "#94a3b8";
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(800, 70, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        // Stars
        ctx.fillStyle = "#fff";
        for (let i = 0; i < 40; i++) {
          const sx = (i * 97 + this.scroll * 0.02) % LOGICAL_W;
          const sy = (i * 53) % 200;
          ctx.globalAlpha = 0.3 + (Math.sin(this.time + i) + 1) * 0.35;
          ctx.fillRect(sx, sy, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
    }

    _drawClouds(ctx) {
      for (const c of this.clouds) {
        ctx.globalAlpha = c.alpha * (this.envId === "desert" ? 0.7 : 0.35);
        ctx.fillStyle = this.envId === "desert" ? "#ffe8cc" : "#64748b";
        this._cloud(ctx, c.x, c.y, c.w);
      }
      ctx.globalAlpha = 1;
    }

    _cloud(ctx, x, y, w) {
      ctx.beginPath();
      ctx.arc(x, y, w * 0.25, 0, Math.PI * 2);
      ctx.arc(x + w * 0.3, y - 8, w * 0.3, 0, Math.PI * 2);
      ctx.arc(x + w * 0.6, y, w * 0.28, 0, Math.PI * 2);
      ctx.arc(x + w * 0.35, y + 6, w * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }

    _drawFar(ctx, env, scroll) {
      if (env === "desert") {
        // Sand dunes
        ctx.fillStyle = "#d4a373";
        this._dunes(ctx, scroll, 280, 80, 0.6);
        ctx.fillStyle = "#c48b5a";
        this._dunes(ctx, scroll * 1.1, 320, 60, 0.8);
      } else if (env === "city") {
        this._buildings(ctx, scroll, 0.5, true);
      } else {
        this._factoryFar(ctx, scroll);
      }
    }

    _drawMid(ctx, env, scroll) {
      if (env === "desert") {
        // Rocks
        ctx.fillStyle = "#8b6914";
        for (let i = 0; i < 6; i++) {
          const x = ((i * 220 - scroll) % (LOGICAL_W + 100)) - 50;
          ctx.beginPath();
          ctx.moveTo(x, GROUND_Y - 20);
          ctx.lineTo(x + 30, GROUND_Y - 45);
          ctx.lineTo(x + 55, GROUND_Y - 25);
          ctx.lineTo(x + 60, GROUND_Y);
          ctx.lineTo(x, GROUND_Y);
          ctx.fill();
        }
      } else if (env === "city") {
        this._buildings(ctx, scroll, 1, false);
        this._neonSigns(ctx, scroll);
      } else {
        this._pipes(ctx, scroll);
      }
    }

    _drawNear(ctx, env, scroll) {
      // Subtle foreground decorations
      if (env === "desert") {
        ctx.fillStyle = "#b08968";
        for (let i = 0; i < 10; i++) {
          const x = ((i * 140 - scroll) % (LOGICAL_W + 60)) - 30;
          ctx.fillRect(x, GROUND_Y - 8, 4, 8);
          ctx.fillRect(x + 20, GROUND_Y - 5, 3, 5);
        }
      }
    }

    _drawGround(ctx, env, scroll) {
      let top, mid, bot;
      if (env === "desert") {
        top = "#e9c46a";
        mid = "#d4a373";
        bot = "#b08968";
      } else if (env === "city") {
        top = "#334155";
        mid = "#1e293b";
        bot = "#0f172a";
      } else {
        top = "#57534e";
        mid = "#44403c";
        bot = "#292524";
      }

      ctx.fillStyle = top;
      ctx.fillRect(0, GROUND_Y, LOGICAL_W, 8);
      ctx.fillStyle = mid;
      ctx.fillRect(0, GROUND_Y + 8, LOGICAL_W, 40);
      ctx.fillStyle = bot;
      ctx.fillRect(0, GROUND_Y + 48, LOGICAL_W, LOGICAL_H - GROUND_Y - 48);

      // Animated road markings / sand ripples
      if (env === "city" || env === "factory") {
        ctx.fillStyle = env === "city" ? "#fbbf24" : "#78716c";
        const markW = 40;
        const gap = 50;
        const offset = scroll % (markW + gap);
        for (let x = -offset; x < LOGICAL_W; x += markW + gap) {
          ctx.fillRect(x, GROUND_Y + 22, markW, 5);
        }
      } else {
        ctx.strokeStyle = "rgba(176,137,104,0.5)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
          const x = ((i * 100 - scroll * 0.5) % (LOGICAL_W + 80)) - 40;
          ctx.beginPath();
          ctx.moveTo(x, GROUND_Y + 20);
          ctx.quadraticCurveTo(x + 40, GROUND_Y + 28, x + 80, GROUND_Y + 18);
          ctx.stroke();
        }
      }
    }

    _dunes(ctx, scroll, baseY, amp, alpha) {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(0, LOGICAL_H);
      for (let x = 0; x <= LOGICAL_W; x += 10) {
        const y = baseY + Math.sin((x + scroll) * 0.01) * amp + Math.sin((x + scroll) * 0.02) * amp * 0.4;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(LOGICAL_W, LOGICAL_H);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    _buildings(ctx, scroll, scale, far) {
      const count = far ? 12 : 8;
      for (let i = 0; i < count; i++) {
        const bw = (far ? 50 : 70) * scale;
        const bh = (far ? rand(60, 140) : 80 + (i * 37) % 160) * scale;
        // Deterministic height
        const h = far ? 60 + ((i * 73) % 100) : 90 + ((i * 97) % 150);
        const x = ((i * (bw + 20) - scroll) % (LOGICAL_W + bw * 2)) - bw;
        ctx.fillStyle = far ? "#1a1540" : "#1e293b";
        ctx.fillRect(x, GROUND_Y - h, bw, h);
        // Windows
        if (!far) {
          for (let wy = 10; wy < h - 10; wy += 16) {
            for (let wx = 6; wx < bw - 8; wx += 14) {
              const lit = ((i + wy + Math.floor(this.time)) * 3) % 5 !== 0;
              ctx.fillStyle = lit ? "#fbbf24" : "#334155";
              ctx.fillRect(x + wx, GROUND_Y - h + wy, 8, 10);
            }
          }
        }
      }
    }

    _neonSigns(ctx, scroll) {
      const signs = [
        { text: "NEON", color: "#ff00aa" },
        { text: "RUSH", color: "#00e5ff" },
        { text: "OPEN", color: "#39ff14" },
      ];
      signs.forEach((s, i) => {
        const x = ((i * 320 + 100 - scroll * 0.9) % (LOGICAL_W + 100)) - 50;
        const y = GROUND_Y - 180 - (i % 3) * 30;
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = s.color;
        ctx.font = "bold 14px Orbitron, sans-serif";
        ctx.fillText(s.text, x, y);
        ctx.shadowBlur = 0;
      });
    }

    _factoryFar(ctx, scroll) {
      ctx.fillStyle = "#292524";
      for (let i = 0; i < 8; i++) {
        const x = ((i * 140 - scroll) % (LOGICAL_W + 120)) - 60;
        const h = 100 + (i % 3) * 40;
        ctx.fillRect(x, GROUND_Y - h, 80, h);
        // Smokestack
        ctx.fillRect(x + 30, GROUND_Y - h - 40, 16, 40);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#78716c";
        ctx.beginPath();
        ctx.arc(x + 38, GROUND_Y - h - 50 - Math.sin(this.time + i) * 10, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#292524";
      }
    }

    _pipes(ctx, scroll) {
      ctx.strokeStyle = "#78716c";
      ctx.lineWidth = 10;
      for (let i = 0; i < 5; i++) {
        const x = ((i * 200 - scroll) % (LOGICAL_W + 100)) - 50;
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y - 60);
        ctx.lineTo(x + 40, GROUND_Y - 60);
        ctx.lineTo(x + 40, GROUND_Y - 100);
        ctx.lineTo(x + 80, GROUND_Y - 100);
        ctx.stroke();
        ctx.fillStyle = "#57534e";
        ctx.beginPath();
        ctx.arc(x, GROUND_Y - 60, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ============================================================
  // UIManager
  // ============================================================
  class UIManager {
    constructor(audio) {
      this.audio = audio;
      this.els = {
        start: document.getElementById("start-screen"),
        instructions: document.getElementById("instructions-screen"),
        pause: document.getElementById("pause-screen"),
        gameover: document.getElementById("gameover-screen"),
        hud: document.getElementById("hud"),
        score: document.getElementById("hud-score"),
        coins: document.getElementById("hud-coins"),
        distance: document.getElementById("hud-distance"),
        speed: document.getElementById("hud-speed"),
        env: document.getElementById("hud-env"),
        powerup: document.getElementById("hud-powerup"),
        milestone: document.getElementById("hud-milestone"),
        menuHigh: document.getElementById("menu-high-score"),
        goScore: document.getElementById("go-score"),
        goHigh: document.getElementById("go-high-score"),
        goCoins: document.getElementById("go-coins"),
        goDistance: document.getElementById("go-distance"),
        newRecord: document.getElementById("new-record"),
        warning: document.getElementById("warning-indicator"),
        soundMenu: document.getElementById("btn-sound-menu"),
        soundHud: document.getElementById("btn-sound-hud"),
      };
      this._updateSoundButtons();
    }

    show(screen) {
      ["start", "instructions", "pause", "gameover"].forEach((k) => {
        this.els[k].classList.toggle("active", k === screen);
      });
      this.els.hud.classList.toggle("hidden", screen !== null && screen !== "playing");
      if (screen === "playing") {
        this.els.hud.classList.remove("hidden");
        ["start", "instructions", "pause", "gameover"].forEach((k) =>
          this.els[k].classList.remove("active")
        );
      }
    }

    updateHud(data) {
      this.els.score.textContent = Math.floor(data.score);
      this.els.coins.textContent = data.coins;
      this.els.distance.textContent = Math.floor(data.distance) + "m";
      this.els.speed.textContent = data.speedMul.toFixed(1) + "x";
      this.els.env.textContent = data.envName;

      if (data.powerupLabel) {
        this.els.powerup.textContent = data.powerupLabel;
        this.els.powerup.classList.remove("hidden");
      } else {
        this.els.powerup.classList.add("hidden");
      }

      this.els.warning.classList.toggle("hidden", !data.showWarning);
    }

    showMilestone(text) {
      this.els.milestone.textContent = text;
      this.els.milestone.classList.remove("hidden");
      clearTimeout(this._msTimer);
      this._msTimer = setTimeout(() => {
        this.els.milestone.classList.add("hidden");
      }, 1500);
    }

    showGameOver(stats) {
      this.els.goScore.textContent = Math.floor(stats.score);
      this.els.goHigh.textContent = stats.highScore;
      this.els.goCoins.textContent = stats.coins;
      this.els.goDistance.textContent = Math.floor(stats.distance) + "m";
      this.els.newRecord.classList.toggle("hidden", !stats.isNewRecord);
      this.show("gameover");
    }

    setMenuHighScore(n) {
      this.els.menuHigh.textContent = n;
    }

    _updateSoundButtons() {
      const on = this.audio.enabled;
      this.els.soundMenu.textContent = on ? "🔊 Sound On" : "🔇 Sound Off";
      this.els.soundHud.textContent = on ? "🔊" : "🔇";
    }

    toggleSound() {
      this.audio.toggle();
      this._updateSoundButtons();
      this.audio.playClick();
    }
  }

  // ============================================================
  // Game — main controller
  // ============================================================
  class Game {
    constructor() {
      this.canvas = document.getElementById("game-canvas");
      this.ctx = this.canvas.getContext("2d");
      this.audio = new AudioManager();
      this.input = new InputManager(this.canvas);
      this.ui = new UIManager(this.audio);
      this.robot = new Robot();
      this.obstacles = new ObstacleManager();
      this.background = new Background();
      this.particles = [];
      this.coins = [];
      this.powerups = [];

      this.state = "menu"; // menu | playing | paused | gameover
      this.score = 0;
      this.coinsCollected = 0;
      this.distance = 0;
      this.coinCombo = 0;
      this.comboTimer = 0;
      this.speed = BASE_SPEED;
      this.slowMo = false;
      this.slowMoTimer = 0;
      this.activePower = null;
      this.powerTimer = 0;
      this.shake = 0;
      this.milestoneAt = 500;
      this.lastMilestone = 0;
      this.coinSpawnTimer = 0;
      this.powerSpawnTimer = 5;
      this.envIndex = 0;
      this.dpr = 1;
      this.lastTime = 0;
      this.raf = null;

      this.highScore = this._loadHighScore();
      this.ui.setMenuHighScore(this.highScore);

      this._bindUI();
      this._resize();
      window.addEventListener("resize", () => this._resize());
      window.addEventListener("orientationchange", () => this._resize());

      // Idle menu animation
      this.lastTime = performance.now();
      this._loop(this.lastTime);
    }

    _loadHighScore() {
      try {
        return parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10) || 0;
      } catch (_) {
        return 0;
      }
    }

    _saveHighScore(n) {
      try {
        localStorage.setItem(STORAGE_KEY, String(n));
      } catch (_) { /* ignore */ }
    }

    _bindUI() {
      const click = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", (e) => {
          e.stopPropagation();
          this.audio.playClick();
          fn();
        });
      };

      click("btn-play", () => this.start());
      click("btn-instructions", () => this.ui.show("instructions"));
      click("btn-close-instructions", () => this.ui.show("start"));
      click("btn-restart", () => this.start());
      click("btn-menu", () => this.toMenu());
      click("btn-menu-from-pause", () => this.toMenu());
      click("btn-resume", () => this.resume());
      click("btn-pause", () => this.pause());
      click("btn-sound-menu", () => this.ui.toggleSound());
      click("btn-sound-hud", () => this.ui.toggleSound());
    }

    _resize() {
      const wrap = document.getElementById("game-wrapper");
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.scale = Math.min(w / LOGICAL_W, h / LOGICAL_H);
      this.offsetX = (w - LOGICAL_W * this.scale) / 2;
      this.offsetY = (h - LOGICAL_H * this.scale) / 2;
    }

    start() {
      this.robot.reset();
      this.obstacles.reset();
      this.particles = [];
      this.coins = [];
      this.powerups = [];
      this.score = 0;
      this.coinsCollected = 0;
      this.distance = 0;
      this.coinCombo = 0;
      this.comboTimer = 0;
      this.speed = BASE_SPEED;
      this.slowMo = false;
      this.slowMoTimer = 0;
      this.activePower = null;
      this.powerTimer = 0;
      this.shake = 0;
      this.lastMilestone = 0;
      this.coinSpawnTimer = 1;
      this.powerSpawnTimer = 8;
      this.envIndex = 0;
      this.input.jumpQueued = false;
      this.background.setEnvironment("desert", false);
      this.state = "playing";
      this.ui.show("playing");
      this.audio.ensureCtx();
      this.audio.startMusic();
    }

    toMenu() {
      this.state = "menu";
      this.audio.stopMusic();
      this.ui.setMenuHighScore(this.highScore);
      this.ui.show("start");
    }

    pause() {
      if (this.state !== "playing") return;
      this.state = "paused";
      this.ui.show("pause");
    }

    resume() {
      if (this.state !== "paused") return;
      this.state = "playing";
      this.ui.show("playing");
    }

    gameOver() {
      this.state = "gameover";
      this.robot.crash();
      this.audio.playCollision();
      this.audio.stopMusic();
      this.shake = 0.45;

      // Crash particles
      const cx = this.robot.x + this.robot.w / 2;
      const cy = this.robot.y + this.robot.h / 2;
      for (let i = 0; i < 30; i++) {
        this.particles.push(
          new Particle(cx, cy, {
            vx: rand(-250, 250),
            vy: rand(-300, 50),
            life: rand(0.4, 1),
            size: rand(2, 7),
            color: chance(0.5) ? "#ff6b35" : "#fbbf24",
            shape: "spark",
            gravity: 300,
          })
        );
      }
      for (let i = 0; i < 20; i++) {
        this.particles.push(
          new Particle(cx, cy, {
            vx: rand(-60, 60),
            vy: rand(-80, -20),
            life: rand(0.6, 1.4),
            size: rand(8, 20),
            color: "rgba(80,80,80,0.5)",
            gravity: -20,
            friction: 0.95,
          })
        );
      }

      const finalScore = Math.floor(this.score);
      const isNew = finalScore > this.highScore;
      if (isNew) {
        this.highScore = finalScore;
        this._saveHighScore(this.highScore);
      }

      // Brief delay so crash anim plays
      setTimeout(() => {
        this.ui.showGameOver({
          score: finalScore,
          highScore: this.highScore,
          coins: this.coinsCollected,
          distance: this.distance,
          isNewRecord: isNew,
        });
      }, 700);
    }

    _currentEnv() {
      let env = ENVIRONMENTS[0];
      for (const e of ENVIRONMENTS) {
        if (this.score >= e.unlockAt) env = e;
      }
      return env;
    }

    _applyPowerUp(type) {
      const info = POWERUP_TYPES.find((p) => p.id === type);
      this.audio.playPowerUp();

      // Clear previous timed effects
      this.robot.magnet = false;
      this.robot.superJump = false;
      this.robot.jetpack = false;
      this.slowMo = false;

      if (type === "shield") {
        this.robot.shield = true;
        this.activePower = { id: "shield", label: "Shield 🛡" };
        this.powerTimer = 0; // until used
      } else if (type === "magnet") {
        this.robot.magnet = true;
        this.activePower = { id: "magnet", label: "Magnet" };
        this.powerTimer = info.duration;
      } else if (type === "slowmo") {
        this.slowMo = true;
        this.slowMoTimer = info.duration;
        this.activePower = { id: "slowmo", label: "Slow-Mo" };
        this.powerTimer = info.duration;
      } else if (type === "jetpack") {
        this.robot.jetpack = true;
        this.robot.jumpsUsed = 0;
        this.activePower = { id: "jetpack", label: "Jetpack" };
        this.powerTimer = info.duration;
      } else if (type === "superjump") {
        this.robot.superJump = true;
        this.activePower = { id: "superjump", label: "Super Jump" };
        this.powerTimer = info.duration;
      }
    }

    _spawnCoinsNearObstacles() {
      // Place coins in jump arcs around upcoming obstacles
      const upcoming = this.obstacles.obstacles.filter(
        (o) => o.x > LOGICAL_W * 0.5 && o.x < LOGICAL_W + 200
      );
      if (!upcoming.length && chance(0.4)) {
        const y = GROUND_Y - rand(50, 160);
        for (let i = 0; i < 3; i++) {
          this.coins.push(new Coin(LOGICAL_W + 40 + i * 28, y - Math.sin(i) * 20));
        }
        return;
      }
      for (const o of upcoming) {
        if (chance(0.55)) {
          const baseY = Math.min(o.y - 40, GROUND_Y - 60);
          const count = randInt(2, 4);
          for (let i = 0; i < count; i++) {
            this.coins.push(
              new Coin(o.x + i * 30 - 10, baseY - Math.sin(i * 0.8) * 25)
            );
          }
        }
      }
    }

    update(dt) {
      // Input that works in any state
      if (this.input.consumeRestart() && (this.state === "playing" || this.state === "gameover" || this.state === "paused")) {
        this.start();
        return;
      }
      if (this.input.consumePause()) {
        if (this.state === "playing") this.pause();
        else if (this.state === "paused") this.resume();
      }

      if (this.state === "menu" || this.state === "paused") {
        this.background.update(dt * 0.3, BASE_SPEED * 0.3);
        return;
      }

      if (this.state === "gameover") {
        this.robot.update(dt, 0, this.particles);
        for (const p of this.particles) p.update(dt);
        this.particles = this.particles.filter((p) => p.alive);
        if (this.shake > 0) this.shake -= dt;
        return;
      }

      // --- Playing ---
      if (this.input.consumeJump()) {
        this.robot.jump(this.audio);
      }

      // Difficulty speed ramp — stays gentle early, ramps later
      const difficulty = clamp(Math.pow(this.distance / 12000, 1.15), 0, 1);
      this.speed = lerp(BASE_SPEED, MAX_SPEED, difficulty);
      const effectiveSpeed = this.slowMo ? this.speed * 0.45 : this.speed;

      this.distance += effectiveSpeed * dt * 0.1;
      this.score += effectiveSpeed * dt * 0.15;

      // Environment switch
      const env = this._currentEnv();
      if (env.id !== this.background.envId && !this.background.nextEnvId) {
        this.background.setEnvironment(env.id, true);
      }

      this.background.update(dt, effectiveSpeed);
      this.robot.update(dt, effectiveSpeed, this.particles);
      this.obstacles.update(dt, this.speed, env.id, this.distance, this.slowMo);

      // Coins
      this.coinSpawnTimer -= dt;
      if (this.coinSpawnTimer <= 0) {
        this._spawnCoinsNearObstacles();
        this.coinSpawnTimer = rand(1.2, 2.5);
      }
      for (const c of this.coins) {
        c.update(dt, effectiveSpeed, this.robot);
        if (c.alive && aabb(this.robot.hitbox, c.hitbox)) {
          c.alive = false;
          this.coinsCollected++;
          this.coinCombo++;
          this.comboTimer = 1.5;
          const bonus = COIN_VALUE + (this.coinCombo - 1) * COMBO_BONUS;
          this.score += bonus;
          this.audio.playCoin();
          for (let i = 0; i < 8; i++) {
            this.particles.push(
              new Particle(c.x, c.y, {
                vx: rand(-100, 100),
                vy: rand(-150, -40),
                life: 0.4,
                size: rand(2, 5),
                color: "#fbbf24",
                gravity: 200,
              })
            );
          }
        }
      }
      // Missed coins that scrolled past the robot break the combo
      for (const c of this.coins) {
        if (c.alive && c.x + c.r < this.robot.x) {
          c.alive = false;
          this.coinCombo = 0;
        }
      }
      this.coins = this.coins.filter((c) => c.alive);
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.coinCombo = 0;
      }

      // Power-ups
      this.powerSpawnTimer -= dt;
      if (this.powerSpawnTimer <= 0) {
        const type = POWERUP_TYPES[randInt(0, POWERUP_TYPES.length - 1)].id;
        this.powerups.push(
          new PowerUp(LOGICAL_W + 40, GROUND_Y - rand(70, 160), type)
        );
        this.powerSpawnTimer = rand(10, 18);
      }
      for (const p of this.powerups) {
        p.update(dt, effectiveSpeed);
        if (p.alive && aabb(this.robot.hitbox, p.hitbox)) {
          p.alive = false;
          this._applyPowerUp(p.type);
        }
      }
      this.powerups = this.powerups.filter((p) => p.alive);

      // Power-up timers
      if (this.activePower && this.activePower.id !== "shield") {
        this.powerTimer -= dt;
        if (this.powerTimer <= 0) {
          this.robot.magnet = false;
          this.robot.superJump = false;
          this.robot.jetpack = false;
          this.slowMo = false;
          this.activePower = null;
        }
      }
      if (this.slowMo) {
        this.slowMoTimer -= dt;
        if (this.slowMoTimer <= 0) this.slowMo = false;
      }

      // Collisions
      if (this.robot.invincible <= 0) {
        const hit = this.obstacles.checkCollisions(this.robot);
        if (hit) {
          if (this.robot.shield) {
            this.robot.shield = false;
            this.robot.invincible = 1.2;
            this.activePower = null;
            this.audio.playPowerUp();
            // Destroy spark on shield absorb
            for (let i = 0; i < 15; i++) {
              this.particles.push(
                new Particle(this.robot.x + 20, this.robot.y + 20, {
                  vx: rand(-150, 150),
                  vy: rand(-150, 50),
                  life: 0.4,
                  size: 3,
                  color: "#00e5ff",
                  shape: "spark",
                })
              );
            }
            hit.alive = false;
          } else {
            this.coinCombo = 0;
            this.gameOver();
          }
        }
      }

      // Milestones
      const ms = Math.floor(this.score / 500) * 500;
      if (ms >= 500 && ms > this.lastMilestone) {
        this.lastMilestone = ms;
        this.ui.showMilestone(`${ms} Points!`);
        this.audio.playMilestone();
      }

      // Particles
      for (const p of this.particles) p.update(dt);
      this.particles = this.particles.filter((p) => p.alive);
      if (this.shake > 0) this.shake -= dt;

      // HUD
      let powerLabel = null;
      if (this.activePower) {
        if (this.activePower.id === "shield") {
          powerLabel = "🛡 Shield";
        } else {
          powerLabel = `${this.activePower.label} ${this.powerTimer.toFixed(1)}s`;
        }
      }

      this.ui.updateHud({
        score: this.score,
        coins: this.coinsCollected,
        distance: this.distance,
        speedMul: this.speed / BASE_SPEED,
        envName: env.name,
        powerupLabel: powerLabel,
        showWarning: this.obstacles.warnings.length > 0,
      });
    }

    draw() {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Letterbox fill
      ctx.fillStyle = "#0d1b2a";
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      // Scale to logical resolution
      ctx.setTransform(
        this.scale * this.dpr,
        0,
        0,
        this.scale * this.dpr,
        this.offsetX * this.dpr,
        this.offsetY * this.dpr
      );

      // Screen shake
      if (this.shake > 0) {
        const mag = this.shake * 14;
        ctx.translate(rand(-mag, mag), rand(-mag, mag));
      }

      this.background.draw(ctx);

      // Soft vignette for slow-mo
      if (this.slowMo && this.state === "playing") {
        ctx.fillStyle = "rgba(56,189,248,0.08)";
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
      }

      for (const c of this.coins) c.draw(ctx);
      for (const p of this.powerups) p.draw(ctx);
      this.obstacles.draw(ctx);
      this.robot.draw(ctx);
      for (const p of this.particles) p.draw(ctx);

      // Menu idle robot preview
      if (this.state === "menu") {
        // Already drawing background; robot sits idle
        this.robot.state = "run";
        this.robot.legPhase += 0.15;
        this.robot.draw(ctx);
      }

      ctx.restore();
    }

    _loop(now) {
      const dt = clamp((now - this.lastTime) / 1000, 0, 0.05);
      this.lastTime = now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame((t) => this._loop(t));
    }
  }

  // Boot
  window.addEventListener("DOMContentLoaded", () => {
    window.game = new Game();
  });
})();
