// The game's rules and state, with no drawing and no browser in it: the moth, the
// light orbs, the bats, the moonflowers, the dawn timer, particles and floating text.
// step() advances one fixed step and returns what happened as bit flags, so the caller
// can play sounds and announce without the world knowing about screens or audio.
import {
  BAT, BLOOM_SCORE, FIELD_HEIGHT, FIELD_WIDTH, FLOWER_COUNT,
  FLOWER_SPOTS, GLOW_MAX, MOTH, NIGHTS, NIGHT_SECONDS, ORB, ORB_GLOW, ORB_SCORE,
  PARTICLES, SCARE_SCORE, SPIDER, START_LIVES,
} from './config.js';
import { applyBlessings, baseModifiers, blessingById, offerBlessings } from './blessings.js';

export const EVENT_ORB = 1;
export const EVENT_BLOOM = 2;
export const EVENT_HIT = 4;
export const EVENT_SCARE = 8;
export const EVENT_WIN = 16;
export const EVENT_OVER = 32;
export const EVENT_DASH = 64;
export const EVENT_WEB = 128;
export const EVENT_TEAR = 256;
export const EVENT_SHIELD = 512;
export const EVENT_BUMP = 1024;
export const EVENT_STUCK = 2048;
export const EVENT_SURGE = 4096;
export const EVENT_SPIDER_SCARE = 8192;

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
    // Drifting light-spores: slow golden motes that make the garden air
    // feel alive even when nothing is being chased.
    motes: [],
    stars: [],
    // The night-start banner: "Night 3 — webs thicken", shown ~3 s so the
    // campaign's shape is legible inside play, not only on the title map.
    nightBanner: { text: '', t: 0 },
    // The night-1 tutorial hint: one line at a time, under the HUD, each
    // shown once per run. `shown` remembers which hints fired, so a hint
    // never repeats inside a run.
    hint: { text: '', t: 0, shown: {} },
    // A shooting star crossing the sky, or null when the sky is quiet.
    shooting: null,
    shake: 0,
    flash: 0,
    flashColor: '#ff5566',
    over: false,
    won: false,
    cause: null,
    stats: { orbs: 0, blooms: 0, scares: 0, dashes: 0, websTorn: 0 },
    // The campaign: blessings owned this run and their folded modifiers, the
    // run's accumulated totals, and the draft on offer (null outside a draft).
    blessings: [],
    modifiers: baseModifiers(),
    campaign: { orbs: 0, blooms: 0, scares: 0, dashes: 0 },
    draft: null,
    nightSeconds: NIGHT_SECONDS,
    maxLives: START_LIVES,
    shield: false,
    spiders: [],
    webs: [],
    spiderPlan: [],
    surgeDone: false,
    webbed: false,
    webbedTime: 0,
    orbTimer: 0,
    batTimer: 0,
  };

  function decorate() {
    state.stars = [];
    for (let i = 0; i < 170; i += 1) {
      state.stars.push({ x: random.range(0, FIELD_WIDTH), y: random.range(0, 420), r: random.range(0.6, 2.0), tw: random.range(0, Math.PI * 2) });
    }
    state.fireflies = [];
    for (let i = 0; i < 72; i += 1) {
      state.fireflies.push({ x: random.range(0, FIELD_WIDTH), y: random.range(120, FIELD_HEIGHT - 60), phase: random.range(0, Math.PI * 2), speed: random.range(8, 26), dir: random.angle() });
    }
    state.motes = [];
    for (let i = 0; i < 26; i += 1) {
      state.motes.push({ x: random.range(0, FIELD_WIDTH), y: random.range(80, FIELD_HEIGHT - 80), r: random.range(1.2, 2.6), phase: random.range(0, Math.PI * 2), drift: random.range(4, 12), rise: random.range(2, 7) });
    }
  }

  function reset(night) {
    // Blessings carry across nights inside a run: fold them first, then let
    // the night's numbers (lives, dawn, night length) come from the modifiers.
    applyBlessings(state);
    state.night = night;
    state.score = 0;
    state.combo = 0;
    state.comboTimer = 0;
    state.lives = state.modifiers.maxLives;
    state.maxLives = state.modifiers.maxLives;
    state.glow = 0;
    state.nightSeconds = state.modifiers.nightSeconds;
    state.dawn = state.modifiers.nightSeconds;
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
    state.stats = { orbs: 0, blooms: 0, scares: 0, dashes: 0, websTorn: 0 };
    state.draft = null;
    state.shield = state.modifiers.shield;
    state.spiders = [];
    state.webs = [];
    state.surgeDone = false;
    state.webbed = false;
    state.webbedTime = 0;
    state.orbTimer = 0.4;
    state.batTimer = 2.0;
    state.nightBanner = { text: `Night ${night} — ${NIGHTS[night].name}`, t: 3 };
    state.shooting = null;
    // Night 1 teaches as it goes: the opening hint, then one line per first
    // (first orb, first bat, first web). A fresh run re-teaches; later
    // nights in the same run keep `shown`, so no hint ever repeats.
    if (night === 1) {
      state.hint = { text: 'Follow the glow — gather light orbs', t: 5, shown: {} };
    } else {
      state.hint.text = '';
      state.hint.t = 0;
    }
    // Spider entries for this night: the first descends 8 s in; later ones
    // (nights 5+) at dawn 60 s and dawn 40 s, alternating corners.
    const plan = NIGHTS[night];
    state.spiderPlan = [];
    if (plan.spiders >= 1) state.spiderPlan.push({ at: SPIDER.entryDelay, corner: 'left' });
    if (plan.spiders >= 2) state.spiderPlan.push({ at: state.nightSeconds - 60, corner: 'right' });
    if (plan.spiders >= 3) state.spiderPlan.push({ at: state.nightSeconds - 40, corner: 'left' });
    decorate();
  }

  /** Keep the score and start the next, harder night. */
  function nextNight() {
    const kept = state.score;
    reset(state.night + 1);
    state.score = kept;
  }

  /** Start a fresh run: blessings are lost, the campaign totals reset. */
  function newRun() {
    state.blessings = [];
    state.campaign = { orbs: 0, blooms: 0, scares: 0, dashes: 0 };
    reset(1);
  }

  /** Grant a blessing outside the draft (staging and tests only). */
  function grantBlessing(id) {
    if (!blessingById(id) || state.blessings.includes(id)) return false;
    state.blessings.push(id);
    applyBlessings(state);
    return true;
  }

  /** Open the between-night draft: three blessings the run does not own. */
  function offerDraft() {
    const offer = offerBlessings(random, state.blessings);
    state.draft = { offer: offer.map((blessing) => blessing.id), highlight: 0, picked: null };
    return state.draft;
  }

  /**
   * Pick the offered blessing at `index`. Applies it at once (Thick Silk also
   * heals 1 life on the spot) and returns the blessing, or null if the draft
   * is already picked or the index is out of range.
   */
  function pickDraft(index) {
    if (!state.draft || state.draft.picked !== null) return null;
    if (index < 0 || index >= state.draft.offer.length) return null;
    const id = state.draft.offer[index];
    state.draft.picked = id;
    state.blessings.push(id);
    applyBlessings(state);
    if (id === 'thick-silk') {
      state.maxLives = state.modifiers.maxLives;
      state.lives = Math.min(state.modifiers.maxLives, state.lives + 1);
    }
    return blessingById(id);
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
    // Simultaneous texts take different lanes (28 px apart, stepping down),
    // and no text is ever born above y=220: even after rising ~37 px in its
    // 1.1 s life it stays below the moon's disc (bottom edge y=172).
    const lane = state.texts.length % 3;
    state.texts.push({ x, y: Math.max(y, 220) + lane * 28, text, life: 1.1, max: 1.1, color, size: size ?? 22 });
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
    return Math.min(1, state.elapsed / state.nightSeconds);
  }

  function stepMoth(dt, control, demo) {
    const moth = state.moth;
    let webbedEvent = 0;

    // Tear every web the moth is touching. Without Webcutter this only fires
    // when the dash starts inside a web; with Webcutter any touch counts.
    function tearWebsTouched() {
      let torn = 0;
      for (let i = state.webs.length - 1; i >= 0; i -= 1) {
        const web = state.webs[i];
        if (dist(moth.x, moth.y, web.x, web.y) < web.r + MOTH.radius) {
          if (state.webbed || state.modifiers.webcutter) {
            state.webs.splice(i, 1);
            state.score += 15;
            state.stats.websTorn += 1;
            burst(web.x, web.y, PARTICLES.puff, '#ffe9a8', 110, 0.5, 4, 0);
            floatText(web.x, web.y - 20, 'TORN FREE +15', '#ffe9a8', 20);
            torn |= EVENT_TEAR;
          }
        }
      }
      return torn;
    }
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

    // Webs: a webbed moth is slow (the dash is always a full-speed escape),
    // and entering a web sticks once — the thwip plays on entry, not per frame.
    const wasWebbed = state.webbed;
    state.webbed = state.webs.some((web) => dist(moth.x, moth.y, web.x, web.y) < web.r);
    if (state.webbed) {
      state.webbedTime += dt;
      if (!wasWebbed) webbedEvent = EVENT_STUCK;
    } else {
      state.webbedTime = 0;
    }

    let dashEvent = 0;
    if (!demo && control.dash && moth.dashCooldown <= 0 && moth.dashTime <= 0) {
      const heading = Math.hypot(moth.vx, moth.vy) > 40
        ? Math.atan2(moth.vy, moth.vx)
        : moth.angle;
      moth.vx = Math.cos(heading) * MOTH.dashSpeed;
      moth.vy = Math.sin(heading) * MOTH.dashSpeed;
      moth.dashTime = MOTH.dashTime;
      moth.dashCooldown = state.modifiers.dashCooldown;
      state.stats.dashes += 1;
      state.campaign.dashes += 1;
      dashEvent = EVENT_DASH;
      dashEvent |= tearWebsTouched();
    }
    // With Webcutter, a dash tears any web it passes through, not just the
    // web the moth started in.
    if (!demo && moth.dashTime > 0 && state.modifiers.webcutter) {
      dashEvent |= tearWebsTouched();
    }
    if (moth.dashCooldown > 0) moth.dashCooldown -= dt;
    if (moth.dashTime > 0) moth.dashTime -= dt;

    moth.vx += steerX * MOTH.accel * dt;
    moth.vy += steerY * MOTH.accel * dt;
    const drag = Math.max(0, 1 - MOTH.drag * dt);
    moth.vx *= drag;
    moth.vy *= drag;
    const speed = Math.hypot(moth.vx, moth.vy);
    let cap = moth.dashTime > 0 ? MOTH.dashSpeed : state.modifiers.maxSpeed;
    if (state.webbed && moth.dashTime <= 0) cap *= SPIDER.webSlow;
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
    return dashEvent | webbedEvent;
  }

  function stepOrbs(dt, demo) {
    const moth = state.moth;
    state.orbTimer -= dt;
    if (state.orbTimer <= 0 && state.orbs.length < state.modifiers.orbMax) {
      spawnOrb();
      if (state.modifiers.orbPair && state.orbs.length < state.modifiers.orbMax) spawnOrb();
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
      // Lodestone Light: nearby orbs drift toward the moth before the
      // collection check, so they can be gathered through a web.
      if (state.modifiers.magnetRange > 0) {
        const d = dist(moth.x, moth.y, orb.x, orb.y);
        if (d < state.modifiers.magnetRange && d > 1) {
          const pull = state.modifiers.magnetSpeed * dt;
          orb.x += ((moth.x - orb.x) / d) * pull;
          orb.y += ((moth.y - orb.y) / d) * pull;
        }
      }
      if (dist(moth.x, moth.y, orb.x, orb.y) < MOTH.radius + ORB.radius + 4) {
        state.orbs.splice(i, 1);
        state.combo = state.comboTimer > 0 ? state.combo + 1 : 1;
        state.comboTimer = state.modifiers.comboWindow;
        const gained = ORB_SCORE * Math.min(state.combo, 5);
        state.score += gained;
        state.glow = Math.min(GLOW_MAX, state.glow + state.modifiers.orbGlow);
        state.stats.orbs += 1;
        state.campaign.orbs += 1;
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
        state.campaign.blooms += 1;
        burst(flower.x, flower.y - 10, PARTICLES.petals, '#ffb7e8', 120, 1.1, 4, 60);
        burst(flower.x, flower.y - 10, PARTICLES.sparkle, '#ffe9a8', 160, 0.8, 3, 0);
        state.flash = 0.35;
        state.flashColor = '#ffd76a';
        // The bloom callout floats below the flower, never up by the moon.
        floatText(flower.x, flower.y + 56, `BLOOMED! +${BLOOM_SCORE}`, '#ffd76a', 26);
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
      const table = NIGHTS[state.night];
      state.batTimer -= dt;
      const want = Math.round(lerp(table.batStart, table.batEnd, p));
      if (state.batTimer <= 0 && state.bats.length < want) {
        spawnBat(lerp(BAT.speedStart, BAT.speedEnd, p) * table.batSpeed * state.modifiers.batSpeed);
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
          state.campaign.scares += 1;
          burst(bat.x, bat.y, PARTICLES.puff, '#c9b8ff', 110, 0.5, 4, 0);
          floatText(bat.x, bat.y - 22, `SCARED! +${SCARE_SCORE}`, '#c9b8ff', 20);
          events |= EVENT_SCARE;
        } else if (moth.invuln <= 0) {
          if (state.shield) {
            // Second Skin: the first bat hit each night breaks the shield
            // instead of costing a life — no knockback, just a gold flash.
            state.shield = false;
            moth.invuln = 1;
            state.flash = 0.3;
            state.flashColor = '#ffd76a';
            burst(moth.x, moth.y, PARTICLES.sparkle, '#ffd76a', 120, 0.5, 3, 0);
            floatText(moth.x, moth.y - 24, 'SHIELD!', '#ffd76a', 20);
            events |= EVENT_SHIELD;
          } else {
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
    }
    return events;
  }

  function stepSpiders(dt) {
    const moth = state.moth;
    const table = NIGHTS[state.night];
    let events = 0;
    // Entries from the night's plan: a spider descends from a top corner on
    // a silk thread, 8 s into the night (later ones at dawn 60 s / 40 s).
    while (state.spiderPlan.length > 0 && state.elapsed >= state.spiderPlan[0].at) {
      const entry = state.spiderPlan.shift();
      state.spiders.push({
        x: entry.corner === 'left' ? 60 : FIELD_WIDTH - 60,
        y: -20,
        mode: 'entering',
        target: -1,
        legPhase: 0,
        layTimer: 0,
        layCooldown: 0,
        drivenTimer: 0,
        bumpCooldown: 0,
        corner: entry.corner,
        sway: random.range(0, Math.PI * 2),
        descend: 0,
      });
    }
    for (const spider of state.spiders) {
      spider.legPhase += dt * (spider.mode === 'laying' ? 12 : 6);
      if (spider.bumpCooldown > 0) spider.bumpCooldown -= dt;
      if (spider.layCooldown > 0) spider.layCooldown -= dt;
      if (spider.mode === 'entering') {
        spider.descend += dt;
        spider.y = -20 + 130 * Math.min(1, spider.descend / SPIDER.descendTime);
        if (spider.descend >= SPIDER.descendTime) {
          spider.mode = 'crawling';
          spider.target = -1;
        }
        continue;
      }
      if (spider.mode === 'driven') {
        spider.drivenTimer -= dt;
        // Climbs away fast enough to leave the field from anywhere in the
        // garden (260 px/s clears the full height in under 3 s), so the
        // spider is visibly gone for the whole 8 s it is driven off.
        spider.y -= 260 * dt;
        if (spider.drivenTimer <= 0) {
          // Back in at the other corner, on a fresh thread.
          spider.corner = spider.corner === 'left' ? 'right' : 'left';
          spider.x = spider.corner === 'left' ? 60 : FIELD_WIDTH - 60;
          spider.y = -20;
          spider.descend = 0;
          spider.mode = 'entering';
        }
        continue;
      }
      if (spider.mode === 'laying') {
        spider.layTimer -= dt;
        if (spider.layTimer <= 0) {
          const flower = state.flowers[spider.target];
          if (flower && !flower.bloomed && state.webs.length < table.maxWebs) {
            state.webs.push({ x: flower.x, y: flower.y, r: SPIDER.webRadius, life: SPIDER.webLife, flowerIndex: spider.target });
            events |= EVENT_WEB;
          }
          // The night's web cadence: this spider will not lay again until
          // the table's interval has passed, even if it reaches another
          // flower sooner — it patrols instead.
          spider.layCooldown = table.webEvery;
          spider.mode = 'crawling';
          spider.target = -1;
        }
        continue;
      }
      // Crawling: toward the nearest unbloomed flower with no web on it, with
      // a slight sine sway so the path reads as crawling, not sliding.
      if (spider.target < 0 || state.flowers[spider.target].bloomed
        || state.webs.some((web) => web.flowerIndex === spider.target)) {
        let best = -1;
        let bestD = Infinity;
        state.flowers.forEach((flower, index) => {
          if (flower.bloomed) return;
          if (state.webs.some((web) => web.flowerIndex === index)) return;
          const d = dist(spider.x, spider.y, flower.x, flower.y);
          if (d < bestD) { bestD = d; best = index; }
        });
        spider.target = best;
      }
      let tx = FIELD_WIDTH / 2;
      let ty = 400;
      if (spider.target >= 0) {
        tx = state.flowers[spider.target].x;
        ty = state.flowers[spider.target].y;
      }
      const dx = tx - spider.x;
      const dy = ty - spider.y;
      const d = Math.hypot(dx, dy);
      if (spider.target >= 0 && d < SPIDER.arriveDist) {
        if (spider.layCooldown <= 0) {
          spider.mode = 'laying';
          spider.layTimer = SPIDER.layTime;
        } else {
          // The web cadence has not passed yet: patrol on to another flower.
          spider.target = -1;
        }
        continue;
      }
      if (d > 1) {
        spider.sway += dt * 2;
        const px = -dy / d;
        const py = dx / d;
        const wobble = Math.sin(spider.sway) * SPIDER.sway;
        spider.x += ((dx / d) * SPIDER.crawlSpeed + px * wobble) * dt;
        spider.y += ((dy / d) * SPIDER.crawlSpeed + py * wobble) * dt;
      }
      // Contact: dashing into the spider drives it off (+25, like a scare);
      // a bump costs no life — knockback + combo reset only.
      const md = dist(moth.x, moth.y, spider.x, spider.y);
      if (moth.dashTime > 0 && md < MOTH.radius + 18) {
        spider.mode = 'driven';
        spider.drivenTimer = SPIDER.drivenOff;
        state.score += SCARE_SCORE;
        state.stats.scares += 1;
        state.campaign.scares += 1;
        burst(spider.x, spider.y, PARTICLES.puff, '#c9b8ff', 110, 0.5, 4, 0);
        floatText(spider.x, spider.y - 22, `SCARED! +${SCARE_SCORE}`, '#c9b8ff', 20);
        events |= EVENT_SPIDER_SCARE;
      } else if (md < MOTH.radius + SPIDER.radius - 2 && spider.bumpCooldown <= 0 && moth.invuln <= 0) {
        spider.bumpCooldown = 1;
        const away = Math.atan2(moth.y - spider.y, moth.x - spider.x);
        moth.vx = Math.cos(away) * SPIDER.knockback;
        moth.vy = Math.sin(away) * SPIDER.knockback;
        state.combo = 0;
        state.comboTimer = 0;
        state.flash = 0.25;
        state.flashColor = '#d8d8ff';
        events |= EVENT_BUMP;
      }
    }
    return events;
  }

  function stepWebs(dt) {
    for (let i = state.webs.length - 1; i >= 0; i -= 1) {
      const web = state.webs[i];
      web.life -= dt;
      // A rotting web fades and shrinks in its last 2 s, so the player can
      // read that it is about to go.
      if (web.life < 2) web.r = 40 + (Math.max(0, web.life) / 2) * 15;
      if (web.life <= 0) state.webs.splice(i, 1);
    }
    return 0;
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
    for (const mote of state.motes) {
      mote.phase += dt;
      mote.x += Math.sin(mote.phase * 0.7) * mote.drift * dt;
      mote.y -= mote.rise * dt;
      if (mote.y < 60) mote.y = FIELD_HEIGHT - 40;
      if (mote.x < 0) mote.x = FIELD_WIDTH;
      if (mote.x > FIELD_WIDTH) mote.x = 0;
    }
    if (state.nightBanner.t > 0) state.nightBanner.t -= dt;
    if (state.hint.t > 0) state.hint.t -= dt;
    // Shooting stars: about one every 25 seconds, a quick diagonal streak
    // across the upper sky. They are decoration only — no gameplay effect.
    if (!state.shooting && random.next() < dt * 0.04) {
      state.shooting = {
        x: random.range(300, 1250),
        y: random.range(40, 200),
        vx: -(260 + random.range(0, 140)),
        vy: 130,
        t: 0,
        max: 1.1,
      };
    }
    if (state.shooting) {
      state.shooting.x += state.shooting.vx * dt;
      state.shooting.y += state.shooting.vy * dt;
      state.shooting.t += dt;
      if (state.shooting.t > state.shooting.max || state.shooting.x < -60) state.shooting = null;
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
    if (!demo) {
      events |= stepSpiders(dt);
      events |= stepWebs(dt);
      // Mid-night surge: from night 2, at 45 s elapsed, two extra bats arrive
      // at the screen edges with a banner. It reuses spawnBat — no new entity.
      const table = NIGHTS[state.night];
      if (table.surge && !state.surgeDone && state.elapsed >= 45) {
        state.surgeDone = true;
        const speed = lerp(BAT.speedStart, BAT.speedEnd, progress())
          * table.batSpeed * state.modifiers.batSpeed;
        spawnBat(speed);
        spawnBat(speed);
        floatText(FIELD_WIDTH / 2, 300, 'THE BATS STIR', '#c9b8ff', 30);
        events |= EVENT_SURGE;
      }
    }
    stepFx(dt);
    // Tutorial hints, each once per run: the first orb teaches the ring,
    // the first bat teaches the dash, the first web teaches the tear.
    if (!demo) {
      if (state.night === 1 && !state.hint.shown.orb && state.stats.orbs >= 1) {
        state.hint.shown.orb = true;
        setHint('4 orbs fill the ring — then touch a flower');
      }
      if (state.night === 1 && !state.hint.shown.bat && state.bats.length >= 1) {
        state.hint.shown.bat = true;
        setHint('A bat costs a life — dash through it to scare it away');
      }
      if (!state.hint.shown.web && state.webbed) {
        state.hint.shown.web = true;
        setHint('Webbed! Dash to tear free');
      }
    }
    // The play-field callouts (bloom, scare, tear) belong to the night, not
    // to the screens that follow it: once the run ends, clear them, or they
    // show through the results panel and stack on each other.
    if (state.won || state.over) state.texts = [];
    return events;
  }

  // Show one tutorial hint line for ~5 seconds.
  function setHint(text) {
    state.hint.text = text;
    state.hint.t = 5;
  }

  reset(1);
  return { state, reset, nextNight, newRun, grantBlessing, offerDraft, pickDraft, step, tick: stepFx };
}
