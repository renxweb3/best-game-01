// The blessing pool for the between-night draft: what a run can pick, and what
// each pick does to the game. One table, one job — no drawing, no browser, no
// rules of its own. A blessing is a pure modifier: it reads the base numbers
// from config.js and writes a delta into a modifiers object, and the world
// reads that object when it steps. Nothing here knows about screens or input.
import {
  COMBO_WINDOW, MOTH, NIGHT_SECONDS, ORB, ORB_GLOW,
} from './config.js';

// Every blessing the draft can offer. `glyph` names the canvas icon render.js
// draws for it (a small shape, not an asset). `apply` writes the blessing's
// effect into a modifiers object; the defaults in baseModifiers() are the base
// game, so a run with no blessings plays exactly like the base game.
export const BLESSINGS = [
  {
    id: 'moonlit-wings',
    name: 'Moonlit Wings',
    glyph: 'wing',
    effect: 'Moth speed 330 → 385',
    flavour: 'The night wind lifts you.',
    apply(m) { m.maxSpeed = 385; },
  },
  {
    id: 'swift-current',
    name: 'Swift Current',
    glyph: 'dash',
    effect: 'Dash recharges in 0.8 s',
    flavour: 'The air itself hurries.',
    apply(m) { m.dashCooldown = 0.8; },
  },
  {
    id: 'wide-halo',
    name: 'Wide Halo',
    glyph: 'halo',
    effect: 'Three orbs fill the glow ring',
    flavour: 'The halo drinks deeper tonight.',
    apply(m) { m.orbGlow = 0.34; },
  },
  {
    id: 'lodestone-light',
    name: 'Lodestone Light',
    glyph: 'magnet',
    effect: 'Orbs drift to you from 150 px',
    flavour: 'Light leans toward the moth.',
    apply(m) { m.magnetRange = 150; m.magnetSpeed = 130; },
  },
  {
    id: 'second-skin',
    name: 'Second Skin',
    glyph: 'shield',
    effect: 'Blocks the first bat hit each night',
    flavour: 'A second skin, shed by dawn.',
    apply(m) { m.shield = true; },
  },
  {
    id: 'thick-silk',
    name: 'Thick Silk',
    glyph: 'silk',
    effect: '+1 life, and heal 1 life now',
    flavour: 'Spun strong, worn soft.',
    apply(m) { m.maxLives = 4; },
  },
  {
    id: 'long-night',
    name: 'Long Night',
    glyph: 'clock',
    effect: 'Combo window 2.0 s → 3.5 s',
    flavour: 'The night stretches for you.',
    apply(m) { m.comboWindow = 3.5; },
  },
  {
    id: 'twin-lights',
    name: 'Twin Lights',
    glyph: 'twin',
    effect: 'Every orb spawn brings two orbs',
    flavour: 'One light becomes a pair.',
    apply(m) { m.orbPair = true; m.orbMax = 7; },
  },
  {
    id: 'slow-bats',
    name: 'Slow Bats',
    glyph: 'bat',
    effect: 'All bat speeds × 0.85',
    flavour: 'The bats grow heavy-winged.',
    apply(m) { m.batSpeed = 0.85; },
  },
  {
    id: 'dawns-reprieve',
    name: "Dawn's Reprieve",
    glyph: 'sun',
    effect: 'Each night lasts 100 s, not 90',
    flavour: 'Dawn agrees to wait.',
    apply(m) { m.nightSeconds = 100; },
  },
  {
    id: 'webcutter',
    name: 'Webcutter',
    glyph: 'shears',
    effect: 'Dashing tears any web it touches',
    flavour: 'Silk parts before the moth.',
    apply(m) { m.webcutter = true; },
  },
];

export function blessingById(id) {
  return BLESSINGS.find((blessing) => blessing.id === id) ?? null;
}

// The base game as a modifiers object: every number a blessing may change,
// at its unmodified value. A run with no blessings gets exactly this.
export function baseModifiers() {
  return {
    maxSpeed: MOTH.maxSpeed,
    dashCooldown: MOTH.dashCooldown,
    orbGlow: ORB_GLOW,
    magnetRange: 0,
    magnetSpeed: 0,
    shield: false,
    maxLives: 3,
    comboWindow: COMBO_WINDOW,
    orbPair: false,
    orbMax: ORB.maxOnField,
    batSpeed: 1,
    nightSeconds: NIGHT_SECONDS,
    webcutter: false,
  };
}

// Fold every owned blessing into one modifiers object. Called whenever the
// owned list changes and on every night reset, so the modifiers always match
// the blessings the run holds.
export function applyBlessings(state) {
  const modifiers = baseModifiers();
  for (const id of state.blessings) {
    const blessing = blessingById(id);
    if (blessing) blessing.apply(modifiers);
  }
  state.modifiers = modifiers;
  return modifiers;
}

// Offer three blessings the run does not already own, drawn with the world's
// seeded random so the offer is deterministic for a given seed. Each blessing
// can be owned at most once per run; with 11 in the pool and at most 6 drafts
// in a 7-night campaign, every run sees a different subset.
export function offerBlessings(random, ownedIds) {
  const pool = BLESSINGS.filter((blessing) => !ownedIds.includes(blessing.id));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random.next() * (i + 1));
    const swap = pool[i];
    pool[i] = pool[j];
    pool[j] = swap;
  }
  return pool.slice(0, 3);
}
