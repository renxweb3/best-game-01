// The screenshot scenes behind ?shot=start|play|win|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by an autopilot, so the
// frame is what a real game looks like and the same seed always gives the same frame.
// The autopilot chases the nearest light orb, flies to a moonflower when its glow is
// full, and dashes through a bat that gets too close; the end scene's pilot is careless
// (short horizon, never dashes), so the night catches it the way it catches a hurried player.
import { SHOT_SECONDS, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const SAFE_DISTANCE = 110;
const DASH_DISTANCE = 70;

function nearestOrb(state) {
  let best = null;
  let bestD = Infinity;
  for (const orb of state.orbs) {
    const d = Math.hypot(orb.x - state.moth.x, orb.y - state.moth.y);
    if (d < bestD) { bestD = d; best = orb; }
  }
  return best;
}

function nearestFlower(state) {
  let best = null;
  let bestD = Infinity;
  for (const flower of state.flowers) {
    if (flower.bloomed) continue;
    const d = Math.hypot(flower.x - state.moth.x, flower.y - state.moth.y);
    if (d < bestD) { bestD = d; best = flower; }
  }
  return best;
}

function nearestBat(state) {
  let best = null;
  let bestD = Infinity;
  for (const bat of state.bats) {
    if (bat.fleeing) continue;
    const d = Math.hypot(bat.x - state.moth.x, bat.y - state.moth.y);
    if (d < bestD) { bestD = d; best = bat; }
  }
  return { bat: best, distance: bestD };
}

/**
 * Steer the moth for one step. `careful` pilots dodge bats and dash through them;
 * careless ones only chase orbs, which is how the end scene loses its lives.
 */
function autopilot(world, careful) {
  const state = world.state;
  const moth = state.moth;
  const target = state.glow >= 1 - 1e-6 ? nearestFlower(state) : nearestOrb(state);
  let tx = 640;
  let ty = 360;
  if (target) { tx = target.x; ty = target.y; }
  let dash = false;
  if (careful) {
    const { bat, distance } = nearestBat(state);
    if (bat && distance < SAFE_DISTANCE) {
      // Veer away from the bat, and dash through it when it is nearly on us.
      const away = Math.atan2(moth.y - bat.y, moth.x - bat.x);
      tx = moth.x + Math.cos(away) * 300;
      ty = moth.y + Math.sin(away) * 300;
      if (distance < DASH_DISTANCE && moth.dashCooldown <= 0) dash = true;
    }
  }
  const dx = tx - moth.x;
  const dy = ty - moth.y;
  const d = Math.hypot(dx, dy);
  const keys = d > 4 ? { x: dx / d, y: dy / d } : null;
  return { keys, pointer: null, dash };
}

/** Run the world forward until the game ends or the step cap is hit. */
function playUntil(world, careful, limitSeconds) {
  const steps = Math.floor(limitSeconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    const events = world.step(STEP, autopilot(world, careful), false);
    if (events & (EVENT_OVER | EVENT_WIN)) return events;
  }
  return 0;
}

/**
 * Set `world` to the named scene (start, play, win or end; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset(1);
  if (name !== 'play' && name !== 'win' && name !== 'end') {
    for (let index = 0; index < SHOT_SECONDS.start / STEP; index += 1) {
      world.step(STEP, { keys: null, pointer: null, dash: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    playUntil(world, true, SHOT_SECONDS.play);
    return { screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'win') {
    let events = playUntil(world, true, SHOT_SECONDS.winLimit);
    if (!(events & EVENT_WIN)) {
      // The careful pilot almost always blooms the garden; if the seed is unkind,
      // stage the last flower honestly through the rules: six blooms already in,
      // a full glow, and the moth beside the last flower, then let it finish.
      const state = world.state;
      let bloomed = 0;
      for (const flower of state.flowers) {
        if (bloomed < 6 && !flower.bloomed) {
          flower.bloomed = true;
          bloomed += 1;
        }
      }
      const last = state.flowers.find((flower) => !flower.bloomed);
      if (last) {
        state.glow = 1;
        state.moth.x = last.x;
        state.moth.y = last.y + 40;
        state.moth.vx = 0;
        state.moth.vy = -60;
        playUntil(world, true, 5);
      }
    }
    return { screen: world.state.won ? SCREEN_WIN : SCREEN_PLAY, best: world.state.score };
  }
  playUntil(world, false, SHOT_SECONDS.endLimit);
  return { screen: SCREEN_OVER, best: world.state.score };
}
