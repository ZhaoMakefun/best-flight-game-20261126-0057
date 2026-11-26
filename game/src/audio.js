// Sound, synthesized live with WebAudio: an engine hum that follows the
// throttle, a chime when a ring is threaded, a thud for a landing and a
// crunch for a crash. No audio files are shipped; everything is an
// oscillator, so the game still loads nothing over the network. Every
// call is guarded: with no user gesture yet the context stays suspended
// and the calls do nothing.

// A fresh audio state. `ctx` is created lazily on the first user gesture.
export function makeAudio() {
  return {
    ctx: null,
    engine: null,
    engineGain: null,
    muted: false,
    started: false,
  };
}

// Start the audio context and the engine hum. Call from a user gesture.
export function startAudio(audio) {
  if (audio.started) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio.ctx = new Ctx();
    const osc = audio.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 52;
    const osc2 = audio.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 104;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = audio.ctx.createGain();
    gain.gain.value = 0.0;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(audio.ctx.destination);
    osc.start();
    osc2.start();
    audio.engine = osc;
    audio.engine2 = osc2;
    audio.engineGain = gain;
    audio.started = true;
  } catch (err) {
    // Sound is decoration; a failure here must never stop the game.
    audio.started = false;
  }
}

// Follow the throttle and speed: the hum rises and the filter opens.
export function updateEngine(audio, throttle, speed, topSpeed) {
  if (!audio.started || !audio.ctx || audio.muted) return;
  try {
    if (audio.ctx.state === 'suspended') void audio.ctx.resume();
    const t = audio.ctx.currentTime;
    const f = 46 + throttle * 66 + (speed / topSpeed) * 40;
    audio.engine.frequency.setTargetAtTime(f, t, 0.08);
    audio.engine2.frequency.setTargetAtTime(f * 2.01, t, 0.08);
    audio.engineGain.gain.setTargetAtTime(audio.muted ? 0 : 0.045 + throttle * 0.05, t, 0.1);
  } catch (err) {
    // Ignore: a hiccup in the hum is not worth a crash.
  }
}

// A short two-note chime for a ring.
export function ringChime(audio) {
  if (!audio.started || !audio.ctx || audio.muted) return;
  try {
    const t0 = audio.ctx.currentTime;
    [880, 1318].forEach((freq, i) => {
      const osc = audio.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = audio.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + i * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.09 + 0.5);
      osc.connect(gain);
      gain.connect(audio.ctx.destination);
      osc.start(t0 + i * 0.09);
      osc.stop(t0 + i * 0.09 + 0.55);
    });
  } catch (err) {
    // Ignore.
  }
}

// A low thud for a landing.
export function landingThud(audio) {
  if (!audio.started || !audio.ctx || audio.muted) return;
  try {
    const t0 = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t0);
    osc.frequency.exponentialRampToValueAtTime(42, t0 + 0.22);
    const gain = audio.ctx.createGain();
    gain.gain.setValueAtTime(0.25, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
    osc.connect(gain);
    gain.connect(audio.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.32);
  } catch (err) {
    // Ignore.
  }
}

// A noise burst for a crash.
export function crashNoise(audio) {
  if (!audio.started || !audio.ctx || audio.muted) return;
  try {
    const t0 = audio.ctx.currentTime;
    const len = Math.floor(audio.ctx.sampleRate * 0.5);
    const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audio.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = audio.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    src.connect(gain);
    gain.connect(audio.ctx.destination);
    src.start(t0);
  } catch (err) {
    // Ignore.
  }
}

// Mute or unmute everything.
export function setMuted(audio, muted) {
  audio.muted = muted;
  if (audio.engineGain && audio.ctx) {
    try {
      audio.engineGain.gain.setTargetAtTime(muted ? 0 : 0.06, audio.ctx.currentTime, 0.05);
    } catch (err) {
      // Ignore.
    }
  }
}
