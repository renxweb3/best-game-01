// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the night
// colour. Everything is drawn in canvas: a gradient sky that deepens as dawn nears, a
// glowing moon, a garden silhouette, the moth, the orbs, the bats and the moonflowers.
import {
  BAT, FIELD_HEIGHT, FIELD_WIDTH, FLOWER_COUNT, MOTH, NIGHTS, NIGHT_SECONDS, ORB, SKY,
} from './config.js';
import { BLESSINGS, blessingById } from './blessings.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';
export const SCREEN_DRAFT = 'draft';
export const SCREEN_HELP = 'help';

// The title screen's HOW TO PLAY button, top right. Shared by the drawing
// and the click hit-test.
const HELP_BUTTON = { x: 1070, y: 24, w: 186, h: 40 };
/** True when the field point is on the title screen's help button. */
export function helpButtonAt(x, y) {
  return x >= HELP_BUTTON.x && x <= HELP_BUTTON.x + HELP_BUTTON.w
    && y >= HELP_BUTTON.y && y <= HELP_BUTTON.y + HELP_BUTTON.h;
}

// The draft cards' geometry, shared by the drawing and the click hit-test.
const DRAFT_CARD_X = 100;
const DRAFT_CARD_Y = 225;
const DRAFT_CARD_W = 340;
const DRAFT_CARD_H = 335;
const DRAFT_CARD_GAP = 30;

/** Which draft card (0-2) the field point is on, or -1. */
export function draftCardAt(x, y) {
  for (let i = 0; i < 3; i += 1) {
    const cx = DRAFT_CARD_X + i * (DRAFT_CARD_W + DRAFT_CARD_GAP);
    if (x >= cx && x <= cx + DRAFT_CARD_W && y >= DRAFT_CARD_Y && y <= DRAFT_CARD_Y + DRAFT_CARD_H) return i;
  }
  return -1;
}

// A results grade from the run itself: lives kept, time left, score.
// S needs all three (3 lives, 30+ seconds left, 4000+ points); a win with
// one life and no time to spare is a C. A loss grades on blooms alone.
export function gradeFor(state, won) {
  if (!won) {
    const blooms = state.flowers.filter((flower) => flower.bloomed).length;
    return blooms >= 6 ? 'B' : blooms >= 4 ? 'C' : 'D';
  }
  const points = state.lives * 2
    + (state.dawn > 30 ? 2 : state.dawn > 10 ? 1 : 0)
    + (state.score >= 4000 ? 1 : 0);
  if (points >= 8) return 'S';
  if (points >= 6) return 'A';
  if (points >= 4) return 'B';
  if (points >= 2) return 'C';
  return 'D';
}

export function starsFor(state, won) {
  if (!won) return 0;
  if (state.lives === 3 && state.dawn > 20) return 3;
  if (state.lives >= 2) return 2;
  return 1;
}

const TITLE_FONT = 'Georgia, "Times New Roman", serif';
const UI_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const HUD_TOP = 18;

function blend(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const mixed = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${mixed[0]},${mixed[1]},${mixed[2]})`;
}

function hash(n) {
  // A deterministic 0..1 value from an index, for decoration that must look
  // the same every frame without touching the world's random stream.
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function skyFor(dawnLeft, nightSeconds) {
  const fraction = dawnLeft / (nightSeconds || NIGHT_SECONDS);
  if (fraction > 0.66) return { ...SKY.dusk, phase: 'dusk' };
  if (fraction > 0.33) {
    const t = (0.66 - fraction) / 0.33;
    return {
      top: blend(SKY.dusk.top, SKY.night.top, t),
      bottom: blend(SKY.dusk.bottom, SKY.night.bottom, t),
      moon: SKY.night.moon,
      stars: SKY.dusk.stars + (SKY.night.stars - SKY.dusk.stars) * t,
      phase: 'night',
    };
  }
  const t = (0.33 - fraction) / 0.33;
  return {
    top: blend(SKY.night.top, SKY.dawn.top, t),
    bottom: blend(SKY.night.bottom, SKY.dawn.bottom, t),
    moon: SKY.dawn.moon,
    stars: SKY.night.stars + (SKY.dawn.stars - SKY.night.stars) * t,
    phase: 'dawn',
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD_WIDTH, height / FIELD_HEIGHT);
    view.x = (width - FIELD_WIDTH * view.scale) / 2;
    view.y = (height - FIELD_HEIGHT * view.scale) / 2;
  }

  function font(size, family) {
    const key = `${size}|${family}`;
    if (!fonts.has(key)) fonts.set(key, `${size}px ${family}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, family, style) {
    context.font = style ? `${style} ${font(size, family ?? UI_FONT)}` : font(size, family ?? UI_FONT);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  // Wrap a string to lines that fit maxWidth at the given size.
  function wrapText(value, maxWidth, size, family) {
    context.font = font(size, family ?? UI_FONT);
    const lines = [];
    let line = '';
    for (const word of value.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (line && context.measureText(test).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function circle(x, y, r, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }

  function glowCircle(x, y, r, inner, outer) {
    const gradient = context.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(1, outer);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }

  function drawSky(state, sky) {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD_HEIGHT);
    gradient.addColorStop(0, sky.top);
    gradient.addColorStop(1, sky.bottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
    // A faint milky-way band across the sky.
    context.save();
    context.globalAlpha = 0.10;
    context.fillStyle = '#c9b8ff';
    context.beginPath();
    context.ellipse(420, 150, 260, 34, -0.35, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.ellipse(700, 240, 300, 30, -0.35, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 0.07;
    context.fillStyle = '#ffd76a';
    context.beginPath();
    context.ellipse(560, 200, 200, 22, -0.35, 0, Math.PI * 2);
    context.fill();
    context.restore();
    // Stars, twinkling on their own phase.
    for (const star of state.stars) {
      const alpha = sky.stars * (0.4 + 0.6 * Math.abs(Math.sin(state.elapsed * 1.5 + star.tw)));
      context.globalAlpha = alpha;
      circle(star.x, star.y, star.r, '#ffffff');
    }
    context.globalAlpha = 1;
    // Three slow clouds drifting across the upper sky, darker than the stars
    // so the sky has depth, soft enough never to hide the moon.
    for (let i = 0; i < 3; i += 1) {
      const cx = ((hash(i * 7 + 2) * FIELD_WIDTH + state.elapsed * (6 + i * 3)) % (FIELD_WIDTH + 320)) - 160;
      const cy = 70 + i * 46 + hash(i * 7 + 5) * 30;
      context.globalAlpha = 0.10;
      context.fillStyle = '#8fa0c4';
      context.beginPath();
      context.ellipse(cx, cy, 120 + i * 30, 16 + i * 4, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(cx + 70, cy + 8, 70, 12, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // A shooting star, when one is crossing: a short bright streak with a
    // fading tail, gone in about a second.
    if (state.shooting) {
      const fade = 1 - state.shooting.t / state.shooting.max;
      context.globalAlpha = fade * 0.9;
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(state.shooting.x, state.shooting.y);
      context.lineTo(state.shooting.x - state.shooting.vx * 0.22, state.shooting.y - state.shooting.vy * 0.22);
      context.stroke();
      circle(state.shooting.x, state.shooting.y, 2.4, '#ffffff');
      context.globalAlpha = 1;
    }
    // The moon, big and low-glow, top right.
    const moonX = 1060;
    const moonY = 110;
    glowCircle(moonX, moonY, 150, 'rgba(255, 243, 207, 0.20)', 'rgba(255, 243, 207, 0)');
    circle(moonX, moonY, 62, sky.moon);
    context.fillStyle = 'rgba(214, 196, 150, 0.55)';
    circle(moonX - 18, moonY - 12, 9, 'rgba(214, 196, 150, 0.55)');
    circle(moonX + 14, moonY + 16, 12, 'rgba(214, 196, 150, 0.55)');
    circle(moonX + 22, moonY - 22, 6, 'rgba(214, 196, 150, 0.55)');
    // Distant hills and the garden ground.
    context.fillStyle = '#1b1440';
    context.beginPath();
    context.moveTo(0, 640);
    context.quadraticCurveTo(320, 560, 640, 620);
    context.quadraticCurveTo(960, 668, 1280, 600);
    context.lineTo(1280, 720);
    context.lineTo(0, 720);
    context.closePath();
    context.fill();
    context.fillStyle = '#241a4a';
    context.fillRect(0, 668, FIELD_WIDTH, FIELD_HEIGHT - 668);
    // A second garden layer: dark bushes along the horizon, a still pond
    // catching the moonlight, and grass tufts on the ground.
    context.fillStyle = '#16283a';
    const bushX = [90, 300, 560, 820, 1180];
    bushX.forEach((bx, i) => {
      const bw = 120 + hash(i * 3 + 1) * 90;
      const bh = 34 + hash(i * 3 + 2) * 22;
      context.beginPath();
      context.ellipse(bx, 648, bw / 2, bh / 2, 0, 0, Math.PI * 2);
      context.fill();
    });
    // The pond, bottom right, with the moon's path shimmering on it.
    context.fillStyle = '#0f1e33';
    context.beginPath();
    context.ellipse(1060, 700, 230, 24, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(255, 233, 168, 0.5)';
    context.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      const wobble = Math.sin(state.elapsed * 1.2 + i * 1.7) * 6;
      const pondY = 690 + i * 6;
      const half = 90 - i * 18;
      context.beginPath();
      context.moveTo(1060 - half + wobble, pondY);
      context.lineTo(1060 + half + wobble, pondY);
      context.stroke();
    }
    // Grass tufts, seeded by index so the garden is the same every frame.
    context.strokeStyle = '#3f7a4e';
    context.lineWidth = 2;
    for (let i = 0; i < 70; i += 1) {
      const gx = 20 + hash(i * 7 + 1) * (FIELD_WIDTH - 40);
      const gy = 672 + hash(i * 7 + 2) * 38;
      const lean = (hash(i * 7 + 3) - 0.5) * 8;
      context.beginPath();
      context.moveTo(gx, gy);
      context.lineTo(gx - 4 + lean, gy - 10);
      context.moveTo(gx, gy);
      context.lineTo(gx + lean, gy - 13);
      context.moveTo(gx, gy);
      context.lineTo(gx + 4 + lean, gy - 9);
      context.stroke();
    }
  }

  function drawFlowers(state) {
    state.flowers.forEach((flower, index) => {
      const { x, y } = flower;
      // Stem and leaves.
      context.strokeStyle = '#3f7a4e';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(x, 700);
      context.quadraticCurveTo(x - 8, (y + 700) / 2, x, y + 12);
      context.stroke();
      context.fillStyle = '#3f7a4e';
      context.beginPath();
      context.ellipse(x - 14, y + 26, 12, 5, -0.5, 0, Math.PI * 2);
      context.fill();
      if (flower.bloomed) {
        // Open bloom: pink petals around a gold heart, gently breathing.
        // Each flower has its own petal count (5 or 6) and tint, seeded by
        // its index, so the seven blooms are sisters, not clones.
        const petals = 5 + Math.floor(hash(index * 13 + 7) * 2);
        const tint = hash(index * 13 + 3) > 0.5 ? '#ffb7e8' : '#ffc9f0';
        const breathe = 1 + Math.sin(state.elapsed * 2 + flower.phase) * 0.08;
        for (let petal = 0; petal < petals; petal += 1) {
          const angle = (petal / petals) * Math.PI * 2 - Math.PI / 2;
          const px = x + Math.cos(angle) * 15 * breathe;
          const py = y + Math.sin(angle) * 15 * breathe;
          context.fillStyle = tint;
          context.beginPath();
          context.ellipse(px, py, 11, 7, angle, 0, Math.PI * 2);
          context.fill();
        }
        glowCircle(x, y, 26, 'rgba(255, 215, 106, 0.5)', 'rgba(255, 215, 106, 0)');
        circle(x, y, 8, '#ffd76a');
      } else {
        // Closed bud, silver-blue; when the moth's glow is full it pulses gold.
        const ready = state.glow >= 1 - 1e-6;
        if (ready) {
          const pulse = 0.5 + 0.5 * Math.sin(state.elapsed * 6);
          glowCircle(x, y, 30 + pulse * 8, `rgba(255, 215, 106, ${0.25 + pulse * 0.3})`, 'rgba(255, 215, 106, 0)');
        }
        circle(x, y, 10, ready ? '#ffd76a' : '#b9c8e8');
        context.fillStyle = '#7e95c9';
        context.beginPath();
        context.moveTo(x - 7, y + 4);
        context.lineTo(x, y + 14);
        context.lineTo(x + 7, y + 4);
        context.closePath();
        context.fill();
      }
    });
  }

  function drawOrbs(state) {
    for (const orb of state.orbs) {
      const blink = orb.life < 3 ? (Math.floor(orb.life * 6) % 2 === 0 ? 0.35 : 1) : 1;
      const bob = Math.sin(orb.phase) * 3;
      context.globalAlpha = blink;
      glowCircle(orb.x, orb.y + bob, 40, 'rgba(255, 233, 168, 0.6)', 'rgba(255, 233, 168, 0)');
      circle(orb.x, orb.y + bob, 11, '#fff3cf');
      circle(orb.x, orb.y + bob, 5.5, '#ffffff');
      // A four-point sparkle so the orb reads at contact-sheet size.
      context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(orb.x - 15, orb.y + bob);
      context.lineTo(orb.x - 7, orb.y + bob);
      context.moveTo(orb.x + 7, orb.y + bob);
      context.lineTo(orb.x + 15, orb.y + bob);
      context.moveTo(orb.x, orb.y + bob - 15);
      context.lineTo(orb.x, orb.y + bob - 7);
      context.moveTo(orb.x, orb.y + bob + 7);
      context.lineTo(orb.x, orb.y + bob + 15);
      context.stroke();
      context.globalAlpha = 1;
    }
  }

  function drawBats(state) {
    for (const bat of state.bats) {
      const flap = Math.sin(state.elapsed * 16 + bat.phase) * 0.7;
      const heading = Math.atan2(bat.vy, bat.vx);
      context.save();
      context.translate(bat.x, bat.y);
      context.rotate(heading);
      context.globalAlpha = bat.fade;
      context.fillStyle = '#241a33';
      // Wings, flapping. The drawn bat is larger than its collision radius
      // on purpose: a clear silhouette, a forgiving hitbox.
      context.beginPath();
      context.moveTo(0, 0);
      context.quadraticCurveTo(-16, -21 - flap * 13, -34, -8 - flap * 18);
      context.quadraticCurveTo(-16, -3, 0, 0);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(0, 0);
      context.quadraticCurveTo(-16, 21 + flap * 13, -34, 8 + flap * 18);
      context.quadraticCurveTo(-16, 3, 0, 0);
      context.closePath();
      context.fill();
      // Body and ears, red eyes.
      context.beginPath();
      context.ellipse(0, 0, 17, 10, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(10, -8);
      context.lineTo(16, -18);
      context.lineTo(18, -7);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(10, 8);
      context.lineTo(16, 18);
      context.lineTo(18, 7);
      context.closePath();
      context.fill();
      circle(13, -4, 2.5, '#ff5566');
      circle(13, 4, 2.5, '#ff5566');
      context.restore();
    }
    context.globalAlpha = 1;
  }

  function drawWebs(state) {
    for (const web of state.webs) {
      // A rotting web fades with its remaining life.
      const alpha = web.life < 2 ? Math.max(0.15, web.life / 2) : 1;
      context.save();
      context.globalAlpha = alpha;
      glowCircle(web.x, web.y, web.r + 12, 'rgba(220, 230, 255, 0.12)', 'rgba(220, 230, 255, 0)');
      context.strokeStyle = 'rgba(220, 230, 255, 0.55)';
      context.lineWidth = 1.5;
      for (const ring of [0.33, 0.66, 1]) {
        context.beginPath();
        context.arc(web.x, web.y, web.r * ring, 0, Math.PI * 2);
        context.stroke();
      }
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2;
        context.beginPath();
        context.moveTo(web.x, web.y);
        context.lineTo(web.x + Math.cos(angle) * web.r, web.y + Math.sin(angle) * web.r);
        context.stroke();
      }
      // One dew sparkle so the web reads at contact-sheet size.
      circle(web.x + web.r * 0.45, web.y - web.r * 0.3, 2.5, '#ffffff');
      context.restore();
    }
    context.globalAlpha = 1;
  }

  function drawSpiders(state) {
    for (const spider of state.spiders) {
      // The silk thread while the spider descends or climbs away.
      if (spider.mode === 'entering' || spider.mode === 'driven') {
        context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(spider.x, 0);
        context.lineTo(spider.x, spider.y);
        context.stroke();
      }
      if (spider.y < -30) continue;
      context.save();
      context.translate(spider.x, spider.y);
      // Eight legs as two-segment polylines, alternating pairs with the crawl.
      context.strokeStyle = '#1a1030';
      context.lineWidth = 2;
      for (let leg = 0; leg < 8; leg += 1) {
        const side = leg < 4 ? -1 : 1;
        const row = leg % 4;
        const spread = (row - 1.5) * 7;
        const step = Math.sin(spider.legPhase + leg * (Math.PI / 2)) * 2;
        const kneeX = side * 12;
        const kneeY = spread * 0.6 + step;
        const tipX = side * 20;
        const tipY = spread + step;
        context.beginPath();
        context.moveTo(side * 6, spread * 0.4);
        context.lineTo(kneeX, kneeY);
        context.lineTo(tipX, tipY);
        context.stroke();
      }
      // Body with the pale hourglass mark — the tell that this is not a bat.
      context.fillStyle = '#1a1030';
      context.beginPath();
      context.ellipse(0, 0, 14, 10, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e8ecf7';
      context.beginPath();
      context.moveTo(-4, -6);
      context.lineTo(4, -6);
      context.lineTo(0, -1);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(-4, 6);
      context.lineTo(4, 6);
      context.lineTo(0, 1);
      context.closePath();
      context.fill();
      // Two amber eyes.
      circle(7, -4, 2, '#ffb347');
      circle(7, 4, 2, '#ffb347');
      context.restore();
    }
  }

  // One small canvas icon per blessing glyph, drawn at size `s` around
  // (cx, cy). The same code draws the 64 px card glyphs and the 16 px HUD
  // glyphs — a simple shape per blessing, in the garden's own palette.
  function drawGlyph(glyph, cx, cy, s) {
    const k = s / 64;
    context.save();
    context.translate(cx, cy);
    context.scale(k, k);
    context.lineWidth = 3;
    if (glyph === 'wing') {
      context.fillStyle = '#d9ecc4';
      context.beginPath();
      context.ellipse(-8, -12, 20, 10, -0.5, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(6, -10, 20, 10, -0.5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#9db98a';
      context.beginPath();
      context.ellipse(-4, 12, 18, 9, 0.5, 0, Math.PI * 2);
      context.fill();
    } else if (glyph === 'dash') {
      context.strokeStyle = '#ffd76a';
      context.lineWidth = 5;
      for (const row of [-14, 0, 14]) {
        context.beginPath();
        context.moveTo(-16, row - 8);
        context.lineTo(2, row);
        context.lineTo(-16, row + 8);
        context.stroke();
      }
    } else if (glyph === 'halo') {
      context.strokeStyle = '#ffd76a';
      context.lineWidth = 5;
      context.beginPath();
      context.arc(0, 0, 22, 0, Math.PI * 2);
      context.stroke();
      glowCircle(0, 0, 12, 'rgba(255, 233, 168, 0.8)', 'rgba(255, 233, 168, 0)');
      circle(0, 0, 6, '#fff3cf');
    } else if (glyph === 'magnet') {
      context.strokeStyle = '#ff7a5e';
      context.lineWidth = 8;
      context.beginPath();
      context.arc(0, -4, 16, Math.PI, 0);
      context.stroke();
      context.beginPath();
      context.moveTo(-16, -4);
      context.lineTo(-16, 14);
      context.moveTo(16, -4);
      context.lineTo(16, 14);
      context.stroke();
      context.strokeStyle = '#e8ecf7';
      context.lineWidth = 8;
      context.beginPath();
      context.moveTo(-16, 8);
      context.lineTo(-16, 14);
      context.moveTo(16, 8);
      context.lineTo(16, 14);
      context.stroke();
    } else if (glyph === 'shield') {
      context.strokeStyle = '#d9ecc4';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(0, -22);
      context.lineTo(18, -12);
      context.lineTo(18, 4);
      context.quadraticCurveTo(18, 16, 0, 24);
      context.quadraticCurveTo(-18, 16, -18, 4);
      context.lineTo(-18, -12);
      context.closePath();
      context.stroke();
      context.fillStyle = '#ffd76a';
      circle(0, 0, 4, '#ffd76a');
    } else if (glyph === 'silk') {
      context.strokeStyle = '#e8ecf7';
      context.lineWidth = 4;
      context.beginPath();
      context.arc(0, 0, 18, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(0, 0, 10, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(-22, -18);
      context.lineTo(22, 18);
      context.stroke();
    } else if (glyph === 'clock') {
      context.strokeStyle = '#ffd76a';
      context.lineWidth = 4;
      context.beginPath();
      context.arc(0, 0, 20, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(0, -12);
      context.moveTo(0, 0);
      context.lineTo(10, 6);
      context.stroke();
    } else if (glyph === 'twin') {
      glowCircle(-12, 0, 14, 'rgba(255, 233, 168, 0.7)', 'rgba(255, 233, 168, 0)');
      glowCircle(12, 0, 14, 'rgba(255, 233, 168, 0.7)', 'rgba(255, 233, 168, 0)');
      circle(-12, 0, 7, '#fff3cf');
      circle(12, 0, 7, '#fff3cf');
    } else if (glyph === 'bat') {
      context.fillStyle = '#241a33';
      context.beginPath();
      context.moveTo(0, 0);
      context.quadraticCurveTo(-14, -16, -26, -6);
      context.quadraticCurveTo(-12, -2, 0, 0);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(0, 0);
      context.quadraticCurveTo(-14, 16, -26, 6);
      context.quadraticCurveTo(-12, 2, 0, 0);
      context.closePath();
      context.fill();
      context.beginPath();
      context.ellipse(4, 0, 12, 7, 0, 0, Math.PI * 2);
      context.fill();
      circle(12, -3, 2, '#ff5566');
      circle(12, 3, 2, '#ff5566');
    } else if (glyph === 'sun') {
      context.fillStyle = '#ffd76a';
      context.beginPath();
      context.arc(0, 6, 16, Math.PI, 0);
      context.closePath();
      context.fill();
      context.strokeStyle = '#ffd76a';
      context.lineWidth = 3;
      for (let i = 0; i < 5; i += 1) {
        const angle = Math.PI + (i / 4) * Math.PI;
        context.beginPath();
        context.moveTo(Math.cos(angle) * 20, 6 + Math.sin(angle) * 20);
        context.lineTo(Math.cos(angle) * 26, 6 + Math.sin(angle) * 26);
        context.stroke();
      }
    } else if (glyph === 'shears') {
      context.strokeStyle = '#e8ecf7';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(-18, -14);
      context.lineTo(18, 14);
      context.moveTo(-18, 14);
      context.lineTo(18, -14);
      context.stroke();
      context.beginPath();
      context.arc(-20, -18, 5, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.arc(-20, 18, 5, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  // A row of 7 lantern nodes: cleared nights filled gold, the current night
  // gold with a ring, future nights dim. `label` is drawn centred underneath.
  function drawNightMap(cx, y, current, r, gap, label) {
    const total = 6 * gap;
    const x0 = cx - total / 2;
    context.strokeStyle = 'rgba(185, 200, 232, 0.35)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x0, y);
    context.lineTo(x0 + total, y);
    context.stroke();
    for (let i = 0; i < 7; i += 1) {
      const night = i + 1;
      const x = x0 + i * gap;
      if (night < current) {
        circle(x, y, r, '#ffd76a');
      } else if (night === current) {
        circle(x, y, r, '#ffd76a');
        context.strokeStyle = '#ffd76a';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(x, y, r + 4, 0, Math.PI * 2);
        context.stroke();
      } else {
        circle(x, y, r, 'rgba(185, 200, 232, 0.35)');
      }
    }
    if (label) text(label, cx, y + 26, 16, '#c9d4ef', 'center');
  }

  // The same 7 nodes at small scale, right-aligned to endX.
  function drawMiniMap(endX, y, current) {
    const r = 5;
    const gap = 14;
    context.strokeStyle = 'rgba(185, 200, 232, 0.35)';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(endX - 6 * gap, y);
    context.lineTo(endX, y);
    context.stroke();
    for (let i = 0; i < 7; i += 1) {
      const night = i + 1;
      const x = endX - (6 - i) * gap;
      if (night <= current) circle(x, y, r, '#ffd76a');
      else circle(x, y, r, 'rgba(185, 200, 232, 0.35)');
    }
  }

  function drawMoth(state) {
    const moth = state.moth;
    const blink = moth.invuln > 0 && Math.floor(moth.invuln * 10) % 2 === 0;
    if (blink) return;
    context.save();
    context.translate(moth.x, moth.y);
    context.rotate(moth.angle);
    // Glow ring: how full the light meter is.
    if (state.glow > 0.02) {
      context.strokeStyle = 'rgba(255, 215, 106, 0.9)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, 0, 33, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * state.glow);
      context.stroke();
    }
    // Dash readiness: a small gold arc underneath while cooling down.
    if (moth.dashCooldown > 0) {
      context.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, 0, 38, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - moth.dashCooldown / state.modifiers.dashCooldown));
      context.stroke();
    }
    // Wings: pale luna green, flapping; the far wing darker. Drawn larger
    // than the collision radius, like the bats: a clear moth, a fair hitbox.
    const flap = Math.sin(moth.flap) * 0.55;
    context.fillStyle = '#9db98a';
    context.beginPath();
    context.ellipse(-5, -18 - flap * 8, 26, 12, -0.5 - flap * 0.3, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.ellipse(-5, 18 + flap * 8, 26, 12, 0.5 + flap * 0.3, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#d9ecc4';
    context.beginPath();
    context.ellipse(3, -16 - flap * 8, 26, 12, -0.5 - flap * 0.3, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.ellipse(3, 16 + flap * 8, 26, 12, 0.5 + flap * 0.3, 0, Math.PI * 2);
    context.fill();
    // Eyespots on the near wings.
    circle(8, -18 - flap * 8, 3.2, '#7a5ea8');
    circle(8, 18 + flap * 8, 3.2, '#7a5ea8');
    // Body and antennae.
    context.fillStyle = '#f2ead8';
    context.beginPath();
    context.ellipse(0, 0, 15, 6, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#f2ead8';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(14, -3);
    context.quadraticCurveTo(26, -10, 31, -8);
    context.moveTo(14, 3);
    context.quadraticCurveTo(26, 10, 31, 8);
    context.stroke();
    context.restore();
  }

  function drawFx(state) {
    // Fireflies: tiny drifting lights, brighter as they pulse.
    for (const fly of state.fireflies) {
      const glow = 0.25 + 0.55 * Math.abs(Math.sin(fly.phase * 1.4));
      context.globalAlpha = glow;
      circle(fly.x, fly.y, 2.2, '#d8ffb0');
    }
    context.globalAlpha = 1;
    // Drifting light-spores: slow golden motes rising through the garden air.
    for (const mote of state.motes) {
      const glow = 0.2 + 0.4 * Math.abs(Math.sin(mote.phase * 0.9));
      context.globalAlpha = glow;
      circle(mote.x, mote.y, mote.r, '#ffe9b8');
    }
    context.globalAlpha = 1;
    for (const particle of state.particles) {
      const alpha = Math.max(0, particle.life / particle.max);
      context.globalAlpha = alpha;
      circle(particle.x, particle.y, particle.size, particle.color);
    }
    context.globalAlpha = 1;
    for (const note of state.texts) {
      const alpha = Math.max(0, note.life / note.max);
      context.globalAlpha = alpha;
      text(note.text, note.x, note.y, note.size, note.color, 'center');
    }
    context.globalAlpha = 1;
  }

  function drawHud(state) {
    // Score, left; flowers, centre; lives, right.
    text(`SCORE ${state.score.toLocaleString('en-US')}`, 28, HUD_TOP + 22, 26, '#f2ead8', 'left');
    text(`NIGHT ${state.night}`, 28, HUD_TOP + 50, 16, '#b9c8e8', 'left');
    const dotGap = 26;
    const dotsWidth = FLOWER_COUNT * dotGap - dotGap;
    const dotsX = FIELD_WIDTH / 2 - dotsWidth / 2;
    let bloomed = 0;
    state.flowers.forEach((flower, index) => {
      if (flower.bloomed) bloomed += 1;
      circle(dotsX + index * dotGap, HUD_TOP + 18, 8, flower.bloomed ? '#ffd76a' : 'rgba(185, 200, 232, 0.35)');
      if (flower.bloomed) {
        context.strokeStyle = '#ffd76a';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(dotsX + index * dotGap, HUD_TOP + 18, 11, 0, Math.PI * 2);
        context.stroke();
      }
    });
    text(`${bloomed} / ${FLOWER_COUNT} BLOOMED`, FIELD_WIDTH / 2, HUD_TOP + 50, 14, '#b9c8e8', 'center');
    for (let life = 0; life < state.maxLives; life += 1) {
      const x = FIELD_WIDTH - 28 - life * 30;
      context.fillStyle = life < state.lives ? '#d9ecc4' : 'rgba(185, 200, 232, 0.25)';
      context.beginPath();
      context.ellipse(x, HUD_TOP + 16, 10, 6, -0.5, 0, Math.PI * 2);
      context.fill();
    }
    text('LIVES', FIELD_WIDTH - 28 - state.maxLives * 30 - 8, HUD_TOP + 22, 16, '#b9c8e8', 'right');
    // Dawn bar: the whole night draining away, gold to ember red.
    const fraction = Math.max(0, state.dawn / state.nightSeconds);
    context.fillStyle = 'rgba(0, 0, 0, 0.35)';
    context.fillRect(28, HUD_TOP + 62, FIELD_WIDTH - 56, 7);
    context.fillStyle = fraction > 0.33 ? '#ffd76a' : '#ff7a5e';
    context.fillRect(28, HUD_TOP + 62, (FIELD_WIDTH - 56) * fraction, 7);
    text(`DAWN IN ${Math.ceil(state.dawn)}s`, FIELD_WIDTH - 28, HUD_TOP + 50, 14, fraction > 0.33 ? '#b9c8e8' : '#ff9a86', 'right');
    // Owned blessings as a row of small glyphs under the flower dots — the
    // visible trace of the run's choices in the play shot.
    if (state.blessings.length > 0) {
      const glyphGap = 24;
      const glyphsWidth = state.blessings.length * glyphGap - glyphGap;
      const glyphsX = FIELD_WIDTH / 2 - glyphsWidth / 2;
      state.blessings.forEach((id, index) => {
        const blessing = blessingById(id);
        if (blessing) drawGlyph(blessing.glyph, glyphsX + index * glyphGap, HUD_TOP + 82, 16);
      });
    }
    if (state.combo > 1) {
      // The combo lives in the HUD at a fixed spot, never over the moth or
      // over a floating text.
      text(`COMBO x${Math.min(state.combo, 5)}`, 28, HUD_TOP + 100, 18, '#ffd76a', 'left');
    }
  }

  // The pause menu: resume, help, restart, quit. One panel, four exits —
  // a paused game must never trap the player on a single key.
  function drawPauseMenu() {
    const width = 560;
    const height = 340;
    const x = (FIELD_WIDTH - width) / 2;
    const y = (FIELD_HEIGHT - height) / 2;
    context.fillStyle = 'rgba(7, 11, 36, 0.88)';
    context.beginPath();
    context.roundRect(x, y, width, height, 18);
    context.fill();
    context.strokeStyle = 'rgba(255, 215, 106, 0.5)';
    context.lineWidth = 2;
    context.stroke();
    text('PAUSED', FIELD_WIDTH / 2, y + 64, 44, '#f2ead8', 'center', TITLE_FONT);
    text('The garden waits for you.', FIELD_WIDTH / 2, y + 106, 20, '#c9d4ef', 'center');
    text('P or Space — keep flying', FIELD_WIDTH / 2, y + 168, 20, '#e8ecf7', 'center');
    text('H — how to play', FIELD_WIDTH / 2, y + 202, 20, '#e8ecf7', 'center');
    text('R — restart the run', FIELD_WIDTH / 2, y + 236, 20, '#e8ecf7', 'center');
    text('Q — quit to the title', FIELD_WIDTH / 2, y + 270, 20, '#e8ecf7', 'center');
    text('M — sound on / off', FIELD_WIDTH / 2, y + 304, 18, '#8fa0c4', 'center');
  }

  function drawTitle(state, best, campaign) {
    const pulse = 0.6 + 0.4 * Math.sin(state.elapsed * 2.4);
    text('MOTHLIGHT', FIELD_WIDTH / 2, 240, 92, '#f2ead8', 'center', TITLE_FONT);
    text('the last night of the luna moth', FIELD_WIDTH / 2, 282, 24, '#ffd76a', 'center', TITLE_FONT);
    text('Gather light. Bloom all 7 moonflowers before dawn.', FIELD_WIDTH / 2, 360, 22, '#e8ecf7', 'center');
    text('Steer with the mouse or arrow keys — Space or click to dash through bats.', FIELD_WIDTH / 2, 392, 20, '#c9d4ef', 'center');
    text('A full glow lets you bloom a flower. Three lives. Dawn comes in 90 seconds.', FIELD_WIDTH / 2, 424, 20, '#c9d4ef', 'center');
    context.globalAlpha = pulse;
    text('CLICK OR PRESS SPACE TO BEGIN', FIELD_WIDTH / 2, 500, 24, '#ffd76a', 'center');
    context.globalAlpha = 1;
    // The help button, top right — a real button, not just a key hint.
    context.strokeStyle = 'rgba(255, 215, 106, 0.7)';
    context.lineWidth = 2;
    context.beginPath();
    context.roundRect(HELP_BUTTON.x, HELP_BUTTON.y, HELP_BUTTON.w, HELP_BUTTON.h, 10);
    context.stroke();
    text('HOW TO PLAY', HELP_BUTTON.x + HELP_BUTTON.w / 2, HELP_BUTTON.y + 27, 17, '#ffd76a', 'center');
    if (best > 0) text(`Best score  ${best.toLocaleString('en-US')}`, FIELD_WIDTH / 2, 548, 18, '#b9c8e8', 'center');
    // The campaign map: seven lantern nights, the current one lit. A fresh
    // run starts at night 1; the line underneath names the night ahead.
    drawNightMap(FIELD_WIDTH / 2, 590, state.night, 9, 60, `Night ${state.night} — ${NIGHTS[state.night].name}`);
    if (campaign && campaign.bestNight > 0) {
      text(`Furthest night (all time): ${campaign.bestNight}`, FIELD_WIDTH / 2, 640, 16, '#8fa0c4', 'center');
    }
    text('P pause   ·   M sound   ·   R restart   ·   H how to play', FIELD_WIDTH / 2, 664, 16, '#8fa0c4', 'center');
    // The records line: the last completed run and the all-time totals, so
    // the title remembers the player even between visits. The totals fall
    // back to 0 when a campaign record predates them (or a staged scene
    // omits them), so the line never reads "undefined".
    if (campaign && campaign.runs > 0) {
      const last = campaign.lastRun
        ? `Last run — night ${campaign.lastRun.night} · ${campaign.lastRun.score.toLocaleString('en-US')} · grade ${campaign.lastRun.grade}`
        : 'No completed run yet';
      text(`${last}   ·   All time — ${(campaign.totalBlooms | 0)} blooms · ${(campaign.totalOrbs | 0)} orbs`, FIELD_WIDTH / 2, 688, 15, '#8fa0c4', 'center');
    }
  }

  // The help screen: the rules, the controls, the dangers, and the whole
  // blessing codex in one place. Two columns on a dimmed garden; every line
  // comes from the game's own numbers (the BLESSINGS table, the NIGHTS
  // table), so it can never drift from the rules.
  function drawHelp() {
    context.fillStyle = 'rgba(7, 11, 36, 0.55)';
    context.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
    const x = 60;
    const y = 28;
    const width = FIELD_WIDTH - 120;
    const height = FIELD_HEIGHT - 56;
    context.fillStyle = 'rgba(7, 11, 36, 0.88)';
    context.beginPath();
    context.roundRect(x, y, width, height, 18);
    context.fill();
    context.strokeStyle = 'rgba(255, 215, 106, 0.5)';
    context.lineWidth = 2;
    context.stroke();
    text('HOW TO PLAY', FIELD_WIDTH / 2, 88, 40, '#f2ead8', 'center', TITLE_FONT);
    // Left column: goal, controls, dangers, campaign.
    const lx = 100;
    text('THE GOAL', lx, 132, 20, '#ffd76a', 'left');
    text('Bloom all 7 moonflowers before dawn.', lx, 158, 17, '#e8ecf7', 'left');
    text('Gather light orbs — 4 fill the glow ring,', lx, 180, 17, '#e8ecf7', 'left');
    text('then touch a flower to bloom it (+500).', lx, 202, 17, '#e8ecf7', 'left');
    text('CONTROLS', lx, 244, 20, '#ffd76a', 'left');
    text('Mouse or arrows / WASD — steer the moth', lx, 270, 17, '#e8ecf7', 'left');
    text('Space or click — dash (scares bats, tears webs)', lx, 292, 17, '#e8ecf7', 'left');
    text('P — pause · M — sound · R — restart the run', lx, 314, 17, '#e8ecf7', 'left');
    text("THE GARDEN'S DANGERS", lx, 356, 20, '#ffd76a', 'left');
    text('Bats — a touch costs 1 of 3 lives. Dash', lx, 382, 17, '#e8ecf7', 'left');
    text('through one to scare it away (+25).', lx, 404, 17, '#e8ecf7', 'left');
    text('Web-spider — lays sticky webs on flowers.', lx, 426, 17, '#e8ecf7', 'left');
    text('A webbed moth flies at half speed. Dash', lx, 448, 17, '#e8ecf7', 'left');
    text('to tear the web (+15) or drive the spider', lx, 470, 17, '#e8ecf7', 'left');
    text("off (+25). A spider's touch costs no life.", lx, 492, 17, '#e8ecf7', 'left');
    text('At 45 seconds the bats stir — +2 bats.', lx, 514, 17, '#e8ecf7', 'left');
    text('THE CAMPAIGN', lx, 556, 20, '#ffd76a', 'left');
    text('Seven nights. Win one, choose a blessing,', lx, 582, 17, '#e8ecf7', 'left');
    text('then fly the next — harder. Lose, and the', lx, 604, 17, '#e8ecf7', 'left');
    text('blessings are gone. Night 7 is the last dawn.', lx, 626, 17, '#e8ecf7', 'left');
    text('SCORING — orb +10 · bloom +500 · scare +25 · tear +15 · combo ×5', lx, 650, 15, '#8fa0c4', 'left');
    // Right column: the blessing codex — all eleven, with glyphs.
    const rx = 660;
    text('BLESSINGS — CHOOSE ONE EACH NIGHT', rx, 132, 20, '#ffd76a', 'left');
    BLESSINGS.forEach((blessing, index) => {
      const by = 164 + index * 42;
      drawGlyph(blessing.glyph, rx + 12, by, 22);
      text(blessing.name, rx + 32, by + 6, 17, '#f2ead8', 'left');
      text(blessing.effect, rx + 32, by + 28, 15, '#8fa0c4', 'left');
    });
    text('H or Esc — back   ·   Space — begin', FIELD_WIDTH / 2, 676, 18, '#ffd76a', 'center');
  }

  // The results panel: title, subtitle, stars, grade, five stats in two
  // columns, and the restart prompts. One fixed layout for a win and a loss,
  // so no line ever lands on another. A night-7 win is the campaign victory
  // (run totals instead of the night's stats); a loss grows by two lines for
  // the campaign summary.
  function drawResults(state, best, won, campaign) {
    const blooms = state.flowers.filter((flower) => flower.bloomed).length;
    const finalBest = Math.max(best, state.score);
    const grade = gradeFor(state, won);
    const stars = starsFor(state, won);
    const campaignWin = won && state.night >= 7;
    const extraLines = won ? 0 : 2;
    const width = 680;
    const height = 440 + extraLines * 32;
    const x = (FIELD_WIDTH - width) / 2;
    const y = (FIELD_HEIGHT - height) / 2;
    context.fillStyle = 'rgba(7, 11, 36, 0.82)';
    context.beginPath();
    context.roundRect(x, y, width, height, 18);
    context.fill();
    context.strokeStyle = 'rgba(255, 215, 106, 0.5)';
    context.lineWidth = 2;
    context.stroke();
    const title = campaignWin ? 'THE LAST DAWN!' : won ? 'DAWN BLOOMS!' : 'THE NIGHT ENDS';
    text(title, FIELD_WIDTH / 2, y + 62, 44, '#f2ead8', 'center', TITLE_FONT);
    const subtitle = campaignWin
      ? 'Seven nights. Seven blooms. The last dawn breaks.'
      : won
        ? `All ${FLOWER_COUNT} moonflowers bloomed before dawn.`
        : state.cause === 'dawn'
          ? `Dawn came with ${FLOWER_COUNT - blooms} flower${FLOWER_COUNT - blooms === 1 ? '' : 's'} still closed.`
          : 'The night took the moth.';
    text(subtitle, FIELD_WIDTH / 2, y + 98, 20, '#c9d4ef', 'center');
    let starsText = '';
    for (let i = 0; i < 3; i += 1) starsText += i < stars ? '★ ' : '☆ ';
    text(starsText.trim(), FIELD_WIDTH / 2, y + 140, 30, '#ffd76a', 'center');
    text(`GRADE  ${grade}`, FIELD_WIDTH / 2, y + 180, 28, '#ffd76a', 'center');
    context.strokeStyle = 'rgba(255, 215, 106, 0.25)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x + 60, y + 200);
    context.lineTo(x + width - 60, y + 200);
    context.stroke();
    const stats = campaignWin
      ? [
        ['Orbs gathered', String(state.campaign.orbs)],
        ['Moonflowers bloomed', String(state.campaign.blooms)],
        ['Bats scared', String(state.campaign.scares)],
        ['Dashes', String(state.campaign.dashes)],
        ['Best score', finalBest.toLocaleString('en-US')],
      ]
      : [
        ['Orbs gathered', String(state.stats.orbs)],
        ['Moonflowers bloomed', `${blooms} / ${FLOWER_COUNT}`],
        ['Bats scared', String(state.stats.scares)],
        ['Dashes', String(state.stats.dashes)],
        ['Best score', finalBest.toLocaleString('en-US')],
      ];
    stats.forEach(([label, value], index) => {
      const rowY = y + 232 + index * 30;
      text(label, x + 90, rowY, 20, '#c9d4ef', 'left');
      text(value, x + width - 90, rowY, 20, '#f2ead8', 'right');
    });
    if (!won) {
      // The run arc, under the stats: what this run cleared and held, and
      // how far any run has ever reached.
      const summaryY = y + 232 + 5 * 30 + 6;
      text(`Nights cleared: ${state.night - 1} of 7  ·  Blessings held: ${state.blessings.length}`, FIELD_WIDTH / 2, summaryY, 18, '#c9d4ef', 'center');
      text(`Furthest night (all time): ${campaign ? campaign.bestNight : state.night}`, FIELD_WIDTH / 2, summaryY + 30, 18, '#c9d4ef', 'center');
    }
    if (campaignWin) {
      text('Press Space to return to the title', FIELD_WIDTH / 2, y + height - 42, 20, '#ffd76a', 'center');
    } else if (won) {
      text('Press Space for the next night', FIELD_WIDTH / 2, y + height - 56, 20, '#ffd76a', 'center');
      text('or press R to fly again', FIELD_WIDTH / 2, y + height - 28, 20, '#ffd76a', 'center');
    } else {
      text('Press Space or click to fly again', FIELD_WIDTH / 2, y + height - 42, 20, '#ffd76a', 'center');
    }
  }

  // The between-night draft: the win screen extended, not a new screen
  // competing for a screenshot slot. The win garden shows through a dim
  // overlay; on top, the night's results strip, three blessing cards, the
  // owned row, and a footer with the next night's preview.
  function drawDraft(state, best, campaign) {
    const draft = state.draft;
    const offer = draft ? draft.offer.map((id) => blessingById(id)).filter(Boolean) : [];
    const next = Math.min(7, state.night + 1);
    const grade = gradeFor(state, true);
    const stars = starsFor(state, true);
    const finalBest = Math.max(best, state.score);

    context.fillStyle = 'rgba(7, 11, 36, 0.55)';
    context.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);

    // Top strip: what the night just gave.
    text(`NIGHT ${state.night} CLEARED`, FIELD_WIDTH / 2, 76, 40, '#f2ead8', 'center', TITLE_FONT);
    let starsText = '';
    for (let i = 0; i < 3; i += 1) starsText += i < stars ? '★ ' : '☆ ';
    text(`${starsText.trim()}   GRADE ${grade}   ·   Score ${state.score.toLocaleString('en-US')}   ·   Best ${finalBest.toLocaleString('en-US')}`, FIELD_WIDTH / 2, 112, 20, '#ffd76a', 'center');

    // Heading.
    text('CHOOSE A BLESSING', FIELD_WIDTH / 2, 185, 30, '#ffd76a', 'center');
    text('One gift for the night ahead — the garden remembers your choice.', FIELD_WIDTH / 2, 212, 18, '#c9d4ef', 'center');

    // Three cards.
    offer.forEach((blessing, index) => {
      const isHighlight = draft && draft.highlight === index;
      const isPicked = draft && draft.picked === blessing.id;
      const lift = isHighlight ? -4 : 0;
      const x = DRAFT_CARD_X + index * (DRAFT_CARD_W + DRAFT_CARD_GAP);
      const y = DRAFT_CARD_Y + lift;
      context.fillStyle = 'rgba(7, 11, 36, 0.85)';
      context.beginPath();
      context.roundRect(x, y, DRAFT_CARD_W, DRAFT_CARD_H, 16);
      context.fill();
      context.strokeStyle = isPicked || isHighlight ? '#ffd76a' : 'rgba(255, 215, 106, 0.5)';
      context.lineWidth = isPicked || isHighlight ? 3 : 2;
      context.stroke();
      text(String(index + 1), x + DRAFT_CARD_W - 24, y + 28, 16, '#8fa0c4', 'center');
      drawGlyph(blessing.glyph, x + DRAFT_CARD_W / 2, y + 95, 64);
      text(blessing.name, x + DRAFT_CARD_W / 2, y + 150, 22, '#f2ead8', 'center');
      const effectLines = wrapText(blessing.effect, DRAFT_CARD_W - 48, 18);
      effectLines.slice(0, 2).forEach((line, lineIndex) => {
        text(line, x + DRAFT_CARD_W / 2, y + 188 + lineIndex * 24, 18, '#ffd76a', 'center');
      });
      text(blessing.flavour, x + DRAFT_CARD_W / 2, y + 250, 16, '#8fa0c4', 'center', UI_FONT, 'italic');
    });

    // Owned row.
    const ownedNames = state.blessings.map((id) => {
      const blessing = blessingById(id);
      return blessing ? blessing.name : id;
    });
    text(
      ownedNames.length > 0 ? `Your blessings: ${ownedNames.join(' · ')}` : 'Your blessings: none yet — choose well.',
      FIELD_WIDTH / 2, 585, 16, '#8fa0c4', 'center',
    );

    // Footer: how to pick, and the next night's preview (mini map + modifier).
    if (draft && draft.picked) {
      const picked = blessingById(draft.picked);
      text(`${picked ? picked.name : draft.picked} chosen — press Space to begin Night ${next}`, 100, 640, 18, '#ffd76a', 'left');
    } else {
      text('Press 1, 2 or 3 — or click a card. Space confirms.', 100, 640, 18, '#ffd76a', 'left');
    }
    const nextText = `Next: Night ${next} — ${NIGHTS[next].preview}`;
    context.font = font(16, UI_FONT);
    const nextWidth = context.measureText(nextText).width;
    const mapEndX = FIELD_WIDTH - 100 - nextWidth - 20;
    drawMiniMap(mapEndX, 634, next);
    text(nextText, FIELD_WIDTH - 100, 640, 16, '#ffd76a', 'right');
    // The next night's numbers, so the choice is informed: how fast the
    // bats will be, how many at once, how many spiders, how often webs come.
    const nextTable = NIGHTS[next];
    const nextDetail = `Bats ×${nextTable.batSpeed.toFixed(2)} · up to ${nextTable.batEnd} at once · ${nextTable.spiders} ${nextTable.spiders === 1 ? 'spider' : 'spiders'} · webs every ${nextTable.webEvery} s`;
    text(nextDetail, FIELD_WIDTH - 100, 664, 15, '#8fa0c4', 'right');
  }

  /** Paint one frame: the garden, then the HUD or a screen over it. */
  function draw(state, screen, best, campaign) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#070b24';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    const sky = skyFor(state.dawn, state.nightSeconds);
    drawSky(state, sky);
    drawFlowers(state);
    drawWebs(state);
    drawSpiders(state);
    drawOrbs(state);
    drawBats(state);
    drawMoth(state);
    drawFx(state);
    // The night-start banner, only while flying: the campaign's shape made
    // legible inside play, fading out over its first three seconds.
    if (screen === SCREEN_PLAY && state.nightBanner.t > 0) {
      context.globalAlpha = Math.min(1, state.nightBanner.t);
      text(state.nightBanner.text, FIELD_WIDTH / 2, 170, 30, '#ffd76a', 'center', TITLE_FONT);
      context.globalAlpha = 1;
    }
    // The tutorial hint, one line under the HUD while it lasts, fading out
    // with its timer. Only while flying — never over a menu or a panel.
    if (screen === SCREEN_PLAY && state.hint.t > 0 && state.hint.text) {
      context.globalAlpha = Math.min(1, state.hint.t);
      text(state.hint.text, FIELD_WIDTH / 2, 132, 20, '#ffd76a', 'center');
      context.globalAlpha = 1;
    }
    if (state.flash > 0) {
      context.globalAlpha = Math.min(0.55, state.flash);
      context.fillStyle = state.flashColor;
      context.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
      context.globalAlpha = 1;
    }
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best, campaign);
      return;
    }
    if (screen === SCREEN_HELP) {
      drawHelp();
      return;
    }
    // The draft is a full screen with its own results strip — the HUD behind
    // it (flower dots, dawn bar) collides with the strip's title, so it is
    // not drawn here. The win and game-over screens keep the HUD: it is the
    // run's final state, and the panel sits clear of it.
    if (screen !== SCREEN_DRAFT) drawHud(state);
    if (screen === SCREEN_PAUSED) drawPauseMenu();
    else if (screen === SCREEN_OVER) drawResults(state, best, false, campaign);
    else if (screen === SCREEN_WIN) drawResults(state, best, true, campaign);
    else if (screen === SCREEN_DRAFT) drawDraft(state, best, campaign);
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    toField(clientX, clientY, rectWidth, rectHeight) {
      return {
        x: (clientX / rectWidth) * FIELD_WIDTH,
        y: (clientY / rectHeight) * FIELD_HEIGHT,
      };
    },
  };
}
