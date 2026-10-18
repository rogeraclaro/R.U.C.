/**
 * AudioManager — SID-style chiptune music and sound effects, pure WebAudio synthesis (no files).
 * All music is original (not derived from the M.U.L.E. theme). Audio is optional: nothing here throws.
 *
 * API: unlock(), play(kind), music(trackId), stopMusic(), hold(on) (pause menu), soundChanged() (Sound toggle).
 * Honours game.settings.sound (false = everything silent). Static helpers trackFor / eventFx decide what plays where.
 * Wrapped in an IIFE so the helpers (TRACKS, midiOf, buildTrack...) stay private; only AudioManager is global.
 */
const AudioManager = (() => {
'use strict';

// ---- Music data -------------------------------------------------------------------------------
// Lead tokens are 8th notes: note name ("F#5", "Bb4"), "-" = hold previous note, "." = rest.
// Chords are one per bar (4/4). Drum strings are 16th notes: k=kick s=snare h=hat o=open hat .=rest.
const TRACKS = {
  // Title: stomping D-major hoedown with banjo-roll arpeggios.
  title: {
    bpm: 132, vol: 0.9, chords: 'D G Bm A D G A D', bass: 'boom', arp: [0, 2, 3, 2, 1, 2, 3, 2], drums: 'k.h.s.hkk.h.s.hh',
    lead: 'A4 D5 F#5 - E5 D5 A4 - B4 D5 G5 - F#5 E5 D5 - F#5 - E5 D5 C#5 D5 B4 - A4 C#5 E5 - A5 - - . ' +
          'F#5 G5 A5 - F#5 D5 E5 F#5 G5 - B5 - A5 G5 F#5 E5 E5 F#5 G5 E5 C#5 - A4 - D5 - F#5 A5 D6 - - .',
  },
  // Land grant: spacious A-dorian, waiting-for-the-cursor mood.
  land: {
    bpm: 96, vol: 0.6, chords: 'Am G F G Am G F E', bass: 'boom', arp: [0, 1, 2, 3, 2, 1, 0, 1], drums: 'k.......s.......',
    lead: 'E5 - - - A5 - G5 - D5 - - - B4 - D5 - C5 - A4 - C5 - F5 - E5 - D5 - - - . . ' +
          'E5 - - - A5 - B5 - C6 - B5 - G5 - D5 - F5 - E5 - C5 - A4 - G#4 - B4 - E5 - - .',
  },
  // Development: a quiet bed only (arps + bass + soft hats), never fights the sound effects.
  development: {
    bpm: 108, vol: 0.4, chords: 'C Am F G C Am Dm G', bass: 'boom', arp: [0, 2, 1, 2, 3, 2, 1, 2], drums: '....h.......h...',
  },
  // Auction: driving E-minor gallop, walking 8th-note bass.
  auction: {
    bpm: 152, vol: 0.75, chords: 'Em Em C D Em Em B B', bass: 'gallop', arp: [0, 1, 2, 3, 0, 1, 2, 3], drums: 'k.hsk.hsk.hsk.so',
    lead: 'E5 . E5 G5 . B5 A5 G5 F#5 . E5 F#5 . G5 F#5 E5 E5 . C5 E5 . G5 E5 C5 D5 . F#5 A5 . D6 C6 A5 ' +
          'E5 . E5 G5 . B5 A5 G5 B5 . A5 G5 . F#5 E5 D5 D#5 . F#5 B5 . A5 F#5 D#5 B4 - - . B4 . . .',
  },
  // Status / standings between rounds: jaunty G major.
  status: {
    bpm: 120, vol: 0.75, chords: 'G C G D G C D G', bass: 'boom', arp: [0, 2, 3, 2, 0, 2, 3, 2], drums: 'k...s.h.k.k.s.h.',
    lead: 'B4 D5 G5 - F#5 G5 A5 - G5 E5 C5 - E5 - G5 - B5 A5 G5 - D5 - G5 - F#5 E5 D5 - A4 - . . ' +
          'B4 D5 G5 - A5 B5 C6 - E6 - D6 C6 B5 - A5 G5 A5 - - F#5 D5 E5 F#5 A5 G5 - D5 - G4 - . .',
  },
  // Colony thrived: bright C-major fanfare.
  end_success: {
    bpm: 118, vol: 0.85, chords: 'C F G C Am F G C', bass: 'boom', arp: [0, 1, 2, 3, 2, 1, 2, 3], drums: 'k.h.s.h.k.kks.ho',
    lead: 'C5 E5 G5 - C6 - G5 - A5 - F5 - C6 - A5 - B5 - D6 - G5 - F5 - E5 - G5 - C6 - - . ' +
          'A5 - C6 - E6 - C6 - F5 A5 C6 - A5 - F5 - G5 B5 D6 - F6 - D6 - E6 - - - C6 - - .',
  },
  // Colony failed: slow D-minor lament, no drums.
  end_failure: {
    bpm: 72, vol: 0.7, chords: 'Dm Bb Gm A Dm Bb A Dm', bass: 'boom', arp: [0, 1, 2, 1, 0, 1, 2, 1], drums: '',
    lead: 'D5 - F5 - A5 - - - Bb4 - D5 - F5 - - E5 D5 - Bb4 - G4 - - - A4 - C#5 - E5 - - - ' +
          'F5 - E5 - D5 - - A4 Bb4 - - - D5 - - - C#5 - E5 - A4 - - - D5 - - - - - . .',
  },
};

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midiOf = (name) => {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  return m ? SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (+m[3] + 1) : null;
};
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
/** Chord name ("F#m", "Bb") -> [root, third, fifth, octave] midi notes, root in the given octave. */
const chordTones = (name, oct) => {
  const m = /^([A-G][#b]?)(m?)$/.exec(name); const r = midiOf(m[1] + oct);
  return [r, r + (m[2] ? 3 : 4), r + 7, r + 12];
};

/** Expand a track definition into per-voice event maps indexed by 16th-note step. */
function buildTrack(def) {
  const chords = def.chords.split(' '); const bars = chords.length; const steps = bars * 16;
  const lead = {}, arp = {}, bass = {}, drums = {};
  if (def.lead) { // 8th-note tokens -> events of {midi, len (in 16ths)}
    const toks = def.lead.trim().split(/\s+/); let last = null;
    toks.forEach((t, i) => {
      if (t === '-') { if (last) last.len += 2; return; }
      if (t === '.') { last = null; return; }
      last = { midi: midiOf(t), len: 2 }; lead[i * 2] = last;
    });
  }
  chords.forEach((c, b) => {
    const base = b * 16; const lo = chordTones(c, 2); const mid = chordTones(c, 4);
    for (let i = 0; i < 8; i++) arp[base + i * 2] = { midi: mid[def.arp[i]] + 12, len: 1 };
    if (def.bass === 'gallop') { // 8th-note pulse: root root fifth root ...
      [0, 0, 2, 0, 0, 0, 2, 3].forEach((k, i) => { bass[base + i * 2] = { midi: lo[k] - (k === 2 ? 12 : 0), len: 1 }; });
    } else { // boom-chick: root, fifth below, root, fifth below (quarters)
      [0, 2, 0, 2].forEach((k, i) => { bass[base + i * 4] = { midi: lo[k] - (k === 2 ? 12 : 0), len: 3 }; });
    }
  });
  if (def.drums) for (let s = 0; s < steps; s++) { const ch = def.drums[s % def.drums.length]; if (ch !== '.') drums[s] = ch; }
  return { bpm: def.bpm, vol: def.vol, steps, lead, arp, bass, drums };
}

// ---- Manager ----------------------------------------------------------------------------------
class AudioManager {
  constructor(game) {
    this.game = game; this.ctx = null;
    this.wanted = null; this.playing = null; this.timer = null; this.built = {}; this.held = false;
  }

  /** Create the AudioContext on the first user gesture (and resume it if the browser suspended it). */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        this._init(new AC());
        if (this.wanted && !this.timer) this._tick();
      }
      if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume().catch(() => {});
    } catch (e) { this.ctx = null; }
  }

  /** Build the master chain on a given context (also used with OfflineAudioContext in tests). */
  _init(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.5;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 25; // removes pulse DC offset
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.15;
    this.master.connect(hp); hp.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate; const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0, v = 0; i < len; i++) { if (i % 3 === 0) v = Math.random() * 2 - 1; d[i] = v; } // lo-fi S&H noise
    this.noiseBuf = buf;
  }

  get on() { return !!(this.ctx && this.game && this.game.settings && this.game.settings.sound); }

  // ---- SID-like voice ----
  /**
   * One synth voice. o: { wave: 'pulse'|'tri'|'saw'|'sine'|'noise', f, f2 (slide target), t (offset s), dur,
   * a, d, s (sustain level 0..1), r, vol, duty, pwm [rate Hz, depth], vib [rate Hz, cents], filter [type, f, f2, q], rate (noise) }
   */
  voice(o, dest) {
    const c = this.ctx; const t = c.currentTime + (o.t || 0) + 0.005; const dur = o.dur || 0.1;
    const a = o.a ?? 0.003, d = o.d ?? 0.05, s = o.s ?? 0.7, r = o.r ?? 0.05, vol = o.vol ?? 0.3;
    const env = c.createGain(); const g = env.gain; const end = t + dur + r;
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(vol, t + a);
    g.linearRampToValueAtTime(vol * s, t + a + d); g.setValueAtTime(vol * s, t + Math.max(dur, a + d));
    g.linearRampToValueAtTime(0, end);
    let head = env; // the node voices connect into (optionally a filter)
    if (o.filter) {
      const [type, f1, f2, q] = o.filter; const bq = c.createBiquadFilter(); bq.type = type; bq.Q.value = q ?? 1;
      bq.frequency.setValueAtTime(f1, t); if (f2) bq.frequency.exponentialRampToValueAtTime(f2, end);
      bq.connect(env); head = bq;
    }
    env.connect(dest || this.master);
    const srcs = [];
    if (o.wave === 'noise') {
      const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
      n.playbackRate.setValueAtTime(o.rate ?? 1, t);
      if (o.rate2) n.playbackRate.exponentialRampToValueAtTime(o.rate2, end);
      n.connect(head); srcs.push(n);
    } else {
      const osc = c.createOscillator(); const f = o.f || 440;
      osc.frequency.setValueAtTime(f, t); if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.slide ?? dur));
      if (o.vib) { // vibrato via detune LFO
        const l = c.createOscillator(); const lg = c.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
        l.connect(lg); lg.connect(osc.detune); srcs.push(l);
      }
      if (o.wave === 'pulse') {
        // Pulse = saw - delayed saw; the delay (duty / f) sets the width, an LFO on it gives PWM.
        osc.type = 'sawtooth'; const duty = o.duty ?? 0.25;
        const inv = c.createGain(); inv.gain.value = -1; const dl = c.createDelay(0.05);
        dl.delayTime.setValueAtTime(duty / f, t); if (o.f2) dl.delayTime.exponentialRampToValueAtTime(duty / o.f2, t + (o.slide ?? dur));
        osc.connect(head); osc.connect(inv); inv.connect(dl); dl.connect(head);
        if (o.pwm) {
          const l = c.createOscillator(); const lg = c.createGain(); l.frequency.value = o.pwm[0]; lg.gain.value = o.pwm[1] / f;
          l.connect(lg); lg.connect(dl.delayTime); srcs.push(l);
        }
      } else {
        osc.type = o.wave === 'tri' ? 'triangle' : o.wave === 'saw' ? 'sawtooth' : o.wave === 'sine' ? 'sine' : 'square';
        osc.connect(head);
      }
      srcs.push(osc);
    }
    srcs.forEach((n) => { n.start(t); n.stop(end + 0.02); });
  }

  /** Shorthand: a sequence of pulse notes [freq, startOffset, dur] sharing the same options. */
  seq(notes, opts) { notes.forEach(([f, t, dur]) => this.voice({ wave: 'pulse', s: 0.6, ...opts, f, t, dur })); }

  // ---- Sound effects ----
  play(kind) {
    try {
      if (!this.on) return;
      const fx = AudioManager.FX[kind]; if (fx) fx.call(this, this);
    } catch (e) { /* audio is optional */ }
  }

  // ---- Music: look-ahead scheduler (setTimeout drives, AudioContext time is the clock) ----
  music(trackId) {
    try {
      if (!TRACKS[trackId]) return;
      if (this.wanted === trackId && this.playing === trackId) return; // already running
      this._stopVoices(); this.wanted = trackId;
      if (!this.timer) this._tick();
    } catch (e) { /* audio is optional */ }
  }

  /** Pause menu: the music keeps its position and stops scheduling new notes until released. */
  hold(on) { this.held = !!on; }

  /** Called by the Sound toggle: silence the music immediately (the wanted track resumes when sound is back on). */
  soundChanged() {
    try { if (!this.on) this._stopVoices(); else if (this.wanted && !this.timer) this._tick(); } catch (e) { /* optional */ }
  }

  stopMusic() {
    try { this.wanted = null; this._stopVoices(); clearTimeout(this.timer); this.timer = null; } catch (e) { /* optional */ }
  }

  _stopVoices() {
    this.playing = null;
    if (this.bus && this.ctx) {
      const bus = this.bus; this.bus = null; const t = this.ctx.currentTime;
      try { bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0, t + 0.04); } catch (e) { /* ignore */ }
      setTimeout(() => { try { bus.disconnect(); } catch (e) { /* ignore */ } }, 120);
    }
  }

  _start(trackId) {
    const tr = this.built[trackId] || (this.built[trackId] = buildTrack(TRACKS[trackId]));
    this.track = tr; this.playing = trackId; this.step = 0; this.nextTime = this.ctx.currentTime + 0.06;
    this.bus = this.ctx.createGain(); this.bus.gain.value = tr.vol; this.bus.connect(this.master);
  }

  _tick() {
    this.timer = null;
    try {
      if (!this.wanted) return;
      if (this.ctx) {
        if (!this.on) { if (this.playing) this._stopVoices(); }
        else if (this.held) { /* paused: keep the position; _tick resyncs nextTime on release */ }
        else {
          if (this.playing !== this.wanted) this._start(this.wanted);
          if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05; // resync after tab throttling
          this._pump(this.ctx.currentTime + 0.15);
        }
      }
    } catch (e) { /* audio is optional */ }
    this.timer = setTimeout(() => this._tick(), 30);
  }

  /** Schedule every 16th-note step whose start time is before `horizon` (AudioContext seconds). */
  _pump(horizon) {
    const tr = this.track; const sp = 60 / tr.bpm / 4; const now = this.ctx.currentTime;
    while (this.nextTime < horizon) {
      const s = this.step % tr.steps; const t = this.nextTime - now;
      const L = tr.lead[s], A = tr.arp[s], B = tr.bass[s], D = tr.drums[s];
      if (L) this.voice({ wave: 'pulse', f: hz(L.midi), t, dur: L.len * sp * 0.9, a: 0.01, d: 0.12, s: 0.65, r: 0.08, vol: 0.2, duty: 0.3, pwm: [0.7, 0.16], vib: [5.5, 12] }, this.bus);
      if (A) this.voice({ wave: 'pulse', f: hz(A.midi), t, dur: sp * 0.6, a: 0.002, d: 0.08, s: 0.2, r: 0.04, vol: 0.09, duty: 0.12, pwm: [0.3, 0.06] }, this.bus);
      if (B) this.voice({ wave: 'tri', f: hz(B.midi), t, dur: B.len * sp * 0.85, a: 0.004, d: 0.1, s: 0.8, r: 0.05, vol: 0.42 }, this.bus);
      if (D) this.drum(D, t, this.bus);
      this.step++; this.nextTime += sp;
    }
  }

  drum(ch, t, dest) {
    if (ch === 'k') this.voice({ wave: 'tri', f: 160, f2: 40, slide: 0.12, t, dur: 0.12, d: 0.1, s: 0.3, r: 0.03, vol: 0.55 }, dest);
    else if (ch === 's') this.voice({ wave: 'noise', rate: 0.8, t, dur: 0.1, d: 0.08, s: 0.2, r: 0.05, vol: 0.22, filter: ['bandpass', 1800, 0, 0.8] }, dest);
    else if (ch === 'h') this.voice({ wave: 'noise', t, dur: 0.02, d: 0.02, s: 0.1, r: 0.02, vol: 0.1, filter: ['highpass', 7000] }, dest);
    else if (ch === 'o') this.voice({ wave: 'noise', t, dur: 0.12, d: 0.1, s: 0.3, r: 0.08, vol: 0.09, filter: ['highpass', 6000] }, dest);
  }
}

AudioManager.TRACKS = Object.keys(TRACKS);

/** Phases after the production that keep the status music running (no new screen in between). */
const STATUS_PHASES = ['PRODUCTION', 'STATUS', 'TURN_REPORT', 'AUTOSAVE', 'NEXT'];
/**
 * Which music plays, as the original: the theme on title/setup, the status tune on production, status and the round report,
 * the ending tunes on the game-over screen, and silence in land grant, development and auctions (the 'land', 'development'
 * and 'auction' tracks exist but are deliberately unused). s: { mode, phase, gameOver, survives, card }.
 */
AudioManager.trackFor = (s) => {
  if (s.mode === 'title' || s.mode === 'setup') return 'title';
  if (s.mode !== 'play') return null;
  if (s.gameOver) return s.survives ? 'end_success' : 'end_failure';
  if (STATUS_PHASES.includes(s.phase)) return 'status';
  if (s.phase === 'PLANET_EVENT_AFTER' && !s.card) return 'status'; // quiet round: do not restart the tune for a skipped card
  return null;
};

const PLANET_FX = { pest_attack: 'pest', pirates: 'pirates', acid_rain: 'acid_rain', planetquake: 'quake', sunspot: 'sunspot', meteorite: 'meteor', radiation: 'radiation', store_fire: 'fire', landing: 'ship_land', ship_back: 'ship_land' };
/** Effect for an event card: each planetary event has its own; personal events sound good or bad by their quality. */
AudioManager.eventFx = (id) => {
  if (PLANET_FX[id]) return PLANET_FX[id];
  const def = typeof EVENT_DEFS !== 'undefined' ? EVENT_DEFS[id] : null;
  return def && def.quality > 0 ? 'event_good' : 'event_bad';
};

/** Effect recipes. Each receives the manager (`a`) and only schedules voices. */
AudioManager.FX = {
  // --- original game kinds ---
  click: (a) => a.voice({ wave: 'pulse', f: 620, dur: 0.035, d: 0.03, s: 0.3, vol: 0.18, duty: 0.25 }),
  trade: (a) => a.seq([[880, 0, 0.05], [1320, 0.06, 0.09]], { vol: 0.2, duty: 0.2 }),
  event: (a) => a.seq([[523, 0, 0.07], [659, 0.08, 0.07], [784, 0.16, 0.14]], { vol: 0.2, duty: 0.3 }),
  error: (a) => a.voice({ wave: 'pulse', f: 140, dur: 0.18, d: 0.05, s: 0.8, vol: 0.25, duty: 0.45, vib: [18, 40] }),
  phase: (a) => a.seq([[587, 0, 0.08], [880, 0.09, 0.16]], { vol: 0.18, duty: 0.15, pwm: [3, 0.08] }),

  // --- land grant ---
  cursor_tick: (a) => a.voice({ wave: 'pulse', f: 1400, dur: 0.018, d: 0.015, s: 0.2, r: 0.01, vol: 0.06, duty: 0.1 }), // quiet: every cursor step
  claim: (a) => {
    a.seq([[523, 0, 0.05], [659, 0.05, 0.05], [784, 0.1, 0.05], [1047, 0.15, 0.18]], { vol: 0.2, duty: 0.25, pwm: [6, 0.1] });
    a.voice({ wave: 'noise', rate: 2, t: 0.15, dur: 0.12, s: 0.3, vol: 0.05, filter: ['highpass', 6000] });
  },

  // --- walking & the RUC ---
  walk_step: (a) => a.voice({ wave: 'noise', rate: 0.4, dur: 0.02, d: 0.02, s: 0.1, r: 0.02, vol: 0.07, filter: ['lowpass', 900] }), // quiet, throttled by the caller
  ruc_bray: (a) => { // "hee-haw" x2: high nasal warble then low groan
    for (let i = 0; i < 2; i++) {
      const t = i * 0.5;
      a.voice({ wave: 'pulse', f: 760, f2: 620, t, dur: 0.18, a: 0.02, s: 0.9, vol: 0.18, duty: 0.12, vib: [22, 70], filter: ['lowpass', 2500] });
      a.voice({ wave: 'saw', f: 310, f2: 230, t: t + 0.2, dur: 0.24, a: 0.02, s: 0.9, vol: 0.16, vib: [16, 90], filter: ['lowpass', 1400] });
    }
  },
  ruc_flee: (a) => { // panicked warble falling away + scurrying steps
    a.voice({ wave: 'pulse', f: 900, f2: 180, dur: 0.9, a: 0.01, s: 0.8, r: 0.2, vol: 0.16, duty: 0.2, vib: [14, 120], pwm: [4, 0.12] });
    for (let i = 0; i < 8; i++) a.voice({ wave: 'noise', rate: 0.5, t: i * 0.09, dur: 0.02, s: 0.1, vol: 0.12 * (1 - i / 9), filter: ['lowpass', 1000] });
  },
  enter_shop: (a) => { // door chime
    a.voice({ wave: 'tri', f: 988, dur: 0.12, d: 0.2, s: 0.4, r: 0.2, vol: 0.3 });
    a.voice({ wave: 'tri', f: 784, t: 0.14, dur: 0.2, d: 0.25, s: 0.4, r: 0.3, vol: 0.3 });
  },
  outfit: (a) => { // machine whirr ramp-up + clank
    a.voice({ wave: 'pulse', f: 160, f2: 900, dur: 0.45, a: 0.02, s: 0.8, vol: 0.14, duty: 0.4, pwm: [9, 0.2] });
    a.voice({ wave: 'noise', rate: 0.6, t: 0.45, dur: 0.06, s: 0.3, vol: 0.2, filter: ['bandpass', 2500, 0, 2] });
    a.voice({ wave: 'pulse', f: 1320, t: 0.52, dur: 0.06, s: 0.4, vol: 0.12, duty: 0.2 });
  },
  install: (a) => { // heavy thunk, clank, then OK blip
    a.voice({ wave: 'tri', f: 220, f2: 55, slide: 0.15, dur: 0.18, s: 0.5, vol: 0.5 });
    a.voice({ wave: 'noise', rate: 0.5, dur: 0.08, s: 0.3, vol: 0.18, filter: ['lowpass', 1500] });
    a.voice({ wave: 'noise', rate: 1, t: 0.2, dur: 0.04, s: 0.3, vol: 0.14, filter: ['bandpass', 3200, 0, 3] });
    a.seq([[784, 0.32, 0.06], [1175, 0.4, 0.12]], { vol: 0.16, duty: 0.25 });
  },
  pub_win: (a) => { // coin cascade
    const n = [1047, 1319, 1568, 2093, 1568, 2093, 2637];
    a.seq(n.map((f, i) => [f, i * 0.06, 0.05]), { vol: 0.15, duty: 0.15, s: 0.3 });
    a.voice({ wave: 'noise', rate: 2, t: 0.1, dur: 0.35, s: 0.3, vol: 0.04, filter: ['highpass', 8000] });
  },

  // --- turn timer ---
  turn_start: (a) => a.seq([[392, 0, 0.07], [523, 0.08, 0.07], [784, 0.16, 0.16]], { vol: 0.2, duty: 0.3, pwm: [5, 0.1] }),
  countdown: (a) => a.voice({ wave: 'pulse', f: 660, dur: 0.06, d: 0.05, s: 0.4, vol: 0.16, duty: 0.25 }),
  time_warning: (a) => a.seq([[1046, 0, 0.07], [1046, 0.14, 0.07]], { vol: 0.2, duty: 0.5 }),
  time_up: (a) => {
    a.seq([[784, 0, 0.12], [622, 0.14, 0.12], [494, 0.28, 0.3]], { vol: 0.22, duty: 0.35, pwm: [6, 0.15] });
    a.voice({ wave: 'tri', f: 123, t: 0.28, dur: 0.3, s: 0.8, vol: 0.3 });
  },

  // --- auctions ---
  auction_tick: (a) => a.voice({ wave: 'noise', rate: 1.5, dur: 0.01, d: 0.01, s: 0.1, r: 0.01, vol: 0.14, filter: ['bandpass', 4000, 0, 4] }),
  auction_trade_unit: (a) => a.seq([[1319, 0, 0.03], [1760, 0.035, 0.05]], { vol: 0.14, duty: 0.2, s: 0.4 }),
  declare: (a) => a.seq([[440, 0, 0.08], [659, 0.09, 0.14]], { vol: 0.2, duty: 0.4, pwm: [7, 0.15] }),
  auction_over: (a) => { // closing "gavel" + cadence
    a.voice({ wave: 'noise', rate: 0.6, dur: 0.05, s: 0.2, vol: 0.25, filter: ['lowpass', 1800] });
    a.seq([[880, 0.1, 0.1], [740, 0.22, 0.1], [659, 0.34, 0.1], [587, 0.46, 0.35]], { vol: 0.18, duty: 0.3, pwm: [4, 0.12] });
    a.voice({ wave: 'tri', f: 147, t: 0.46, dur: 0.35, s: 0.8, vol: 0.3 });
  },

  // --- events ---
  event_good: (a) => {
    a.seq([[523, 0, 0.07], [659, 0.08, 0.07], [784, 0.16, 0.07], [1047, 0.24, 0.3]], { vol: 0.2, duty: 0.25, pwm: [5, 0.12], vib: [6, 10] });
    a.voice({ wave: 'tri', f: 131, t: 0.24, dur: 0.3, s: 0.8, vol: 0.3 });
  },
  event_bad: (a) => {
    a.seq([[466, 0, 0.12], [440, 0.13, 0.12], [415, 0.26, 0.12], [311, 0.39, 0.4]], { vol: 0.2, duty: 0.4, pwm: [3, 0.15], vib: [5, 15] });
    a.voice({ wave: 'tri', f: 78, t: 0.39, dur: 0.4, s: 0.8, vol: 0.35 });
  },
  pirates: (a) => { // ominous engine drone + alternating siren
    a.voice({ wave: 'saw', f: 55, f2: 70, dur: 1.4, a: 0.1, s: 0.9, r: 0.3, vol: 0.18, vib: [7, 25], filter: ['lowpass', 500] });
    for (let i = 0; i < 4; i++) a.voice({ wave: 'pulse', f: i % 2 ? 494 : 659, t: i * 0.3, dur: 0.26, s: 0.8, vol: 0.12, duty: 0.3, pwm: [8, 0.15] });
  },
  quake: (a) => { // deep rumble with shaking filter
    a.voice({ wave: 'noise', rate: 0.15, dur: 1.5, a: 0.08, s: 0.9, r: 0.4, vol: 0.5, filter: ['lowpass', 400, 120, 4] });
    a.voice({ wave: 'tri', f: 45, f2: 32, dur: 1.5, a: 0.05, s: 0.9, r: 0.4, vol: 0.45, vib: [9, 300] });
  },
  fire: (a) => { // hiss + random crackles
    a.voice({ wave: 'noise', rate: 0.9, dur: 1.2, a: 0.15, s: 0.8, r: 0.3, vol: 0.12, filter: ['bandpass', 1200, 2400, 0.7] });
    for (let i = 0; i < 14; i++) a.voice({ wave: 'noise', rate: 1.5, t: Math.random() * 1.2, dur: 0.012, s: 0.2, r: 0.01, vol: 0.25, filter: ['highpass', 3000] });
  },
  meteor: (a) => { // falling whistle, then impact
    a.voice({ wave: 'pulse', f: 2400, f2: 150, dur: 0.8, a: 0.05, s: 0.9, r: 0.02, vol: 0.12, duty: 0.2, pwm: [10, 0.1] });
    a.voice({ wave: 'noise', rate: 0.3, t: 0.8, dur: 0.6, d: 0.3, s: 0.4, r: 0.4, vol: 0.55, filter: ['lowpass', 3000, 150] });
    a.voice({ wave: 'tri', f: 120, f2: 30, t: 0.8, dur: 0.4, s: 0.6, vol: 0.5 });
  },
  radiation: (a) => { // geiger clicks + eerie wobble
    a.voice({ wave: 'pulse', f: 1800, dur: 1.2, a: 0.2, s: 0.6, r: 0.3, vol: 0.06, duty: 0.1, vib: [3, 200], pwm: [0.8, 0.08] });
    for (let i = 0; i < 18; i++) a.voice({ wave: 'noise', rate: 2, t: Math.random() * 1.3, dur: 0.004, d: 0.004, s: 0.1, r: 0.005, vol: 0.35, filter: ['highpass', 2000] });
  },
  pest: (a) => a.voice({ wave: 'saw', f: 210, f2: 260, dur: 0.9, a: 0.05, s: 0.9, r: 0.15, vol: 0.14, vib: [28, 80], filter: ['bandpass', 900, 1400, 2] }),
  acid_rain: (a) => { // sizzle + drips
    a.voice({ wave: 'noise', rate: 1.8, dur: 1.3, a: 0.2, s: 0.7, r: 0.3, vol: 0.14, filter: ['highpass', 4000, 6000] });
    for (let i = 0; i < 7; i++) a.voice({ wave: 'sine', f: 1500 + Math.random() * 900, f2: 500, t: 0.1 + i * 0.16, dur: 0.05, s: 0.4, vol: 0.12 });
  },
  sunspot: (a) => { // rising shimmer
    a.voice({ wave: 'pulse', f: 330, f2: 1320, dur: 1.0, a: 0.1, s: 0.8, r: 0.3, vol: 0.12, duty: 0.25, vib: [9, 30], pwm: [2, 0.2] });
    a.voice({ wave: 'tri', f: 660, f2: 2640, t: 0.05, dur: 1.0, a: 0.1, s: 0.7, r: 0.3, vol: 0.12 });
  },

  // --- colony ship ---
  ship_land: (a) => {
    a.voice({ wave: 'pulse', f: 1100, f2: 110, dur: 1.4, a: 0.05, s: 0.8, r: 0.1, vol: 0.12, duty: 0.3, pwm: [5, 0.15] });
    a.voice({ wave: 'noise', rate: 0.4, rate2: 0.1, dur: 1.5, a: 0.3, s: 0.8, r: 0.2, vol: 0.2, filter: ['lowpass', 1500, 300] });
    a.voice({ wave: 'tri', f: 90, f2: 35, t: 1.45, dur: 0.25, s: 0.5, vol: 0.5 });
  },
  ship_leave: (a) => {
    a.voice({ wave: 'noise', rate: 0.1, rate2: 0.6, dur: 1.6, a: 0.4, s: 0.9, r: 0.4, vol: 0.22, filter: ['lowpass', 300, 2500] });
    a.voice({ wave: 'pulse', f: 110, f2: 1400, t: 0.2, dur: 1.4, a: 0.2, s: 0.8, r: 0.3, vol: 0.11, duty: 0.3, pwm: [6, 0.15] });
  },
};
AudioManager.KINDS = Object.keys(AudioManager.FX);
return AudioManager;
})();
