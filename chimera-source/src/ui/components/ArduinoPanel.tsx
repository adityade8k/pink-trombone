import { useEffect, useState } from 'react';
import { useStore } from '../store.ts';
import { Screen } from './Screen.tsx';
import { flex, pitch, melody, song, toggleMelody, stopMelody, syncMelody, applyHardware, rememberCalibration } from '../../hardware/controller.ts';
import { noteName } from './VoiceControls.tsx';

export function ArduinoPanel() {
  const mode = useStore(s => s.mode);
  const f0 = useStore(s => s.source.f0);
  const tbY = useStore(s => s.artic.tbY);
  const hold = useStore(s => s.hold);
  const [, redraw] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => { flex.tick(); applyHardware(); redraw(n => n + 1); }, 100);
    return () => clearInterval(timer);
  }, []);
  const f = flex.getState(), m = melody.state();
  const refresh = (fn: () => void) => { fn(); rememberCalibration(); redraw(n => n + 1); };
  return <Screen className="arduino-panel" title="Arduino" sub="A1 flex · A3 pitch · D2 start / stop">
    <div className="arduino-connect">
      <button disabled={!f.supported || f.connecting || f.stopping} onClick={() => {
        if (f.connected) void flex.disconnect();
        else { void useStore.getState().start(); void flex.connect(); }
      }}>{f.connected ? 'Disconnect Arduino' : f.connecting ? 'Connecting…' : 'Connect Arduino'}</button>
      <span role="status">{f.message}</span>
      <span>D2: {m.enabled ? (m.playing ? 'Melody playing' : 'Melody paused') : hold ? 'Sound on' : 'Sound off'}</span>
    </div>
    {mode !== 'play' && <p>Arduino controls are paused. Select Play to use the sensors and D2 button.</p>}
    <div className="arduino-sensors">
      {([{sensor: flex, label: 'A1 · Tongue height', value: `${tbY.toFixed(2)} cm`}, {sensor: pitch, label: 'A3 · Pitch', value: `${noteName(f0)} · ${f0.toFixed(1)} Hz`}] as const).map(({sensor, label, value}) => {
        const s = sensor.getState();
        return <div className="arduino-sensor" key={label}>
          <strong>{label}</strong><output>{value}</output>
          <div className="arduino-row"><label><input type="checkbox" checked={s.follow} onChange={e => refresh(() => sensor.setFollow(e.target.checked))}/>Follow sensor</label>
          <label><input type="checkbox" checked={s.reverse} onChange={e => refresh(() => sensor.setReverse(e.target.checked))}/>Reverse</label></div>
          <div className="arduino-row"><meter min="0" max="1" value={s.position ?? 0} aria-label={`${label} calibrated input`}/><span>{s.receiving ? s.raw : '—'} / {s.adcMax}</span></div>
          <div className="arduino-row"><button disabled={!s.receiving} onClick={() => refresh(() => { if (s.calibrating) sensor.finishCalibration(); else sensor.startCalibration(); })}>{s.calibrating ? 'Finish calibration' : sensor === flex ? 'Calibrate flex' : 'Calibrate pitch'}</button>
          <button onClick={() => refresh(() => sensor.resetCalibration())}>Reset range</button></div>
          <small>{s.calibrating ? `Move through full travel: ${s.observedLow}–${s.observedHigh}. ${s.message}` : `Range ${s.low}–${s.high}${s.custom ? ' · calibrated' : ''}`}</small>
        </div>;
      })}
    </div>
    <details className="arduino-melody"><summary>Saved melody · {song.title}</summary>
      <div className="arduino-row"><button disabled={mode !== 'play'} onClick={() => void toggleMelody()}>{m.playing ? 'Pause melody' : 'Play melody'}</button><button disabled={mode !== 'play'} onClick={() => void toggleMelody(true)}>Restart melody</button><button disabled={!m.enabled} onClick={stopMelody}>Stop melody</button>
      <label><input type="checkbox" checked={m.loop} onChange={e => refresh(() => {melody.setLoop(e.target.checked); syncMelody();})}/>Loop</label></div>
      <label className="arduino-shift">Pitch shift: {m.transpose} semitones<input aria-label="Melody pitch shift" type="range" min={m.minTranspose} max={m.maxTranspose} value={m.transpose} onChange={e => refresh(() => {melody.setTranspose(Number(e.target.value), pitch.getState()); syncMelody();})}/></label>
      <button onClick={() => refresh(() => {melody.follow(pitch.getState()); syncMelody();})}>Reset pitch shift</button>
      <progress max={song.duration} value={m.position} aria-label="Melody playback"/><span>{m.position.toFixed(1)} / {song.duration.toFixed(1)} s</span>
      <p>Turn the pitch knob to transpose the melody. A1 shapes the tongue. D2 pauses and resumes playback.</p>
    </details>
    <details><summary>Connection & controls</summary><p>Use desktop Chrome or Edge. Close Arduino Serial Monitor, connect the board, then press Breathe or D2. Pitch spans C3–C6 in 37 semitone steps. Calibrate flex by bending and straightening it before pressing Finish calibration.</p><p>A1 controls tongue height, Chimera’s equivalent of the old tongue-diameter control. Front-to-back position is unchanged by the sensor. Editing pitch or tongue height on screen pauses that sensor; check Follow sensor to resume. Calibration is saved in this browser.</p><p>The existing sketch is compatible at 115200 baud: FLEX, PITCH and MUTE frames. The current sketch reads pitch on A3. D2 connects to GND using the internal pull-up; first connection reads its state without toggling sound.</p></details>
  </Screen>;
}
