// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between seven screens: title, play, paused, help, game over,
// victory and the between-night draft (a win clears the night and offers the next
// one, harder). The best score is kept in localStorage between visits.
//
// ?seed=N fixes the night's random pattern. ?shot=start|play|win|end (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, CAMPAIGN_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_BLOOM, EVENT_BUMP, EVENT_DASH, EVENT_HIT, EVENT_ORB, EVENT_OVER,
  EVENT_SCARE, EVENT_SHIELD, EVENT_SPIDER_SCARE, EVENT_STUCK, EVENT_SURGE, EVENT_TEAR, EVENT_WEB, EVENT_WIN,
} from './world.js';
import {
  ACTION_CLICK, ACTION_CONFIRM, ACTION_DASH, ACTION_DRAFT_LEFT, ACTION_DRAFT_RIGHT,
  ACTION_HELP, ACTION_MUTE, ACTION_PAUSE, ACTION_PICK_1, ACTION_PICK_2, ACTION_PICK_3,
  ACTION_QUIT, ACTION_RESTART,
  createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { createMusic } from './music.js';
import {
  createRenderer, draftCardAt, gradeFor, helpButtonAt, SCREEN_DRAFT, SCREEN_HELP, SCREEN_OVER,
  SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN,
} from './render.js';
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
// The night music shares the SFX module's clock; it starts on the first
// night and follows the campaign (darker from night 5, shimmer at dawn).
const music = createMusic(() => audio.peekContext());

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

// The campaign record: how far any run has reached, how many runs, how many
// campaign victories. No unlocks, no currency — the campaign is a run
// structure, not a grind, and everything stays available from the first run.
function readCampaign() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CAMPAIGN_KEY) ?? 'null');
    if (parsed && typeof parsed === 'object') {
      return {
        bestNight: parsed.bestNight | 0,
        runs: parsed.runs | 0,
        victories: parsed.victories | 0,
        // All-time totals and the last completed run, for the title screen's
        // records line. Older saves without them read as zeros / no run.
        totalOrbs: parsed.totalOrbs | 0,
        totalBlooms: parsed.totalBlooms | 0,
        lastRun: parsed.lastRun && typeof parsed.lastRun === 'object' ? parsed.lastRun : null,
      };
    }
  } catch {
    // A corrupt record is a fresh record.
  }
  return { bestNight: 0, runs: 0, victories: 0, totalOrbs: 0, totalBlooms: 0, lastRun: null };
}

function saveCampaign(campaign) {
  try {
    window.localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(campaign));
  } catch {
    // Storage can be off: the campaign then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  // Settle the transient effects before painting: a killing hit leaves a
  // red flash that would otherwise freeze over the staged frame, and the
  // night banner and hint timers should read as spent.
  world.tick(2);
  // A handle for automated play-tests (and nothing else): the world and the screen.
  window.__mothlight = { world, get screen() { return scene.screen; }, get best() { return scene.best; } };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, scene.campaign);
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
  let campaign = readCampaign();
  let dashQueued = false;
  let accumulator = 0;
  let last = performance.now();
  // The help screen remembers where it came from (title or pause) so one key
  // always takes the player back there. The dawn warning rings once per night.
  let helpReturn = SCREEN_TITLE;
  let warned = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startNight(night) {
    if (night === 1) {
      world.newRun();
      campaign.runs += 1;
      saveCampaign(campaign);
    } else world.nextNight();
    accumulator = 0;
    dashQueued = false;
    warned = false;
    music.setNight(night);
    music.setDawnMode(false);
    music.start();
    screen = SCREEN_PLAY;
    audio.nightStart();
    announce(`Night ${world.state.night}. Bloom all 7 moonflowers before dawn.`);
  }

  function finishRun(won) {
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    campaign.bestNight = Math.max(campaign.bestNight, world.state.night);
    if (won) {
      if (world.state.night >= 7) {
        recordCompletedRun(true);
        screen = SCREEN_WIN;
        audio.win();
        announce(`The last dawn breaks. Seven nights cleared. Score ${world.state.score}. Best ${best}.`);
      } else {
        saveCampaign(campaign);
        world.offerDraft();
        screen = SCREEN_DRAFT;
        audio.win();
        announce(`Dawn blooms! Night ${world.state.night} cleared. Choose a blessing for the night ahead.`);
      }
    } else {
      recordCompletedRun(false);
      screen = SCREEN_OVER;
      audio.lose();
      announce(`The night ends. Score ${world.state.score}. Best ${best}.`);
    }
  }

  // A run ends (night 7 cleared, or a loss): remember it for the title
  // screen's records line, and fold the run's totals into the all-time ones.
  // Intermediate night wins do not end the run, so they record nothing here.
  function recordCompletedRun(won) {
    campaign.lastRun = {
      night: world.state.night,
      score: world.state.score,
      grade: gradeFor(world.state, won),
      won,
    };
    campaign.totalOrbs += world.state.campaign.orbs;
    campaign.totalBlooms += world.state.campaign.blooms;
    if (won) campaign.victories += 1;
    saveCampaign(campaign);
  }

  // Pick the offered blessing at `index` (0-2). Returns the blessing or null.
  function pickCard(index) {
    const blessing = world.pickDraft(index);
    if (!blessing) return null;
    audio.chime();
    announce(`${blessing.name} chosen — ${blessing.effect}. Press Space to begin Night ${world.state.night + 1}.`);
    return blessing;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.isMuted());
      music.setMuted(audio.isMuted());
      announce(audio.isMuted() ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_DASH && screen === SCREEN_PLAY) dashQueued = true;
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) {
      audio.click();
      startNight(1);
      return;
    }
    // The help screen: H opens it from the title or the pause menu, and H,
    // Escape, Space or a click takes the player back where they came from.
    if (actions & ACTION_HELP) {
      if (screen === SCREEN_TITLE || screen === SCREEN_PAUSED) {
        audio.click();
        helpReturn = screen;
        screen = SCREEN_HELP;
        announce('How to play. Press H or Escape to go back.');
        return;
      }
      if (screen === SCREEN_HELP) {
        audio.click();
        screen = helpReturn;
        announce(helpReturn === SCREEN_PAUSED ? 'Paused.' : 'Mothlight. Press Space or click to begin.');
        return;
      }
    }
    if (screen === SCREEN_HELP) {
      if (actions & ACTION_PAUSE) {
        audio.click();
        screen = helpReturn;
        announce(helpReturn === SCREEN_PAUSED ? 'Paused.' : 'Mothlight. Press Space or click to begin.');
        return;
      }
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        audio.click();
        if (helpReturn === SCREEN_PAUSED) {
          screen = SCREEN_PLAY;
          announce('Flying.');
        } else {
          startNight(1);
        }
        return;
      }
      return;
    }
    if (actions & ACTION_QUIT && screen === SCREEN_PAUSED) {
      audio.click();
      screen = SCREEN_TITLE;
      announce('Mothlight. Press Space or click to begin.');
      return;
    }
    // The title screen's HOW TO PLAY button: a click on it opens the help
    // screen instead of starting the game.
    if (screen === SCREEN_TITLE && (actions & ACTION_CLICK)) {
      const pointer = input.pointer();
      if (helpButtonAt(pointer.x, pointer.y)) {
        audio.click();
        helpReturn = SCREEN_TITLE;
        screen = SCREEN_HELP;
        announce('How to play. Press H or Escape to go back.');
        return;
      }
    }
    if (screen === SCREEN_DRAFT) {
      const draft = world.state.draft;
      if (!draft) return;
      if (actions & ACTION_PICK_1) pickCard(0);
      else if (actions & ACTION_PICK_2) pickCard(1);
      else if (actions & ACTION_PICK_3) pickCard(2);
      else if (actions & ACTION_DRAFT_LEFT) {
        draft.highlight = (draft.highlight + 2) % 3;
        audio.click();
      } else if (actions & ACTION_DRAFT_RIGHT) {
        draft.highlight = (draft.highlight + 1) % 3;
        audio.click();
      } else if (actions & ACTION_CLICK) {
        const pointer = input.pointer();
        const card = draftCardAt(pointer.x, pointer.y);
        if (draft.picked === null && card >= 0) pickCard(card);
        else if (draft.picked !== null) {
          audio.click();
          startNight(world.state.night + 1);
        }
      } else if (actions & ACTION_CONFIRM) {
        audio.unlock();
        if (draft.picked === null) {
          pickCard(draft.highlight);
        } else {
          audio.click();
          startNight(world.state.night + 1);
        }
      }
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
        if (world.state.night >= 7) {
          screen = SCREEN_TITLE;
          announce('Mothlight. Press Space or click to begin.');
        } else {
          startNight(world.state.night + 1);
        }
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
    if (events & EVENT_SPIDER_SCARE) audio.spiderScare();
    if (events & EVENT_WEB) audio.web();
    if (events & EVENT_STUCK) audio.stuck();
    if (events & EVENT_TEAR) audio.tear();
    if (events & EVENT_SHIELD) audio.chime();
    if (events & EVENT_SURGE) audio.surge();
    if (events & EVENT_BUMP) {
      audio.thud();
      announce('The spider shoves you — combo lost.');
    }
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
    // Ten seconds to dawn: one low bell, once per night. Fifteen seconds
    // to dawn: the music gains its shimmer, so the deadline is heard.
    if (world.state.dawn <= 15 && world.state.dawn > 0) music.setDawnMode(true);
    if (!warned && world.state.dawn <= 10 && world.state.dawn > 0 && !world.state.over && !world.state.won) {
      warned = true;
      audio.warn();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    accumulator += dt;
    last = now;
    handleActions();
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      stepWorld();
      accumulator -= STEP;
      if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) break;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) accumulator = 0;
    // End screens: the world no longer steps, but the garden behind the
    // panel should stay alive and a killing hit's red flash should fade
    // instead of freezing rose-red over the results.
    if (screen === SCREEN_OVER || screen === SCREEN_WIN || screen === SCREEN_DRAFT) world.tick(dt);
    renderer.draw(world.state, screen, best, campaign);
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
