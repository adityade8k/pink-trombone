import {test, expect} from 'bun:test';
import {createSensor} from '../src/hardware/Sensor.js';
import {createMidiTransport} from '../src/hardware/MidiTransport.js';
import {MelodyClock} from '../src/hardware/MelodyClock.ts';
import {pitchStep, noteHz, tongueHeight} from '../src/hardware/mapping.ts';

test('Arduino stream routes split frames, ignores corruption, calibrates, overrides and disconnects', async () => {
 let stream!: ReadableStreamDefaultController<Uint8Array>, time = 0;
 let opened = false, transitions = 0, previous: boolean | null = null;
 const port = {readable: new ReadableStream<Uint8Array>({start(c) {stream = c;}}), async open(o: {baudRate: number}) {expect(o.baudRate).toBe(115200);opened = true;}, async close() {opened = false;}};
 const pitch = createSensor({frameType: 'PITCH', now: () => time});
 const flex = createSensor({serial: {async requestPort() {return port;}}, now: () => time, onPitch: line => pitch.receiveLine(line), onChange: s => pitch.setConnected(s.connected), onButtonState: bit => {if(previous !== null && bit !== previous) transitions++; previous = bit;}});
 const send = async (v: string) => {stream.enqueue(new TextEncoder().encode(v)); await new Promise(r => setTimeout(r, 0));};
 await flex.connect(); expect(opened).toBe(true);
 await send('MUTE,0\nMUTE,0\nFLEX,200,1023\r\nPIT'); expect(pitch.getState().raw).toBe(null);
 await send('CH,512,1023\nMUTE,1\nMUTE,1\n'); expect(pitch.getState().raw).toBe(512); expect(transitions).toBe(1);
 await send('PITCH,-1,1023\nPITCH,1024,1023\nPITCH,10,0\n'+ 'x'.repeat(100)+'\n'); expect(pitch.getState().raw).toBe(512);
 flex.startCalibration(); await send('FLEX,800,1023\n'); expect(flex.finishCalibration()).toBe(true);
 expect(flex.getState().position).toBe(1); flex.setReverse(true); expect(flex.getState().position).toBe(0);
 flex.setFollow(false); expect(flex.getState().active).toBe(false); expect(pitch.getState().active).toBe(true);
 time = 1600; expect(pitch.getState().active).toBe(false);
 await flex.disconnect(); expect(opened).toBe(false); expect(pitch.getState().raw).toBe(null);
});
test('pitch spans C3–C6, hysteresis stops jitter, flex changes only the intended height', () => {
 expect(pitchStep(0,null)).toBe(48); expect(pitchStep(1,null)).toBe(84);
 expect(noteHz(69)).toBe(440); expect(pitchStep(12.55/36,60)).toBe(60);
 expect(pitchStep(12.63/36,60)).toBe(61);
 expect(tongueHeight(0)).toBe(7.5); expect(tongueHeight(1)).toBe(5.7);
});
test('melody uses the audio clock for overlap, rests, pause, transpose, loop and return to manual', () => {
 const song = {duration: 1, notes: [{start: 0,end: .4,note:60},{start:.3,end:.5,note:64},{start:.7,end:1,note:67}]};
 let now = 0; const t = createMidiTransport(song, () => now), c = new MelodyClock();
 t.play(); c.set(t.packet()); expect(c.step(350,1000)).toBe(60); expect(c.step(200,1000)).toBe(64); expect(c.step(200,1000)).toBe(null); expect(c.step(300,1000)).toBe(67); expect(c.step(1,1000)).toBe(null);
 now = .35; t.pause(); c.set(t.packet()); expect(c.step(100,1000)).toBe(null);
 now = 5; t.play(); t.setTranspose(2); c.set(t.packet()); expect(c.step(100,1000)).toBe(66);
 t.setLoop(true); t.restart(); c.set(t.packet()); c.step(1100,1000); expect(c.step(1,1000)).toBe(62);
 t.stop(); c.set(t.packet()); expect(c.step(128,48000)).toBe(undefined);
});
