'use strict';
/** Tiny WebAudio synth: no audio files, off until the first user gesture unlocks the context. */
class AudioManager {
  constructor(game) { this.game = game; this.ctx = null; }
  unlock() {
    if (this.ctx || !window.AudioContext) return;
    try { this.ctx = new AudioContext(); } catch (e) { this.ctx = null; }
  }
  tone(freq, dur, type = 'square', vol = 0.05, slide = 0) {
    if (!this.ctx || !this.game.settings.sound) return;
    const t = this.ctx.currentTime; const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.linearRampToValueAtTime(freq + slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + dur);
  }
  play(kind) {
    try {
      if (kind === 'click') this.tone(520, 0.05);
      else if (kind === 'trade') this.tone(700, 0.14, 'triangle', 0.07, 500);
      else if (kind === 'event') this.tone(300, 0.25, 'sawtooth', 0.05, -80);
      else if (kind === 'error') this.tone(150, 0.16, 'square', 0.06);
      else if (kind === 'phase') this.tone(440, 0.09, 'sine', 0.05, 120);
    } catch (e) { /* audio is optional */ }
  }
}
