import type { MelodyPacket } from './MidiTransport.js';
/** Audio-thread clock: note timing continues when the browser throttles UI animation. */
export class MelodyClock {
  private packet: MelodyPacket | null = null;
  private elapsed = 0;
  set(packet: MelodyPacket) { this.packet = packet; this.elapsed = 0; }
  step(frames: number, rate: number): number | null | undefined {
    const p = this.packet;
    if (!p?.enabled) return undefined;
    let t = p.position + (p.playing ? this.elapsed : 0);
    this.elapsed += frames / rate;
    if (p.loop) t %= p.duration;
    if (!p.playing || t >= p.duration) return null;
    for (let i = p.notes.length - 1; i >= 0; i--) {
      const n = p.notes[i];
      if (n.start <= t && t < n.end) return n.note + p.transpose;
    }
    return null;
  }
}
