// Keyboard, mouse and touch. Held keys and the pointer give a steering target;
// one-shot presses (confirm, pause, restart, mute, dash) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost or counted
// twice. Pointer coordinates are reported in the game's logical 1280x720 field.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_MUTE = 8;
export const ACTION_DASH = 16;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas, toField) {
  const keys = { up: false, down: false, left: false, right: false };
  const pointer = { x: 640, y: 360, down: false, seen: false };
  let actions = 0;

  function mark(code, event) {
    if (UP.has(code)) keys.up = true;
    else if (DOWN.has(code)) keys.down = true;
    else if (LEFT.has(code)) keys.left = true;
    else if (RIGHT.has(code)) keys.right = true;
    else if (CONFIRM.has(code)) {
      if (!event.repeat) {
        actions |= ACTION_CONFIRM;
        // Space is also the dash: a tap while flying bursts forward.
        if (code === 'Space') actions |= ACTION_DASH;
      }
    } else if (PAUSE.has(code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RESTART.has(code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (MUTE.has(code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else return false;
    return true;
  }

  window.addEventListener('keydown', (event) => {
    if (mark(event.code, event)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) keys.up = false;
    else if (DOWN.has(event.code)) keys.down = false;
    else if (LEFT.has(event.code)) keys.left = false;
    else if (RIGHT.has(event.code)) keys.right = false;
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    keys.up = false;
    keys.down = false;
    keys.left = false;
    keys.right = false;
    pointer.down = false;
  });

  function trackPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const point = toField(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
    pointer.x = point.x;
    pointer.y = point.y;
    pointer.seen = true;
  }
  canvas.addEventListener('pointermove', trackPointer);
  canvas.addEventListener('pointerdown', (event) => {
    trackPointer(event);
    pointer.down = true;
    actions |= ACTION_CONFIRM | ACTION_DASH;
  });
  canvas.addEventListener('pointerup', () => {
    pointer.down = false;
  });
  canvas.addEventListener('pointerleave', () => {
    pointer.down = false;
  });

  return {
    // Normalised keyboard steering, or null when no arrow/WASD key is held.
    keySteer() {
      const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
      if (x === 0 && y === 0) return null;
      const length = Math.hypot(x, y);
      return { x: x / length, y: y / length };
    },
    pointer() {
      return pointer;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
