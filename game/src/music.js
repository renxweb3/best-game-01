// The night music: a slow generative sequencer, one job — keep a quiet tune
// under the game. Four chords (Am9, Fmaj7, Cmaj7, G6) under a pentatonic
// melody whose pattern is seeded by the night, so every night has its own
// tune. Nights 5–7 drop the melody an octave and lose the harmony voice:
// the garden sounds darker when it gets harder. In the last 15 seconds a
// high shimmer joins in, so the player hears dawn coming.
//
// No audio files, no network: every note is a WebAudio oscillator, scheduled
// a little ahead of the clock. It shares the SFX module's AudioContext (via
// peekContext) so there is one clock, but it keeps its own gain, so the
// music level is independent of the effects level. Mute is a gain change in
// both modules, so muting silences the music too. Everything is wrapped so
// a headless run without audio hardware never breaks the game: if there is
// no context, or it is not running, the scheduler simply waits.

const CHORDS = [
  { root: 110.0, tones: [220.0, 261.63, 329.63, 392.0] }, // Am9
  { root: 87.31, tones: [174.61, 220.0, 261.63, 329.63] }, // Fmaj7
  { root: 130.81, tones: [261.63, 329.63, 392.0, 493.88] }, // Cmaj7
  { root: 98.0, tones: [196.0, 246.94, 293.66, 392.0] }, // G6
];
// A minor pentatonic, two octaves' worth of steps to pick from.
const MELODY = [440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
const BEAT = 0.62; // seconds per step; a chord lasts 8 steps (~5 s).
const PATTERN_STEPS = 32;

// A tiny seeded generator, so a night's melody is stable: night 3 always
// hums the same tune, and the next night hums a different one.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createMusic(peekContext) {
  let timer = null;
  let started = false;
  let muted = false;
  let night = 1;
  let dawn = false;
  let musicGain = null;
  let nextBeatTime = null;
  let step = 0;
  let pattern = [];

  function buildPattern(seedNight) {
    const rand = mulberry32(seedNight * 2654435761 + 97);
    pattern = [];
    for (let i = 0; i < PATTERN_STEPS; i += 1) {
      if (rand() < 0.45) {
        pattern.push(-1); // rest: the melody breathes.
      } else {
        // Weighted toward the middle of the scale, so the tune wanders
        // instead of jumping between the extremes.
        const pick = Math.floor(((rand() + rand()) / 2) * MELODY.length);
        pattern.push(pick);
      }
    }
  }

  function ensureGain(context) {
    if (musicGain) return musicGain;
    try {
      musicGain = context.createGain();
      musicGain.gain.value = muted ? 0 : 0.22;
      musicGain.connect(context.destination);
    } catch {
      musicGain = null;
    }
    return musicGain;
  }

  function note(context, frequency, at, length, volume, type = 'triangle') {
    try {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(volume, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, at + length);
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start(at);
      osc.stop(at + length + 0.05);
    } catch {
      // Music is garnish: never let it stop the game.
    }
  }

  function scheduleStep(context, when) {
    const chord = CHORDS[Math.floor(step / 8) % CHORDS.length];
    const inChord = step % 8;
    const dark = night >= 5;
    // A new chord: its tones as one long soft pad, and the root as a bass.
    if (inChord === 0) {
      for (const tone of chord.tones) note(context, tone, when, 5.4, 0.03, 'sine');
      note(context, chord.root, when, 1.4, 0.06, 'sine');
    }
    if (inChord === 4) note(context, chord.root, when, 1.4, 0.05, 'sine');
    // The melody: the night's pattern, one step at a time. Nights 5–7 play
    // it an octave lower; nights 3–4 add a quiet third above every fourth
    // played note.
    const pick = pattern[step % PATTERN_STEPS];
    if (pick >= 0) {
      const frequency = MELODY[pick] * (dark ? 0.5 : 1);
      note(context, frequency, when, 0.9, 0.07);
      note(context, frequency * 2, when, 0.4, 0.02, 'sine');
      if (!dark && night >= 3 && step % 4 === 0 && pick + 2 < MELODY.length) {
        note(context, MELODY[pick + 2], when, 0.7, 0.03);
      }
    }
    // Dawn mode: a high shimmer on every step, so the last seconds glitter.
    if (dawn) note(context, MELODY[MELODY.length - 1] * 2, when, 0.5, 0.025, 'sine');
  }

  function tick() {
    let context = null;
    try {
      context = peekContext();
    } catch {
      context = null;
    }
    if (!context || context.state !== 'running' || !ensureGain(context)) {
      // No clock yet, or the tab is hidden, or the game is muted by
      // suspension: wait. The anchor is reset so nothing plays catch-up
      // when the context runs again.
      nextBeatTime = null;
      return;
    }
    if (nextBeatTime === null || nextBeatTime < context.currentTime - 0.1) {
      nextBeatTime = context.currentTime + 0.1;
    }
    while (nextBeatTime < context.currentTime + 0.6) {
      scheduleStep(context, nextBeatTime);
      nextBeatTime += BEAT;
      step += 1;
    }
  }

  return {
    // Call after the first user gesture, once the shared context exists.
    // Idempotent: starting twice is the same as starting once.
    start() {
      if (started) return;
      started = true;
      buildPattern(night);
      try {
        timer = setInterval(tick, 200);
      } catch {
        timer = null;
      }
    },
    setNight(nextNight) {
      night = nextNight;
      buildPattern(nextNight);
    },
    setDawnMode(on) {
      dawn = on;
    },
    setMuted(value) {
      muted = value;
      if (musicGain) musicGain.gain.value = muted ? 0 : 0.22;
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
      started = false;
    },
  };
}
