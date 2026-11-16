/**
 * shots.js — deterministic staging for the four screenshots.
 *
 * Every shot is staged from a fixed seed, so the same build always produces
 * the same pictures. No randomness enters after the seed is set: the careful
 * autopilot, the careless one, and the blessing drafts all read from the
 * world's own seeded random stream.
 *
 * The four shots:
 *   start — the title, with the campaign map and the furthest night reached.
 *   play  — NIGHT 3, active gameplay: a spider and a web in frame, HUD
 *           blessing glyphs, the dawn bar counting down, a dash in flight.
 *   win   — the draft screen after a careful night-2 win: results strip,
 *           three blessing cards, the owned row, the next-night preview.
 *   end   — the game-over screen after a multi-night run: night 1 and 2 won
 *           carefully, night 3 lost carelessly, campaign summary visible.
 */
import { FIELD_HEIGHT, FIELD_WIDTH, SHOT_SECONDS, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_ORB, EVENT_OVER, EVENT_WIN,
} from './world.js';
import { SCREEN_DRAFT, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SAFE_DISTANCE = 110;
const DASH_DISTANCE = 60;
const SPIDER_SAFE_DISTANCE = 110;
const SPIDER_DASH_DISTANCE = 70;
const WEB_MARGIN = 70;
// The autopilot tears itself free if it has been stuck in a web too long.
const WEBBED_DASH_SECONDS = 3;

const SHOT_SEED = {
  play: 7, start: 1, win: 7, end: 3,
};

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearestOrb(state) {
  let best = null;
  let bestD = Infinity;
  for (const orb of state.orbs) {
    const d = dist(state.moth, orb);
    if (d < bestD) {
      bestD = d;
      best = orb;
    }
  }
  return best;
}

function nearestFlower(state) {
  let best = null;
  let bestD = Infinity;
  for (const flower of state.flowers) {
    if (flower.bloomed) continue;
    const d = dist(state.moth, flower);
    if (d < bestD) {
      bestD = d;
      best = flower;
    }
  }
  return best;
}

function nearestBat(state) {
  let best = null;
  let bestD = Infinity;
  for (const bat of state.bats) {
    if (bat.fleeing) continue;
    const d = dist(state.moth, bat);
    if (d < bestD) {
      bestD = d;
      best = bat;
    }
  }
  return { bat: best, distance: bestD };
}

function nearestSpider(state) {
  let best = null;
  let bestD = Infinity;
  for (const spider of state.spiders) {
    if (spider.y < 0) continue;
    const d = dist(state.moth, spider);
    if (d < bestD) {
      bestD = d;
      best = spider;
    }
  }
  return { spider: best, distance: bestD };
}

// True when the point sits inside a web disc (with a margin for the moth's
// wings). The autopilot routes around webbed targets instead of blundering
// into the silk.
function inWeb(state, x, y) {
  for (const web of state.webs) {
    if (Math.hypot(x - web.x, y - web.y) < web.r + WEB_MARGIN) return true;
  }
  return false;
}

// The best reachable target: the nearest orb or flower that is NOT inside a
// web, falling back to the nearest one at all when every target is webbed.
function reachableTarget(state, preferBloom) {
  const candidates = [];
  if (preferBloom) {
    for (const flower of state.flowers) {
      if (!flower.bloomed) candidates.push(flower);
    }
  } else {
    for (const orb of state.orbs) candidates.push(orb);
  }
  candidates.sort((a, b) => dist(state.moth, a) - dist(state.moth, b));
  for (const target of candidates) {
    if (!inWeb(state, target.x, target.y)) return target;
  }
  return candidates[0] ?? null;
}

// The careful autopilot: collects the nearest orb (or heads for a flower when
// the glow is full), steers away from bats and spiders, dashes through a bat
// when it is too close, dashes through a spider it is about to meet, and
// tears itself out of a web after three seconds. It routes around web discs
// instead of flying into them.
function autopilot(world, careful) {
  const state = world.state;
  const moth = state.moth;
  const target = state.glow >= 1 - 1e-6 ? reachableTarget(state, true) : reachableTarget(state, false);
  let tx = 640;
  let ty = 360;
  if (target) {
    tx = target.x;
    ty = target.y;
  }
  let dash = false;
  if (state.webbedTime > WEBBED_DASH_SECONDS && moth.dashCooldown <= 0) dash = true;
  if (careful) {
    const { bat, distance } = nearestBat(state);
    if (bat && distance < SAFE_DISTANCE) {
      // Veer away from the bat, and dash through it when it is nearly on us.
      // The walls are a second threat: near an edge, bend the dodge toward
      // the open garden, or the moth gets pinned against the glass and the
      // bats converge on it — the way a human player reads the field.
      let dx = moth.x - bat.x;
      let dy = moth.y - bat.y;
      const margin = 140;
      if (moth.x < margin) dx += (margin - moth.x) / margin * distance;
      if (moth.x > FIELD_WIDTH - margin) dx -= (moth.x - (FIELD_WIDTH - margin)) / margin * distance;
      if (moth.y < 70 + margin) dy += (70 + margin - moth.y) / margin * distance;
      if (moth.y > FIELD_HEIGHT - margin) dy -= (moth.y - (FIELD_HEIGHT - margin)) / margin * distance;
      const len = Math.hypot(dx, dy) || 1;
      tx = moth.x + (dx / len) * 300;
      ty = moth.y + (dy / len) * 300;
      if (distance < DASH_DISTANCE && moth.dashCooldown <= 0) dash = true;
    }
    const { spider, distance: spiderDistance } = nearestSpider(state);
    if (spider && spiderDistance < SPIDER_SAFE_DISTANCE) {
      const away = Math.atan2(moth.y - spider.y, moth.x - spider.x);
      tx = moth.x + Math.cos(away) * 300;
      ty = moth.y + Math.sin(away) * 300;
      if (spiderDistance < SPIDER_DASH_DISTANCE && moth.dashCooldown <= 0) dash = true;
    }
  }
  const dx = tx - moth.x;
  const dy = ty - moth.y;
  const d = Math.hypot(dx, dy);
  const keys = d > 4 ? { x: dx / d, y: dy / d } : null;
  return { keys, pointer: null, dash };
}

// Play one simulated second at a time until the run ends or the time budget
// runs out. Returns the events of the step that ended the run (or 0).
function playUntil(world, careful, seconds) {
  let events = 0;
  let remaining = seconds;
  while (remaining > 0) {
    events = world.step(STEP, autopilot(world, careful), false);
    remaining -= STEP;
    if (events & (EVENT_OVER | EVENT_WIN)) break;
  }
  return events;
}

export { autopilot, playUntil };

// Win the current night with the careful autopilot. If the autopilot cannot
// (an unlucky layout), stage the last flower honestly through the rules:
// bloom the first six, put the moth beside the last one with a full glow and
// a long invulnerability, and let the game finish the night itself. Used by
// the end scene, which needs two wins before its loss. Returns the events of
// the winning step (or 0).
function winNight(world) {
  let events = playUntil(world, true, SHOT_SECONDS.winLimit);
  if (!(events & EVENT_WIN)) {
    if (world.state.over) world.reset(world.state.night);
    let bloomed = 0;
    for (const flower of world.state.flowers) {
      if (bloomed < 6 && !flower.bloomed) {
        flower.bloomed = true;
        bloomed += 1;
      }
    }
    const last = world.state.flowers.find((flower) => !flower.bloomed);
    if (last) {
      world.state.moth.x = last.x + 40;
      world.state.moth.y = last.y + 40;
      world.state.glow = 1;
      world.state.moth.invuln = 999;
      events = playUntil(world, true, 5);
      world.state.moth.invuln = 0;
    }
  }
  return events;
}

/** Stage one screenshot scene and return { screen, best, campaign }. */
export function stageShot(name, world) {
  world.reset(1);
  if (name !== 'play' && name !== 'win' && name !== 'end') {
    const demo = createWorld(createRandom(SHOT_SEED.start));
    for (let i = 0; i < 30; i += 1) demo.step(STEP, { keys: null, pointer: null, dash: false }, true);
    // The demo moth is parked clear of the night map (y~590) so it never
    // sits on the map's nodes or its label: the title's garden is the
    // backdrop, and the map has to read at a glance.
    world.state.moth.x = 300;
    world.state.moth.y = 330;
    world.state.moth.angle = demo.state.moth.angle;
    world.state.orbs = demo.state.orbs.map((orb) => ({ ...orb }));
    world.state.bats = demo.state.bats.map((bat) => ({ ...bat }));
    return { screen: SCREEN_TITLE, best: 0, campaign: { bestNight: 2, runs: 3, victories: 0, totalBlooms: 41, totalOrbs: 312, lastRun: { night: 2, score: 4245, grade: 'S', won: true } } };
  }

  if (name === 'play') {
    // Night 3 with two blessings already owned, so the HUD glyph row shows;
    // Lodestone Light and Second Skin do not accelerate the bloom pace, so
    // the night does not end mid-staging.
    world.reset(3);
    world.grantBlessing('lodestone-light');
    world.grantBlessing('second-skin');
    let events = playUntil(world, true, SHOT_SECONDS.play);
    // Keep flying until a spider and a web are actually in the frame
    // (up to 20 more seconds), so the shot shows the new enemy.
    let extra = 0;
    while ((world.state.spiders.length === 0 || world.state.webs.length === 0) && extra < 20 && !(events & (EVENT_OVER | EVENT_WIN))) {
      events = world.step(STEP, autopilot(world, true), false);
      extra += STEP;
    }
    // The finale: wait for an orb, chase it, dash at once, let the trail show.
    if (!(events & (EVENT_OVER | EVENT_WIN))) {
      while (world.state.orbs.length === 0 && !(events & (EVENT_OVER | EVENT_WIN))) {
        events = world.step(STEP, autopilot(world, true), false);
      }
      for (let i = 0; i < 3 && !(events & (EVENT_OVER | EVENT_WIN)); i += 1) {
        events = world.step(STEP, autopilot(world, true), true);
      }
      if (!(events & (EVENT_OVER | EVENT_WIN))) {
        world.step(0.2, { keys: null, pointer: null, dash: false }, false);
      }
    }
    return {
      screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY,
      best: world.state.score,
      campaign: { bestNight: 3, runs: 1, victories: 0 },
    };
  }

  if (name === 'win') {
    // The draft scene: win night 2 carefully, then open the draft. One
    // blessing is already owned so the owned row is non-empty.
    world.reset(2);
    world.grantBlessing('moonlit-wings');
    let events = playUntil(world, true, SHOT_SECONDS.winLimit);
    if (!(events & EVENT_WIN)) {
      // The fallback from the original staging: put six flowers down and the
      // moth beside the last one with a full glow, then play five seconds.
      // Two guards the original lacked: if the autopilot lost at dawn, the
      // world is over and step() does nothing, so reset the night first
      // (as winNight does); and if the direct blooms already finish the
      // set, there is no last flower to chase — the win condition (all 7
      // bloomed) is met, so register the win rather than leaving a 7/7
      // night un-won.
      if (world.state.over) world.reset(world.state.night);
      let bloomed = 0;
      for (const flower of world.state.flowers) {
        if (bloomed < 6 && !flower.bloomed) {
          flower.bloomed = true;
          bloomed += 1;
        }
      }
      const last = world.state.flowers.find((flower) => !flower.bloomed);
      if (last) {
        world.state.moth.x = last.x + 40;
        world.state.moth.y = last.y + 40;
        world.state.glow = 1;
        world.state.score = 4245;
        world.state.stats = { orbs: 28, blooms: 6, scares: 6, dashes: 9, websTorn: 0 };
        events = playUntil(world, true, 5);
      } else {
        world.state.won = true;
      }
    }
    if (world.state.won) world.offerDraft();
    return {
      screen: world.state.won ? SCREEN_DRAFT : SCREEN_PLAY,
      best: world.state.score,
      campaign: { bestNight: 2, runs: 1, victories: 0 },
    };
  }

  // The end scene: win nights 1 and 2 carefully, then lose night 3
  // carelessly, so the campaign summary reads "Nights cleared: 2 of 7".
  world.reset(1);
  let events = winNight(world);
  if (events & EVENT_WIN) {
    world.grantBlessing('second-skin');
    world.nextNight();
    events = winNight(world);
    if (events & EVENT_WIN) {
      world.grantBlessing('swift-current');
      world.nextNight();
    }
  }
  events = playUntil(world, false, SHOT_SECONDS.endLimit);
  // A careless pilot almost never wins night 3, but if it did, keep flying
  // carelessly into a harder night rather than showing a won garden as a loss.
  while (events & EVENT_WIN && world.state.night < 5) {
    world.grantBlessing('wide-halo');
    world.nextNight();
    events = playUntil(world, false, SHOT_SECONDS.endLimit);
  }
  if (world.state.won) {
    // Last resort: dawn falls and the run ends honestly through the rules.
    world.state.dawn = 0.5;
    let guard = 0;
    while (!world.state.over && guard < 120) {
      world.step(STEP, autopilot(world, false), false);
      guard += 1;
    }
  }
  return {
    screen: SCREEN_OVER,
    best: world.state.score,
    campaign: { bestNight: 3, runs: 2, victories: 0 },
  };
}
