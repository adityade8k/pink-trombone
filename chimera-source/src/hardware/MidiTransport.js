// Preserved from the existing Arduino instrument.
export function createMidiTransport(song, now) {
 const minTranspose=48-Math.min(...song.notes.map(n=>n.note));
 const maxTranspose=84-Math.max(...song.notes.map(n=>n.note));
 let enabled=false,playing=false,offset=0,anchor=0,loop=false,transpose=0,revision=0,hardwareShift=false;
 let hardwareAnchor=null,hardwareSignature=null;
 function position(){
  const elapsed=offset+(playing?Math.max(0,now()-anchor):0);
  return loop?elapsed%song.duration:Math.min(song.duration,elapsed);
 }
 function state(){
  const pos=position(),running=playing&&(loop||pos<song.duration);
  // Last note-on wins through overlaps; an older note-off cannot cut it short.
  const note=running?(song.notes.findLast(n=>n.start<=pos&&pos<n.end)??null):null;
  const baseNote=song.notes.findLast(n=>n.start<=pos)?.note??song.notes[0].note;
  return {enabled,playing:running,position:pos,loop,transpose,hardwareShift,minTranspose,maxTranspose,note,baseNote,revision,ended:enabled&&!loop&&pos>=song.duration};
 }
 function armHardware(hardware){
  hardwareAnchor=hardware?.active?hardware.position:null;
  hardwareSignature=hardware?.active?[hardware.low,hardware.high,hardware.reverse].join(':'):null;
 }
 function play(hardware){
  offset=position();if(offset>=song.duration)offset=0;
  enabled=playing=true;anchor=now();hardwareShift=false;armHardware(hardware);revision++;
 }
 function pause(){offset=position();playing=false;revision++;}
 function stop(){enabled=playing=false;offset=transpose=0;hardwareShift=false;armHardware(null);revision++;}
 function setTranspose(value,hardware){
  transpose=Math.max(minTranspose,Math.min(maxTranspose,Math.round(value)));
  hardwareShift=false;armHardware(hardware);revision++;
 }
 function observeHardware(hardware){
  if(!enabled)return;
  if(!hardware.active){
   armHardware(null);
   hardwareShift=false;
   return;
  }
  const signature=[hardware.low,hardware.high,hardware.reverse].join(':');
  if(hardwareAnchor===null||hardwareSignature!==signature||hardware.calibrating){hardwareShift=false;armHardware(hardware);return;}
  // A deliberate move takes over transposition; the MIDI notes and rests keep playing.
  if(!hardwareShift&&Math.abs(hardware.position-hardwareAnchor)<.02)return;
  const exact=minTranspose+(maxTranspose-minTranspose)*hardware.position;
  if(!hardwareShift||Math.abs(exact-transpose)>.62){
   const next=Math.round(exact);
   if(next!==transpose){transpose=next;revision++;}
  }
  hardwareShift=true;
 }
 return {state,play,pause,stop,setTranspose,observeHardware,
  follow(hardware){setTranspose(0,hardware);},
  restart(hardware){offset=0;playing=false;play(hardware);},
  setLoop(value){const s=state();offset=s.position;playing=s.playing;anchor=now();loop=!!value;revision++;},
  packet(){const s=state();return {revision,enabled,playing:s.playing,position:s.position,loop,transpose,duration:song.duration,notes:song.notes};}
 };
}
