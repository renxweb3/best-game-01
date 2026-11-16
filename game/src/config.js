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

// The web-spider: a second foe that lays sticky webs on the moonflowers instead
// of chasing the moth. Slow and avoidable by design — its threat is positional.
export const SPIDER = {
  radius: 14,
  crawlSpeed: 70,
  webRadius: 55,
  webLife: 9,
  webSlow: 0.45,
  entryDelay: 8,
  descendTime: 3,
  drivenOff: 8,
  knockback: 200,
  sway: 10,
  layTime: 1.2,
  arriveDist: 40,
};

// The seven-night campaign. Bat speed keeps the verified formula
// x(1 + 0.12 * (night - 1)); this table adds bat-count scaling, the spider
// schedule, the web schedule and the mid-night surge. Flowers stay 7 and the
// dawn stays 90 s every night — the campaign escalates the threats, not the
// objective, so the loop learned on night 1 is still the loop on night 7.
export const NIGHTS = {
  // Hand-tuned per night from multi-seed band data (final-optimization retune
  // V27b, 2026-11-17): the formula x(1 + 0.12 x (night - 1)) was the V17
  // starting point, but the band is chaotic across seeds, so the table is the
  // single source of truth and the formula no longer holds exactly.
  // 10-seed careful-autopilot band on V27b: n1 10/10, n2 7/10, n3 8/10,
  // n4 8/10, n5-7 0/10 unblessed (winnable with a blessed run: slow-bats
  // reaches n5 4/10, n6 1/10). N4 has ONE spider: the second spider was the
  // N4 bottleneck (n4 4/10 -> 8/10 when removed); the spider ramp is now
  // n3 1 -> n5 2 -> n6 3. Nights 1-2 untouched by the retune.
  1: { name: 'the first bloom', batSpeed: 1, batStart: 3, batEnd: 7, spiders: 0, webEvery: 0, maxWebs: 0, surge: false, preview: 'bats quicken' },
  2: { name: 'the spider spins', batSpeed: 1.12, batStart: 3, batEnd: 6, spiders: 1, webEvery: 7, maxWebs: 2, surge: true, preview: 'one spider, webs every 7 s' },
  3: { name: 'webs thicken', batSpeed: 1.12, batStart: 3, batEnd: 5, spiders: 1, webEvery: 6, maxWebs: 3, surge: true, preview: 'one spider, webs every 6 s' },
  4: { name: 'the bats descend', batSpeed: 1.18, batStart: 4, batEnd: 6, spiders: 1, webEvery: 6, maxWebs: 3, surge: true, preview: 'bats quicken, webs every 6 s' },
  5: { name: 'the garden stirs', batSpeed: 1.42, batStart: 5, batEnd: 8, spiders: 2, webEvery: 5, maxWebs: 4, surge: true, preview: 'two spiders, webs every 5 s' },
  6: { name: 'webs everywhere', batSpeed: 1.54, batStart: 5, batEnd: 8, spiders: 3, webEvery: 5, maxWebs: 4, surge: true, preview: 'three spiders, webs every 5 s' },
  7: { name: 'the last dawn', batSpeed: 1.66, batStart: 6, batEnd: 9, spiders: 3, webEvery: 4.5, maxWebs: 5, surge: true, preview: 'the final night' },
};

export const CAMPAIGN_KEY = 'mothlight.campaign.v1';

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
