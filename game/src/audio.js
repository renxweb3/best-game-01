// Every sound is synthesised with WebAudio — no audio files, no network.
// The context is created on the first gesture (browsers block sound before one),
// everything is wrapped so a headless run without audio hardware never breaks the game.
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

export function createAudio() {
  let context = null;
  let master = null;
  let padNodes = null;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return context;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(context.destination);
      startPad();
    } catch {
      context = null;
    }
    return context;
  }

  // A very quiet two-note night pad, slowly breathing, under everything else.
  function startPad() {
    try {
      const gain = context.createGain();
      gain.gain.value = 0.05;
      gain.connect(master);
      const lfo = context.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = context.createGain();
      lfoGain.gain.value = 0.025;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
      for (const frequency of [110, 164.81]) {
        const osc = context.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        osc.connect(gain);
        osc.start();
      }
      padNodes = { gain };
    } catch {
      padNodes = null;
    }
  }

  function tone({ type = 'sine', from = 440, to = null, at = 0, length = 0.2, volume = 0.2 }) {
    if (!ensure()) return;
    try {
      const now = context.currentTime + at;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, now);
      if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + length);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + length);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + length + 0.05);
    } catch {
      // Sound is garnish: never let it stop the game.
    }
  }

  function noise({ at = 0, length = 0.15, volume = 0.2, lowpass = 800 }) {
    if (!ensure()) return;
    try {
      const now = context.currentTime + at;
      const size = Math.max(1, Math.floor(context.sampleRate * length));
      const buffer = context.createBuffer(1, size, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < size; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = context.createGain();
      gain.gain.value = volume;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(now);
    } catch {
      // Sound is garnish: never let it stop the game.
    }
  }

  return {
    // Call on any gesture so the pad can start.
    unlock() {
      ensure();
    },
    pluck(combo) {
      const step = Math.min(combo, PENTATONIC.length - 1);
      tone({ type: 'triangle', from: PENTATONIC[step], length: 0.35, volume: 0.22 });
      tone({ type: 'sine', from: PENTATONIC[step] * 2, length: 0.18, volume: 0.06 });
    },
    thud() {
      tone({ type: 'sine', from: 130, to: 38, length: 0.3, volume: 0.35 });
      noise({ length: 0.18, volume: 0.2, lowpass: 500 });
    },
    dash() {
      noise({ length: 0.16, volume: 0.12, lowpass: 2400 });
    },
    scare() {
      tone({ type: 'square', from: 880, to: 220, length: 0.12, volume: 0.08 });
    },
    chime() {
      // A bloom rings three notes up the scale.
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        tone({ type: 'sine', from: frequency, at: index * 0.09, length: 0.5, volume: 0.18 });
      });
    },
    win() {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((frequency, index) => {
        tone({ type: 'triangle', from: frequency, at: index * 0.11, length: 0.6, volume: 0.2 });
      });
    },
    lose() {
      [392, 329.63, 261.63].forEach((frequency, index) => {
        tone({ type: 'sine', from: frequency, at: index * 0.16, length: 0.5, volume: 0.16 });
      });
    },
    click() {
      tone({ type: 'sine', from: 660, length: 0.07, volume: 0.12 });
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
  };
}
