import { createSensor } from './Sensor.js';
import { createMidiTransport } from './MidiTransport.js';
import song from './melody.json';
import { noteHz, pitchStep, tongueHeight } from './mapping.ts';
import { useStore } from '../ui/store.ts';
import { engine } from '../audio/AudioEngine.ts';

export { song };
export const melody = createMidiTransport(song, () => engine.ctx?.currentTime ?? 0);
let lastButton: boolean | null = null;
let heldPitch: number | null = null;
let revision = -1;
let applying = false;
let actions = Promise.resolve();
const save = () => {
  try { localStorage.setItem('chimera-arduino-v1', JSON.stringify({flex: flex.getSettings(), pitch: pitch.getSettings()})); } catch {}
};
export function syncMelody() {
  if (revision === melody.state().revision) return;
  revision = melody.state().revision;
  engine.setMelody(melody.packet());
}
export const pitch = createSensor({ frameType: 'PITCH', onChange: () => applyHardware() });
export const flex = createSensor({
  frameType: 'FLEX', reverse: true,
  onPitch: line => pitch.receiveLine(line),
  onButtonState: bit => {
    const previous = lastButton; lastButton = bit;
    if (previous === null || previous === bit || useStore.getState().mode !== 'play') return;
    actions = actions.then(async () => {
      if (useStore.getState().mode !== 'play') return;
      if (melody.state().enabled) await toggleMelody();
      else await useStore.getState().toggleBreath();
    }).catch(() => {});
  },
  onChange: state => {
    pitch.setConnected(state.connected);
    if (!state.connected) { lastButton = null; heldPitch = null; }
    applyHardware();
  },
});
export function applyHardware() {
  const s = useStore.getState();
  if (s.mode !== 'play') return;
  applying = true;
  try {
    const f = flex.getState(), p = pitch.getState();
    if (f.active && f.position !== null && !f.calibrating) {
      const tbY = tongueHeight(f.position);
      if (s.artic.tbY !== tbY) s.setArtic({tbY});
    }
    melody.observeHardware(p);
    if (p.active && p.position !== null && !p.calibrating && !melody.state().enabled) {
      heldPitch = pitchStep(p.position, heldPitch);
      const f0 = noteHz(heldPitch);
      if (s.source.f0 !== f0) s.setSource({f0});
    }
    syncMelody();
  } finally { applying = false; }
}
export async function toggleMelody(restart = false) {
  const s = useStore.getState();
  if (s.mode !== 'play') return;
  if (melody.state().playing && !restart) melody.pause();
  else {
    await s.start();
    if (!useStore.getState().started || useStore.getState().mode !== 'play') return;
    s.setHold(false);
    if (restart) melody.restart(pitch.getState()); else melody.play(pitch.getState());
  }
  syncMelody();
}
export function stopMelody() { melody.stop(); syncMelody(); applyHardware(); }
export function rememberCalibration() { save(); }
try {
  const v = JSON.parse(localStorage.getItem('chimera-arduino-v1') ?? 'null');
  if (v) { flex.loadSettings(v.flex); pitch.loadSettings(v.pitch); }
} catch {}
// Screen edits take over their own control, without disabling the other sensor.
useStore.subscribe((s, prev) => {
  if (s.mode !== prev.mode) {
    if (prev.mode === 'play') { melody.stop(); syncMelody(); s.setHold(false); }
    else if (s.mode === 'play') applyHardware();
    return;
  }
  if (applying || s.mode !== 'play') return;
  if (s.source.f0 !== prev.source.f0) pitch.setFollow(false);
  if (s.artic.tbY !== prev.artic.tbY) flex.setFollow(false);
});
