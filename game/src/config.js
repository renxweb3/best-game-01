// Tuning and constants for Mothlight. Every number the game balances on lives here,
// so the rules can be tuned without touching the simulation or the drawing.
export const STEP = 1 / 60;
export const FIELD_WIDTH = 1280;
export const FIELD_HEIGHT = 720;

export const NIGHT_SECONDS = 90;
export const FLOWER_COUNT = 7;
export const START_LIVES = 3;
export const GLOW_MAX = 1;
export const ORB_GLOW = 0.25;
export const ORB_SCORE = 10;
export const BLOOM_SCORE = 500;
export const SCARE_SCORE = 25;
export const COMBO_WINDOW = 2.0;

// The seven moonflowers, placed by hand so the garden reads at a glance:
// a loose ring with one in the middle, clear of the HUD strip at the top.
export const FLOWER_SPOTS = [
  { x: 170, y: 210 },
  { x: 470, y: 140 },
  { x: 780, y: 165 },
  { x: 1090, y: 215 },
  { x: 250, y: 575 },
  { x: 640, y: 610 },
  { x: 1050, y: 565 },
];

export const MOTH = {
  radius: 16,
  accel: 1500,
  maxSpeed: 330,
  drag: 2.6,
  dashSpeed: 640,
  dashTime: 0.18,
  dashCooldown: 1.2,
  flapRate: 9,
  trailEvery: 0.03,
};

export const ORB = {
  radius: 10,
  spawnEvery: 1.35,
  maxOnField: 5,
  life: 14,
  blinkAt: 3,
  drift: 26,
};

export const BAT = {
  radius: 17,
  spawnEveryStart: 2.0,
  spawnEveryEnd: 0.7,
  speedStart: 140,
  speedEnd: 300,
  maxStart: 3,
  maxEnd: 7,
  wobble: 2.4,
  fleeSpeed: 420,
};

export const PARTICLES = {
  sparkle: 14,
  petals: 26,
  wing: 1,
  puff: 10,
};

export const BEST_KEY = 'mothlight.best.v1';

export const SKY = {
  // dusk -> deep night -> pre-dawn: top colour, bottom colour, moon glow, star alpha
  dusk: { top: '#2b1d4e', bottom: '#6b3a6e', moon: '#ffe9b8', stars: 0.5 },
  night: { top: '#070b24', bottom: '#16224d', moon: '#fff3cf', stars: 1.0 },
  dawn: { top: '#3d2b52', bottom: '#c98a5e', moon: '#ffe2a8', stars: 0.25 },
};

export const SHOT_SECONDS = {
  start: 5,
  play: 26,
  winLimit: 600,
  endLimit: 600,
};
