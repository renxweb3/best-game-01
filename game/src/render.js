// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the night
// colour. Everything is drawn in canvas: a gradient sky that deepens as dawn nears, a
// glowing moon, a garden silhouette, the moth, the orbs, the bats and the moonflowers.
import {
  BAT, FIELD_HEIGHT, FIELD_WIDTH, FLOWER_COUNT, MOTH, NIGHT_SECONDS, ORB, SKY, START_LIVES,
} from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const TITLE_FONT = 'Georgia, "Times New Roman", serif';
const UI_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const HUD_TOP = 18;

function blend(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const mixed = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${mixed[0]},${mixed[1]},${mixed[2]})`;
}

function skyFor(dawnLeft) {
  const fraction = dawnLeft / NIGHT_SECONDS;
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

  function text(value, x, y, size, color, align, family) {
    context.font = font(size, family ?? UI_FONT);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
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
    // Stars, twinkling on their own phase.
    for (const star of state.stars) {
      const alpha = sky.stars * (0.4 + 0.6 * Math.abs(Math.sin(state.elapsed * 1.5 + star.tw)));
      context.globalAlpha = alpha;
      circle(star.x, star.y, star.r, '#ffffff');
    }
    context.globalAlpha = 1;
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
  }

  function drawFlowers(state) {
    for (const flower of state.flowers) {
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
        // Open bloom: five pink petals around a gold heart, gently breathing.
        const breathe = 1 + Math.sin(state.elapsed * 2 + flower.phase) * 0.08;
        for (let petal = 0; petal < 5; petal += 1) {
          const angle = (petal / 5) * Math.PI * 2 - Math.PI / 2;
          const px = x + Math.cos(angle) * 15 * breathe;
          const py = y + Math.sin(angle) * 15 * breathe;
          context.fillStyle = '#ffb7e8';
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
    }
  }

  function drawOrbs(state) {
    for (const orb of state.orbs) {
      const blink = orb.life < 3 ? (Math.floor(orb.life * 6) % 2 === 0 ? 0.35 : 1) : 1;
      const bob = Math.sin(orb.phase) * 3;
      context.globalAlpha = blink;
      glowCircle(orb.x, orb.y + bob, 30, 'rgba(255, 233, 168, 0.55)', 'rgba(255, 233, 168, 0)');
      circle(orb.x, orb.y + bob, 9, '#fff3cf');
      circle(orb.x, orb.y + bob, 4.5, '#ffffff');
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
      // Wings, flapping.
      context.beginPath();
      context.moveTo(0, 0);
      context.quadraticCurveTo(-12, -16 - flap * 10, -26, -6 - flap * 14);
      context.quadraticCurveTo(-12, -2, 0, 0);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(0, 0);
      context.quadraticCurveTo(-12, 16 + flap * 10, -26, 6 + flap * 14);
      context.quadraticCurveTo(-12, 2, 0, 0);
      context.closePath();
      context.fill();
      // Body and ears, red eyes.
      context.beginPath();
      context.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(8, -6);
      context.lineTo(12, -14);
      context.lineTo(14, -5);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(8, 6);
      context.lineTo(12, 14);
      context.lineTo(14, 5);
      context.closePath();
      context.fill();
      circle(10, -3, 2, '#ff5566');
      circle(10, 3, 2, '#ff5566');
      context.restore();
    }
    context.globalAlpha = 1;
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
      context.arc(0, 0, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * state.glow);
      context.stroke();
    }
    // Dash readiness: a small gold arc underneath while cooling down.
    if (moth.dashCooldown > 0) {
      context.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, 0, 31, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - moth.dashCooldown / 1.2));
      context.stroke();
    }
    // Wings: pale luna green, flapping; the far wing darker.
    const flap = Math.sin(moth.flap) * 0.55;
    context.fillStyle = '#9db98a';
    context.beginPath();
    context.ellipse(-4, -14 - flap * 6, 20, 9, -0.5 - flap * 0.3, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.ellipse(-4, 14 + flap * 6, 20, 9, 0.5 + flap * 0.3, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#d9ecc4';
    context.beginPath();
    context.ellipse(2, -12 - flap * 6, 20, 9, -0.5 - flap * 0.3, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.ellipse(2, 12 + flap * 6, 20, 9, 0.5 + flap * 0.3, 0, Math.PI * 2);
    context.fill();
    // Eyespots on the near wings.
    circle(6, -14 - flap * 6, 2.5, '#7a5ea8');
    circle(6, 14 + flap * 6, 2.5, '#7a5ea8');
    // Body and antennae.
    context.fillStyle = '#f2ead8';
    context.beginPath();
    context.ellipse(0, 0, 12, 4.5, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#f2ead8';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(11, -2);
    context.quadraticCurveTo(20, -8, 24, -6);
    context.moveTo(11, 2);
    context.quadraticCurveTo(20, 8, 24, 6);
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
    for (let life = 0; life < START_LIVES; life += 1) {
      const x = FIELD_WIDTH - 28 - life * 30;
      context.fillStyle = life < state.lives ? '#d9ecc4' : 'rgba(185, 200, 232, 0.25)';
      context.beginPath();
      context.ellipse(x, HUD_TOP + 16, 10, 6, -0.5, 0, Math.PI * 2);
      context.fill();
    }
    text('LIVES', FIELD_WIDTH - 28 - START_LIVES * 30 - 8, HUD_TOP + 22, 16, '#b9c8e8', 'right');
    // Dawn bar: the whole night draining away, gold to ember red.
    const fraction = Math.max(0, state.dawn / NIGHT_SECONDS);
    context.fillStyle = 'rgba(0, 0, 0, 0.35)';
    context.fillRect(28, HUD_TOP + 62, FIELD_WIDTH - 56, 7);
    context.fillStyle = fraction > 0.33 ? '#ffd76a' : '#ff7a5e';
    context.fillRect(28, HUD_TOP + 62, (FIELD_WIDTH - 56) * fraction, 7);
    text(fraction > 0.33 ? 'DAWN IN' : 'DAWN IS COMING', FIELD_WIDTH - 28, HUD_TOP + 50, 14, fraction > 0.33 ? '#b9c8e8' : '#ff9a86', 'right');
    if (state.combo > 1) {
      text(`COMBO x${Math.min(state.combo, 5)}`, state.moth.x, state.moth.y - 34, 20, '#ffd76a', 'center');
    }
  }

  function drawPanel(title, lines, prompt) {
    const width = 640;
    const height = 150 + lines.length * 32 + 64;
    const x = (FIELD_WIDTH - width) / 2;
    const y = (FIELD_HEIGHT - height) / 2;
    context.fillStyle = 'rgba(7, 11, 36, 0.82)';
    context.beginPath();
    context.roundRect(x, y, width, height, 18);
    context.fill();
    context.strokeStyle = 'rgba(255, 215, 106, 0.5)';
    context.lineWidth = 2;
    context.stroke();
    text(title, FIELD_WIDTH / 2, y + 64, 44, '#f2ead8', 'center', TITLE_FONT);
    lines.forEach((line, index) => {
      text(line, FIELD_WIDTH / 2, y + 112 + index * 32, 20, '#c9d4ef', 'center');
    });
    text(prompt, FIELD_WIDTH / 2, y + height - 28, 20, '#ffd76a', 'center');
  }

  function drawTitle(state, best) {
    const pulse = 0.6 + 0.4 * Math.sin(state.elapsed * 2.4);
    text('MOTHLIGHT', FIELD_WIDTH / 2, 240, 92, '#f2ead8', 'center', TITLE_FONT);
    text('the last night of the luna moth', FIELD_WIDTH / 2, 282, 24, '#ffd76a', 'center', TITLE_FONT);
    text('Gather light. Bloom all 7 moonflowers before dawn.', FIELD_WIDTH / 2, 360, 22, '#e8ecf7', 'center');
    text('Steer with the mouse or arrow keys — Space or click to dash through bats.', FIELD_WIDTH / 2, 392, 20, '#c9d4ef', 'center');
    text('A full glow lets you bloom a flower. Three lives. Dawn comes in 90 seconds.', FIELD_WIDTH / 2, 424, 20, '#c9d4ef', 'center');
    context.globalAlpha = pulse;
    text('CLICK OR PRESS SPACE TO BEGIN', FIELD_WIDTH / 2, 500, 24, '#ffd76a', 'center');
    context.globalAlpha = 1;
    if (best > 0) text(`Best score  ${best.toLocaleString('en-US')}`, FIELD_WIDTH / 2, 548, 18, '#b9c8e8', 'center');
    text('P pause   ·   M sound   ·   R restart', FIELD_WIDTH / 2, 664, 16, '#8fa0c4', 'center');
  }

  function drawEnd(state, best, won) {
    const blooms = state.flowers.filter((flower) => flower.bloomed).length;
    const lines = won
      ? [
          `All ${FLOWER_COUNT} moonflowers bloomed before dawn.`,
          `Score ${state.score.toLocaleString('en-US')}  ·  Orbs ${state.stats.orbs}  ·  Bats scared ${state.stats.scares}`,
          `Best ${Math.max(best, state.score).toLocaleString('en-US')}`,
        ]
      : [
          state.cause === 'dawn'
            ? `Dawn came with ${FLOWER_COUNT - blooms} flower${FLOWER_COUNT - blooms === 1 ? '' : 's'} still closed.`
            : 'The night took the moth.',
          `Score ${state.score.toLocaleString('en-US')}  ·  Blooms ${blooms} / ${FLOWER_COUNT}  ·  Orbs ${state.stats.orbs}`,
          `Best ${Math.max(best, state.score).toLocaleString('en-US')}`,
        ];
    const title = won ? 'DAWN BLOOMS!' : 'THE NIGHT ENDS';
    const prompt = won ? 'Press Space for the next night — or R to fly again' : 'Press Space or click to fly again';
    drawPanel(title, lines, prompt);
  }

  /** Paint one frame: the garden, then the HUD or a screen over it. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#070b24';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    const sky = skyFor(state.dawn);
    drawSky(state, sky);
    drawFlowers(state);
    drawOrbs(state);
    drawBats(state);
    drawMoth(state);
    drawFx(state);
    if (state.flash > 0) {
      context.globalAlpha = Math.min(0.55, state.flash);
      context.fillStyle = state.flashColor;
      context.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
      context.globalAlpha = 1;
    }
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) drawPanel('PAUSED', ['The garden waits for you.'], 'Press P to keep flying');
    else if (screen === SCREEN_OVER) drawEnd(state, best, false);
    else if (screen === SCREEN_WIN) drawEnd(state, best, true);
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
