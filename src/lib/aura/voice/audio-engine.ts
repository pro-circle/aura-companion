/**
 * AudioEngine — Web Audio playback graph shared by every voice engine.
 *
 *   source -> lowShelf -> presence -> compressor -> limiter -> master -> out
 *                                                      \-> analyser (lip sync)
 *
 * Processing is deliberately gentle: a touch of presence, light compression
 * and a safety limiter, so the voice stays natural rather than "produced".
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private input: AudioNode | null = null;
  private buf: Uint8Array<ArrayBuffer> | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private level = 0;

  /** Lazily created on first user-driven playback (autoplay policy safe). */
  context(): AudioContext {
    if (this.ctx) return this.ctx;
    const Ctor: typeof AudioContext =
      (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();

    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 160;
    lowShelf.gain.value = -1.5; // trim boom

    const presence = ctx.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = 3200;
    presence.Q.value = 0.9;
    presence.gain.value = 1.8; // gentle intelligibility lift

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 24;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.012;
    comp.release.value = 0.22;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;

    const master = ctx.createGain();
    master.gain.value = 1;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;

    lowShelf.connect(presence).connect(comp).connect(limiter).connect(master);
    master.connect(analyser);
    master.connect(ctx.destination);

    this.ctx = ctx;
    this.input = lowShelf;
    this.master = master;
    this.analyser = analyser;
    this.buf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    return ctx;
  }

  async resume(): Promise<void> {
    const ctx = this.context();
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    return this.context().decodeAudioData(data.slice(0));
  }

  /** Build an AudioBuffer from raw float PCM (Kokoro/Piper output). */
  fromPCM(samples: Float32Array, sampleRate: number): AudioBuffer {
    const ctx = this.context();
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(new Float32Array(samples), 0);
    return buffer;
  }

  /** Normalises peaks toward a target without squashing dynamics. */
  private normalizeGain(buffer: AudioBuffer, target = 0.82): number {
    const data = buffer.getChannelData(0);
    let peak = 0;
    const step = Math.max(1, Math.floor(data.length / 8000));
    for (let i = 0; i < data.length; i += step) peak = Math.max(peak, Math.abs(data[i] ?? 0));
    if (peak < 0.001) return 1;
    return Math.min(2.5, target / peak);
  }

  /**
   * Schedule a buffer. Returns the AudioContext time it starts at and its
   * duration so the animation rig can be scheduled against real audio.
   */
  play(
    buffer: AudioBuffer,
    options: { at?: number; gain?: number; fade?: number; onEnded?: () => void } = {},
  ): { startAt: number; duration: number } {
    const ctx = this.context();
    const startAt = Math.max(ctx.currentTime + 0.02, options.at ?? 0);
    const fade = options.fade ?? 0.012;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    const peak = (options.gain ?? 1) * this.normalizeGain(buffer);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), startAt + fade);
    gain.gain.setValueAtTime(Math.max(0.001, peak), startAt + buffer.duration - fade);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + buffer.duration);

    src.connect(gain).connect(this.input!);
    src.onended = () => {
      this.sources.delete(src);
      options.onEnded?.();
    };
    this.sources.add(src);
    src.start(startAt);
    return { startAt, duration: buffer.duration };
  }

  stopAll() {
    this.sources.forEach((src) => {
      try { src.stop(); } catch { /* already stopped */ }
    });
    this.sources.clear();
  }

  /** Current playback time base for scheduling. */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** RMS 0..1 of what's currently audible — used for lip-sync fallback. */
  analyse(): number {
    if (!this.analyser || !this.buf) return 0;
    this.analyser.getByteTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i += 4) {
      const v = ((this.buf[i] ?? 128) - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / (this.buf.length / 4));
    this.level = this.level * 0.6 + Math.min(1, rms * 4.5) * 0.4;
    return this.level;
  }

  /** Almost-imperceptible breath between phrases (filtered noise burst). */
  breath(level: number, at?: number, inhale = true): number {
    if (level <= 0.01) return 0;
    const ctx = this.context();
    const duration = inhale ? 0.28 : 0.2;
    const rate = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, Math.floor(rate * duration), rate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.86 + white * 0.14; // brown-ish noise = airy, not hissy
      const p = i / data.length;
      const env = inhale ? Math.sin(Math.PI * p) ** 1.6 : Math.sin(Math.PI * p) ** 2.2;
      data[i] = last * env;
    }

    const startAt = Math.max(ctx.currentTime + 0.01, at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = inhale ? 1500 : 900;
    band.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = 0.05 * level; // barely there, on purpose
    src.connect(band).connect(gain).connect(this.input!);
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
    src.start(startAt);
    return duration;
  }
}

export const audioEngine = new AudioEngine();