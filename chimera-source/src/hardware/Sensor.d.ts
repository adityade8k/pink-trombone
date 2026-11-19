export interface SensorState {
  supported: boolean; connected: boolean; connecting: boolean; stopping: boolean; receiving: boolean;
  raw: number | null; adcMax: number; follow: boolean; reverse: boolean; low: number; high: number;
  custom: boolean; calibrating: boolean; observedLow: number | null; observedHigh: number | null;
  position: number | null; active: boolean; message: string;
}
export interface SensorSettings { low: number; high: number; adcMax: number; custom: boolean; reverse: boolean }
export interface SerialPort { readable: ReadableStream<Uint8Array> | null; open(options: {baudRate: number}): Promise<void>; close(): Promise<void> }
export interface Serial { requestPort(): Promise<SerialPort>; addEventListener?: (name: string, handler: (event: any) => void) => void }
export function createSensor(options?: {serial?: Serial; secure?: boolean; frameType?: string; now?: () => number; reverse?: boolean; onChange?: (s: SensorState) => void; onButtonState?: (s: boolean) => void; onPitch?: (line: string) => void}): {
  connect(): Promise<void>; disconnect(): Promise<void>; tick(): void; getState(): SensorState; receiveLine(line: string): void;
  setConnected(v: boolean): void; setFollow(v: boolean): void; setReverse(v: boolean): void;
  startCalibration(): void; finishCalibration(): boolean; resetCalibration(): void;
  getSettings(): SensorSettings; loadSettings(v: unknown): void;
};
