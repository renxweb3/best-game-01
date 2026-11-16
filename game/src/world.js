// The game's rules and state, with no drawing and no browser in it: the moth, the
// light orbs, the bats, the moonflowers, the dawn timer, particles and floating text.
// step() advances one fixed step and returns what happened as bit flags, so the caller
// can play sounds and announce without the world knowing about screens or audio.
import {
  BAT, BLOOM_SCORE, COMBO_WINDOW, FIELD_HEIGHT, FIELD_WIDTH, FLOWER_COUNT,
  FLOWER_SPOTS, GLOW_MAX, MOTH, NIGHT_SECONDS, ORB, ORB_GLOW, ORB_SCORE,
  PARTICLES, SCARE_SCORE, START_LIVES,
} from './config.js';

export const EVENT_ORB = 1;
export const EVENT_BLOOM = 2;
export const EVENT_HIT = 4;
export const EVENT_SCARE = 8;
export const EVENT_WIN = 16;
export const EVENT_OVER = 32;
export const EVENT_DASH = 64;

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function createWorld(random) {
  const state = {
    night: 1,
    score: 0,
    combo: 0,
    comboTimer: 0,
    lives: START_LIVES,
    glow: 0,
    dawn: NIGHT_SECONDS,
    elapsed: 0,
    moth: { x: 0, y: 0, vx: 0, vy: 0, angle: -Math.PI / 2, flap: 0, dashTime: 0, dashCooldown: 0, invuln: 0, trailTimer: 0 },
    orbs: [],
    bats: [],
    flowers: [],
    particles: [],
    texts: [],
    fireflies: [],
    stars: [],
    shake: 0,
    flash: 0,
    flashColor: '#ff5566',
    over: false,
    won: false,
    cause: null,
    stats: { orbs: 0, blooms: 0, scares: 0, dashes: 0 },
    orbTimer: 0,
    batTimer: 0,
  };

  function decorate() {
    state.stars = [];
    for (let i = 0; i < 90; i += 1) {
      state.stars.push({ x: random.range(0, FIELD_WIDTH), y: random.range(0, 420), r: random.range(0.6, 2.0), tw: random.range(0, Math.PI * 2) });
    }
    state.fireflies = [];
    for (let i = 0; i < 26; i += 1) {
      state.fireflies.push({ x: random.range(0, FIELD_WIDTH), y: random.range(120, FIELD_HEIGHT - 60), phase: random.range(0, Math.PI * 2), speed: random.range(8, 26), dir: random.angle() });
    }
  }

  function reset(night) {
    state.night = night;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.lives = START_LIVES;
    state.glow = 0;
    state.dawn = NIGHT_SECONDS;
    state.elapsed = 0;
    state.moth.x = FIELD_WIDTH / 2;
    state.moth.y = FIELD_HEIGHT - 150;
    state.moth.vx = 0;
    state.moth.vy = 0;
    state.moth.angle = -Math.PI / 2;
    state.moth.flap = 0;
    state.moth.dashTime = 0;
    state.moth.dashCooldown = 0;
    state.moth.invuln = 0;
    state.moth.trailTimer = 0;
    state.orbs = [];
    state.bats = [];
    state.flowers = FLOWER_SPOTS.map((spot) => ({ x: spot.x, y: spot.y, bloomed: false, phase: random.range(0, Math.PI * 2) }));
    state.particles = [];
    state.texts = [];
    state.shake = 0;
    state.flash = 0;
    state.over = false;
    state.won = false;
    state.cause = null;
    state.stats = { orbs: 0, blooms: 0, scares: 0, dashes: 0 };
    state.orbTimer = 0.4;
    state.batTimer = 2.0;
    decorate();
  }

  /** Keep the score and start the next, harder night. */
  function nextNight() {
    const kept = state.score;
    reset(state.night + 1);
    state.score = kept;
  }

  function burst(x, y, count, color, speed, life, size, gravity) {
    for (let i = 0; i < count; i += 1) {
      const angle = random.angle();
      const power = speed * (0.3 + random.next() * 0.7);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * power,
        vy: Math.sin(angle) * power - speed * 0.25,
        life: life * (0.6 + random.next() * 0.4),
        max: life,
        size: size * (0.6 + random.next() * 0.8),
        color,
        gravity: gravity ?? 0,
      });
    }
  }

  function floatText(x, y, text, color, size) {
    state.texts.push({ x, y, text, life: 1.1, max: 1.1, color, size: size ?? 22 });
  }

  function spawnOrb() {
    const margin = 60;
    state.orbs.push({
      x: random.range(margin, FIELD_WIDTH - margin),
      y: random.range(110, FIELD_HEIGHT - 110),
      phase: random.range(0, Math.PI * 2),
      life: ORB.life,
    });
  }

  function spawnBat(speed) {
    const side = random.int(0, 3);
    let x = 0;
    let y = 0;
    if (side === 0) { x = -30; y = random.range(80, FIELD_HEIGHT - 80); }
    else if (side === 1) { x = FIELD_WIDTH + 30; y = random.range(80, FIELD_HEIGHT - 80); }
    else if (side === 2) { x = random.range(0, FIELD_WIDTH); y = -30; }
    else { x = random.range(0, FIELD_WIDTH); y = FIELD_HEIGHT + 30; }
    state.bats.push({
      x, y,
      vx: 0, vy: 0,
      speed,
      wobble: random.range(0, Math.PI * 2),
      phase: random.range(0, Math.PI * 2),
      fleeing: false,
      fade: 1,
    });
  }

  function progress() {
    return Math.min(1, state.elapsed / NIGHT_SECONDS);
  }

  function stepMoth(dt, control, demo) {
    const moth = state.moth;
    let steerX = 0;
    let steerY = 0;
    if (!demo) {
      if (control.keys) {
        steerX = control.keys.x;
        steerY = control.keys.y;
      } else if (control.pointer && control.pointer.seen) {
        const dx = control.pointer.x - moth.x;
        const dy = control.pointer.y - moth.y;
        const d = Math.hypot(dx, dy);
        if (d > 26) {
          const pull = Math.min(1, d / 220);
          steerX = (dx / d) * pull;
          steerY = (dy / d) * pull;
        }
      }
    } else {
      // Title backdrop: drift lazily toward the nearest orb, never dashing.
      let nearest = null;
      let nearestD = Infinity;
      for (const orb of state.orbs) {
        const d = dist(moth.x, moth.y, orb.x, orb.y);
        if (d < nearestD) { nearestD = d; nearest = orb; }
      }
      if (nearest) {
        steerX = (nearest.x - moth.x) / Math.max(1, nearestD);
        steerY = (nearest.y - moth.y) / Math.max(1, nearestD);
      }
    }

    let dashEvent = 0;
    if (!demo && control.dash && moth.dashCooldown <= 0 && moth.dashTime <= 0) {
      const heading = Math.hypot(moth.vx, moth.vy) > 40
        ? Math.atan2(moth.vy, moth.vx)
        : moth.angle;
      moth.vx = Math.cos(heading) * MOTH.dashSpeed;
      moth.vy = Math.sin(heading) * MOTH.dashSpeed;
      moth.dashTime = MOTH.dashTime;
      moth.dashCooldown = MOTH.dashCooldown;
      state.stats.dashes += 1;
      dashEvent = EVENT_DASH;
    }
    if (moth.dashCooldown > 0) moth.dashCooldown -= dt;
    if (moth.dashTime > 0) moth.dashTime -= dt;

    moth.vx += steerX * MOTH.accel * dt;
    moth.vy += steerY * MOTH.accel * dt;
    const drag = Math.max(0, 1 - MOTH.drag * dt);
    moth.vx *= drag;
    moth.vy *= drag;
    const speed = Math.hypot(moth.vx, moth.vy);
    const cap = moth.dashTime > 0 ? MOTH.dashSpeed : MOTH.maxSpeed;
    if (speed > cap) {
      moth.vx = (moth.vx / speed) * cap;
      moth.vy = (moth.vy / speed) * cap;
    }
    moth.x += moth.vx * dt;
    moth.y += moth.vy * dt;
    if (moth.x < MOTH.radius) { moth.x = MOTH.radius; moth.vx = Math.max(0, moth.vx); }
    if (moth.x > FIELD_WIDTH - MOTH.radius) { moth.x = FIELD_WIDTH - MOTH.radius; moth.vx = Math.min(0, moth.vx); }
    if (moth.y < 70 + MOTH.radius) { moth.y = 70 + MOTH.radius; moth.vy = Math.max(0, moth.vy); }
    if (moth.y > FIELD_HEIGHT - MOTH.radius) { moth.y = FIELD_HEIGHT - MOTH.radius; moth.vy = Math.min(0, moth.vy); }
    if (speed > 30) {
      const target = Math.atan2(moth.vy, moth.vx);
      let diff = target - moth.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      moth.angle += diff * Math.min(1, dt * 10);
    }
    moth.flap += dt * MOTH.flapRate * (0.7 + speed / MOTH.maxSpeed);
    if (moth.invuln > 0) moth.invuln = Math.max(0, moth.invuln - dt);
    moth.trailTimer -= dt;
    if (moth.trailTimer <= 0 && speed > 60) {
      moth.trailTimer = MOTH.trailEvery;
      state.particles.push({
        x: moth.x, y: moth.y,
        vx: -moth.vx * 0.08, vy: -moth.vy * 0.08,
        life: 0.5, max: 0.5, size: 5, color: '#ffe9a8', gravity: 0,
      });
    }
    return dashEvent;
  }

  function stepOrbs(dt, demo) {
    const moth = state.moth;
    state.orbTimer -= dt;
    if (state.orbTimer <= 0 && state.orbs.length < ORB.maxOnField) {
      spawnOrb();
      state.orbTimer = ORB.spawnEvery;
    }
    let events = 0;
    for (let i = state.orbs.length - 1; i >= 0; i -= 1) {
      const orb = state.orbs[i];
      orb.life -= dt;
      orb.phase += dt * 2;
      orb.y += Math.sin(orb.phase) * ORB.drift * dt;
      if (orb.life <= 0) {
        state.orbs.splice(i, 1);
        continue;
      }
      if (demo) continue;
      if (dist(moth.x, moth.y, orb.x, orb.y) < MOTH.radius + ORB.radius + 4) {
        state.orbs.splice(i, 1);
        state.combo = state.comboTimer > 0 ? state.combo + 1 : 1;
        state.comboTimer = COMBO_WINDOW;
        const gained = ORB_SCORE * Math.min(state.combo, 5);
        state.score += gained;
        state.glow = Math.min(GLOW_MAX, state.glow + ORB_GLOW);
        state.stats.orbs += 1;
        burst(orb.x, orb.y, PARTICLES.sparkle, '#ffe9a8', 130, 0.6, 3.5, 0);
        floatText(orb.x, orb.y - 18, state.combo > 1 ? `+${gained} x${Math.min(state.combo, 5)}` : `+${gained}`, '#ffe9a8', 20);
        events |= EVENT_ORB;
      }
    }
    return events;
  }

  function stepFlowers() {
    const moth = state.moth;
    let events = 0;
    for (const flower of state.flowers) {
      if (flower.bloomed) continue;
      if (state.glow >= GLOW_MAX - 1e-6 && dist(moth.x, moth.y, flower.x, flower.y) < MOTH.radius + 26) {
        flower.bloomed = true;
        state.glow = 0;
        state.score += BLOOM_SCORE;
        state.stats.blooms += 1;
        burst(flower.x, flower.y - 10, PARTICLES.petals, '#ffb7e8', 120, 1.1, 4, 60);
        burst(flower.x, flower.y - 10, PARTICLES.sparkle, '#ffe9a8', 160, 0.8, 3, 0);
        state.flash = 0.35;
        state.flashColor = '#ffd76a';
        floatText(flower.x, flower.y - 44, `BLOOMED! +${BLOOM_SCORE}`, '#ffd76a', 26);
        events |= EVENT_BLOOM;
      }
    }
    if (state.flowers.every((flower) => flower.bloomed)) {
      state.won = true;
      events |= EVENT_WIN;
    }
    return events;
  }

  function stepBats(dt, demo) {
    const moth = state.moth;
    if (!demo) {
      const p = progress();
      state.batTimer -= dt;
      const want = Math.round(lerp(BAT.maxStart, BAT.maxEnd, p));
      if (state.batTimer <= 0 && state.bats.length < want) {
        spawnBat(lerp(BAT.speedStart, BAT.speedEnd, p) * (1 + 0.12 * (state.night - 1)));
        state.batTimer = lerp(BAT.spawnEveryStart, BAT.spawnEveryEnd, p);
      }
    }
    let events = 0;
    for (let i = state.bats.length - 1; i >= 0; i -= 1) {
      const bat = state.bats[i];
      bat.wobble += dt * BAT.wobble;
      if (bat.fleeing) {
        const away = Math.atan2(bat.y - moth.y, bat.x - moth.x);
        bat.x += Math.cos(away) * BAT.fleeSpeed * dt;
        bat.y += Math.sin(away) * BAT.fleeSpeed * dt;
        bat.fade -= dt * 1.6;
        if (bat.fade <= 0 || bat.x < -60 || bat.x > FIELD_WIDTH + 60 || bat.y < -60 || bat.y > FIELD_HEIGHT + 60) {
          state.bats.splice(i, 1);
        }
        continue;
      }
      const toMoth = Math.atan2(moth.y - bat.y, moth.x - bat.x);
      const wobble = Math.sin(bat.wobble) * 0.6;
      bat.vx = Math.cos(toMoth + wobble) * bat.speed;
      bat.vy = Math.sin(toMoth + wobble) * bat.speed;
      bat.x += bat.vx * dt;
      bat.y += bat.vy * dt;
      if (bat.x < -80 || bat.x > FIELD_WIDTH + 80 || bat.y < -80 || bat.y > FIELD_HEIGHT + 80) {
        state.bats.splice(i, 1);
        continue;
      }
      if (demo) continue;
      const d = dist(moth.x, moth.y, bat.x, bat.y);
      if (d < MOTH.radius + BAT.radius - 4) {
        if (moth.dashTime > 0) {
          bat.fleeing = true;
          state.score += SCARE_SCORE;
          state.stats.scares += 1;
          burst(bat.x, bat.y, PARTICLES.puff, '#c9b8ff', 110, 0.5, 4, 0);
          floatText(bat.x, bat.y - 22, `SCARED! +${SCARE_SCORE}`, '#c9b8ff', 20);
          events |= EVENT_SCARE;
        } else if (moth.invuln <= 0) {
          state.lives -= 1;
          moth.invuln = 2;
          state.shake = 16;
          state.flash = 0.4;
          state.flashColor = '#ff5566';
          const away = Math.atan2(moth.y - bat.y, moth.x - bat.x);
          moth.vx = Math.cos(away) * 380;
          moth.vy = Math.sin(away) * 380;
          state.combo = 0;
          state.comboTimer = 0;
          events |= EVENT_HIT;
          if (state.lives <= 0) {
            state.over = true;
            state.cause = 'lives';
            events |= EVENT_OVER;
          }
        }
      }
    }
    return events;
  }

  function stepFx(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.life -= dt;
      if (particle.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.texts.length - 1; i >= 0; i -= 1) {
      const text = state.texts[i];
      text.y -= 34 * dt;
      text.life -= dt;
      if (text.life <= 0) state.texts.splice(i, 1);
    }
    for (const fly of state.fireflies) {
      fly.phase += dt;
      fly.dir += (random.next() - 0.5) * dt * 1.4;
      fly.x += Math.cos(fly.dir) * fly.speed * dt;
      fly.y += Math.sin(fly.dir) * fly.speed * dt * 0.6;
      if (fly.x < 0) fly.x = FIELD_WIDTH;
      if (fly.x > FIELD_WIDTH) fly.x = 0;
      if (fly.y < 90) fly.y = 90;
      if (fly.y > FIELD_HEIGHT - 20) fly.y = FIELD_HEIGHT - 20;
    }
    state.shake = Math.max(0, state.shake - 42 * dt);
    state.flash = Math.max(0, state.flash - dt * 1.4);
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
  }

  /**
   * One fixed step. `control` is { keys: {x,y} | null, pointer: {x,y,seen}, dash: bool }.
   * With `demo` set (the title screen's backdrop) the moth wanders, orbs drift, nothing
   * scores and no bat ever spawns. Returns event flags for the caller.
   */
  function step(dt, control, demo) {
    if (state.over || state.won) return 0;
    let events = 0;
    state.elapsed += dt;
    if (!demo) {
      state.dawn -= dt;
      if (state.dawn <= 0) {
        state.dawn = 0;
        if (!state.flowers.every((flower) => flower.bloomed)) {
          state.over = true;
          state.cause = 'dawn';
          events |= EVENT_OVER;
        }
      }
    }
    events |= stepMoth(dt, control, demo);
    events |= stepOrbs(dt, demo);
    if (!demo) events |= stepFlowers();
    events |= stepBats(dt, demo);
    stepFx(dt);
    return events;
  }

  reset(1);
  return { state, reset, nextNight, step };
}
