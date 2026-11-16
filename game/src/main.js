// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, paused, game over and victory
// (a win clears the night and offers the next one, harder). The best score is kept in
// localStorage between visits.
//
// ?seed=N fixes the night's random pattern. ?shot=start|play|win|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BLOOM, EVENT_DASH, EVENT_HIT, EVENT_ORB, EVENT_OVER, EVENT_SCARE, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_DASH, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  // A handle for automated play-tests (and nothing else): the world and the screen.
  window.__mothlight = { world, get screen() { return scene.screen; }, get best() { return scene.best; } };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, renderer.toField);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let dashQueued = false;
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startNight(night) {
    if (night === 1) world.reset(1);
    else world.nextNight();
    accumulator = 0;
    dashQueued = false;
    screen = SCREEN_PLAY;
    announce(`Night ${world.state.night}. Bloom all 7 moonflowers before dawn.`);
  }

  function finishRun(won) {
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) {
      screen = SCREEN_WIN;
      audio.win();
      announce(`Dawn blooms! Night ${world.state.night} cleared. Score ${world.state.score}. Best ${best}.`);
    } else {
      screen = SCREEN_OVER;
      audio.lose();
      announce(`The night ends. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      announce(audio.isMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_DASH && screen === SCREEN_PLAY) dashQueued = true;
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      audio.click();
      startNight(1);
      return;
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE) {
        audio.click();
        startNight(1);
      } else if (screen === SCREEN_OVER) {
        audio.click();
        startNight(1);
      } else if (screen === SCREEN_WIN) {
        audio.click();
        startNight(world.state.night + 1);
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Flying.');
      }
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Flying.');
      }
    }
  }

  function react(events) {
    if (events & EVENT_ORB) audio.pluck(world.state.combo);
    if (events & EVENT_DASH) audio.dash();
    if (events & EVENT_SCARE) audio.scare();
    if (events & EVENT_BLOOM) {
      audio.chime();
      announce(`A moonflower bloomed. ${world.state.stats.blooms} of 7.`);
    }
    if (events & EVENT_HIT) {
      audio.thud();
      announce(world.state.lives === 1 ? 'A bat hit you. One life left.' : `A bat hit you. ${world.state.lives} lives left.`);
    }
    if (events & EVENT_WIN) finishRun(true);
    else if (events & EVENT_OVER) finishRun(false);
  }

  function stepWorld() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { keys: null, pointer: null, dash: false }, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const control = {
      keys: input.keySteer(),
      pointer: input.pointer(),
      dash: dashQueued,
    };
    dashQueued = false;
    react(world.step(STEP, control, false));
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      stepWorld();
      accumulator -= STEP;
      if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) break;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) accumulator = 0;
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting dawn arrive unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Mothlight. Press Space or click to begin.');
  // A handle for automated play-tests (and nothing else): the world and the screen.
  window.__mothlight = { world, get screen() { return screen; }, get best() { return best; } };
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
