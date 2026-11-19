import type { SensorState } from './Sensor.js';
export interface MelodyNote {start: number; end: number; note: number}
export interface MelodyPacket {revision: number; enabled: boolean; playing: boolean; position: number; loop: boolean; transpose: number; duration: number; notes: MelodyNote[]}
export interface MelodyState {enabled: boolean; playing: boolean; position: number; loop: boolean; transpose: number; hardwareShift: boolean; minTranspose: number; maxTranspose: number; note: MelodyNote | null; baseNote: number; revision: number; ended: boolean}
export function createMidiTransport(song: {duration: number; notes: MelodyNote[]}, now: () => number): {
 state(): MelodyState; play(h?: SensorState): void; pause(): void; stop(): void; setTranspose(v: number, h?: SensorState): void;
 observeHardware(h: SensorState): void; follow(h?: SensorState): void; restart(h?: SensorState): void; setLoop(v: boolean): void; packet(): MelodyPacket;
};
