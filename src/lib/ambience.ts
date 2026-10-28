"use client";

/**
 * Gentle ambient sound for the immersive view, generated live with the Web
 * Audio API, so there are no recordings to license.
 *
 * - "quiet": the hush of a large stone interior (soft filtered noise + reverb)
 * - "bells": distant bells struck every so often (or temple bells / singing bowls)
 * - "organ": a slow, soft sustained chord
 *
 * Muted by default; the user turns it on.
 */

export type AmbienceKind = "quiet" | "bells" | "bowl" | "organ";

export const AMBIENCE_LABELS: Record<AmbienceKind, string> = {
  quiet: "Quiet ambience",
  bells: "Distant bells",
  bowl: "Singing bowl",
  organ: "Soft organ",
};

/** Which sounds suit each faith's places (nothing musical where that would be out of place). */
export function ambienceFor(faith: string): AmbienceKind[] {
  switch (faith) {
    case "christianity":
      return ["quiet", "bells", "organ"];
    case "buddhism":
    case "shinto":
    case "jainism":
      return ["quiet", "bowl"];
    case "hinduism":
    case "sikhism":
    case "chinese":
      return ["quiet", "bells"];
    default:
      return ["quiet"];
  }
}

export class AmbiencePlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private stops: (() => void)[] = [];
  private timer: number | null = null;

  get playing() {
    return this.stops.length > 0;
  }

  private setup() {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    // A long, soft reverb tail: the sound of a big room.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 5.5, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    this.reverb.connect(wet).connect(this.master);
    return ctx;
  }

  async play(kind: AmbienceKind) {
    this.stopSources();
    const ctx = this.setup();
    await ctx.resume();
    const out = ctx.createGain();
    out.connect(this.master!);
    out.connect(this.reverb!);

    this.stops.push(this.roomTone(ctx, out));
    if (kind === "bells" || kind === "bowl") this.scheduleStrikes(ctx, out, kind);
    if (kind === "organ") this.stops.push(this.organ(ctx, out));

    // Fade in gently.
    const g = this.master!.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(0.55, ctx.currentTime + 3);
  }

  stop() {
    if (!this.ctx || !this.master) return;
    const g = this.master.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 1.2);
    window.setTimeout(() => this.stopSources(), 1300);
  }

  dispose() {
    this.stopSources();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  private stopSources() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    for (const s of this.stops.splice(0)) s();
  }

  /** Low, airy hush of a large space. */
  private roomTone(ctx: AudioContext, out: AudioNode) {
    const src = ctx.createBufferSource();
    src.buffer = brownNoise(ctx, 6);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.16;
    src.connect(lp).connect(g).connect(out);
    src.start();
    return () => src.stop();
  }

  /** Bell or bowl strikes at gentle, irregular intervals. */
  private scheduleStrikes(ctx: AudioContext, out: AudioNode, kind: "bells" | "bowl") {
    const strike = () => {
      const base = kind === "bowl" ? 196 + Math.random() * 30 : [262, 294, 330, 392][Math.floor(Math.random() * 4)];
      // Bells have inharmonic partials; bowls ring long with a beating pair.
      const partials = kind === "bowl" ? [1, 1.004, 2.72, 5.18] : [0.5, 1, 1.2, 1.5, 2, 2.74, 3.76];
      const decay = kind === "bowl" ? 9 : 6;
      const t = ctx.currentTime + 0.05;
      for (const [i, ratio] of partials.entries()) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = base * ratio;
        const g = ctx.createGain();
        const level = (kind === "bowl" ? 0.09 : 0.06) / (i + 1);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(level, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay / (1 + i * 0.35));
        osc.connect(g).connect(out);
        osc.start(t);
        osc.stop(t + decay + 0.5);
      }
      this.timer = window.setTimeout(strike, (kind === "bowl" ? 14 : 9) * 1000 + Math.random() * 9000);
    };
    this.timer = window.setTimeout(strike, 1500);
  }

  /** A quiet, slowly breathing chord. */
  private organ(ctx: AudioContext, out: AudioNode) {
    const chord = [130.81, 196.0, 261.63, 329.63]; // C major, open voicing
    const nodes: OscillatorNode[] = [];
    const g = ctx.createGain();
    g.gain.value = 0.05;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(g.gain);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    for (const f of chord) {
      for (const [mult, type] of [
        [1, "sine"],
        [2, "triangle"],
      ] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f * mult;
        o.detune.value = (Math.random() - 0.5) * 6;
        o.connect(lp);
        o.start();
        nodes.push(o);
      }
    }
    lp.connect(g).connect(out);
    lfo.start();
    return () => {
      for (const n of nodes) n.stop();
      lfo.stop();
    };
  }
}

function brownNoise(ctx: AudioContext, seconds: number) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  return buf;
}

function impulse(ctx: AudioContext, seconds: number, decay: number) {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}
