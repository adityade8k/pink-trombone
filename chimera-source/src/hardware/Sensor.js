// Preserved from the existing Arduino instrument.
export function createSensor(options={}) {
 const serial=options.serial ?? globalThis.navigator?.serial;
 const secure=options.secure ?? (globalThis.isSecureContext!==false);
 const frameType=options.frameType || 'FLEX';
 let linked=false;
 const now=options.now || (()=>performance.now());
 const notify=options.onChange || (()=>{});
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 let port=null,reader=null,readTask=null,connecting=false,stopping=false;
 let raw=null,adcMax=1023,lastReading=-Infinity,follow=true,reverse=options.reverse??false;
 let low=0,high=1023,custom=false,calibrating=false,seenLow=Infinity,seenHigh=-Infinity;
 let message=serial&&secure?'Connect your Arduino over USB.':'Open this file in desktop Chrome or Edge with Web Serial enabled.';
 let lastReceiving=false,lastNotice=0;
 function state(){
  const receiving=(!!port || linked) && raw!==null && now()-lastReading<1500;
  const fraction=raw===null?null:clamp((raw-low)/Math.max(1,high-low),0,1);
  return {supported:!!serial&&secure,connected:!!port,connecting,stopping,receiving,
   raw,adcMax,follow,reverse,low,high,custom,calibrating,
   observedLow:Number.isFinite(seenLow)?seenLow:null,observedHigh:Number.isFinite(seenHigh)?seenHigh:null,
   position:fraction===null?null:reverse?1-fraction:fraction,
   active:receiving&&follow,message};
 }
 function changed(){lastReceiving=state().receiving;notify(state());}
 function receive(line){
  // The installed sketch sends its latched button bit as MUTE,0|1.
  // The interface detects changes; repeated frames are not new presses.
  const buttonFrame=/^MUTE,([01])$/.exec(line.trim());
  if(buttonFrame){options.onButtonState?.(buttonFrame[1]==='1');return;}
  // A strict framed protocol ignores boot messages, corrupt frames and partial lines.
  const m=/^(FLEX|PITCH),(\d{1,5}),(\d{1,5})$/.exec(line.trim());
  if(!m)return;
  if(m[1]!==frameType){
   if(m[1]==='PITCH')options.onPitch?.(line);
   return;
  }
  const value=Number(m[2]),maximum=Number(m[3]);
  if(maximum<255||maximum>65535||value>maximum)return;
  if(maximum!==adcMax){adcMax=maximum;low=0;high=maximum;custom=false;calibrating=false;}
  raw=value;lastReading=now();
  if(calibrating){seenLow=Math.min(seenLow,raw);seenHigh=Math.max(seenHigh,raw);}
  message=frameType==='FLEX'?'Receiving flex readings.':'Receiving potentiometer readings.';changed();
 }
 async function readPort(selected){
  const decoder=new TextDecoder();let line='',overflow=false,failure='';
  try{
   reader=selected.readable.getReader();
   while(!stopping){
    const {value,done}=await reader.read();if(done)break;
    if(!value)continue;
    for(const char of decoder.decode(value,{stream:true})){
     if(char==='\n'){if(!overflow)receive(line);line='';overflow=false;}
     else if(!overflow){line+=char;if(line.length>96){line='';overflow=true;}}
    }
   }
  }catch(error){if(!stopping)failure='Serial input stopped. Reconnect the Arduino.';}
  finally{
   try{reader?.releaseLock();}catch(error){}reader=null;
   try{await selected.close();}catch(error){}
   if(port===selected)port=null;
   stopping=false;calibrating=false;message=failure||'Arduino disconnected. On-screen controls are available.';changed();
  }
 }
 async function connect(){
  if(port||connecting||stopping)return;
  if(!serial||!secure){changed();return;}
  connecting=true;message='Choose your Arduino serial port.';changed();
  let selected;
  try{
   selected=await serial.requestPort();
   await selected.open({baudRate:115200});
   if(!selected.readable)throw new Error('No readable stream');
   port=selected;raw=null;lastReading=-Infinity;follow=true;
   connecting=false;message='Connected. Waiting for the Arduino sketch…';changed();
   readTask=readPort(selected);
  }catch(error){
   try{await selected?.close();}catch(closeError){}
   port=null;connecting=false;
   message=error.name==='NotFoundError'?'No port selected. Click Connect Arduino to try again.':'Could not open the port. Close Serial Monitor / Plotter, check the USB cable, then reconnect.';
   changed();
  }
 }
 async function disconnect(){
  if(!port||stopping)return;
  stopping=true;message='Disconnecting…';changed();
  try{await reader?.cancel();}catch(error){}
  await readTask;
 }
 serial?.addEventListener?.('disconnect',event=>{
  if(port&&(event.port||event.target)===port)void disconnect();
 });
 function tick(){
  if(now()-lastNotice<250)return;lastNotice=now();
  if(port&&!state().receiving&&!connecting&&!stopping){
   const next=raw===null?'Connected; no readings yet. Check that the sensor sketch is uploaded at 115200 baud.':'No recent readings. Check the USB cable and reconnect if needed.';
   if(message!==next||lastReceiving){message=next;changed();}
  }
 }
 return {
  connect,disconnect,tick,getState:state,
  receiveLine:receive,
  setConnected(value){const next=!!value;if(linked===next)return;linked=next;if(!linked){raw=null;lastReading=-Infinity;calibrating=false;}changed();},
  setFollow(value){follow=!!value;changed();},
  setReverse(value){reverse=!!value;changed();},
  startCalibration(){
   if(!state().receiving)return;
   calibrating=true;seenLow=seenHigh=raw;changed();
  },
  finishCalibration(){
   if(!calibrating)return false;
   const span=seenHigh-seenLow;
   if(span<(frameType==='FLEX'?8:Math.max(16,adcMax*.05))){message=frameType==='FLEX'?'Bend and straighten further: calibration needs at least 8 ADC counts.':'Move the potentiometer through its full travel before finishing calibration.';changed();return false;}
   low=seenLow;high=seenHigh;custom=true;calibrating=false;changed();return true;
  },
  resetCalibration(){low=0;high=adcMax;custom=false;calibrating=false;changed();},
  getSettings(){return {low,high,adcMax,custom,reverse};},
  loadSettings(value){
   if(!value||!Number.isInteger(value.adcMax)||value.adcMax<255||value.adcMax>65535)return;
   if(!Number.isInteger(value.low)||!Number.isInteger(value.high)||value.low<0||value.high>value.adcMax||value.high-value.low<(frameType==='FLEX'?8:16))return;
   // A settings file cannot change the resolution of an already connected board.
   if(port&&value.adcMax!==adcMax)return;
   adcMax=value.adcMax;low=value.low;high=value.high;custom=!!value.custom;reverse=!!value.reverse;calibrating=false;changed();
  }
 };
}
