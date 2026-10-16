// Pink Trombone: potentiometer A0 -> tongue position,
// flex sensor A1 -> tongue diameter, potentiometer A2 -> pitch.
// USB serial: 115200 baud; SLIDER, FLEX and PITCH frames.
// Flex wiring: supply -> flex -> A1 -> 10k resistor -> GND.
// Pot wiring: outer pins to supply/GND; position wiper to A0, pitch wiper to A2.
// Use the board's logic supply (5V on classic Uno/Nano, 3.3V otherwise).

const int POT_PIN = A0;
const int FLEX_PIN = A1;
const int PITCH_PIN = A2;
const bool USE_POTENTIOMETER = true; // Set false if A0 is unconnected.
const int ADC_MAX = 1023; // Assumes default 10-bit analogRead().
const float SMOOTHING = 0.2f;
const unsigned long SAMPLE_INTERVAL_MS = 20;

float potSmoothed = 0;
float flexSmoothed = 0;
float pitchSmoothed = 0;
unsigned long lastSample = 0;

int readSensor(int pin) {
  analogRead(pin); // Discard first conversion after switching ADC channels.
  delayMicroseconds(200);
  long total = 0;
  for (int i = 0; i < 4; i++) total += analogRead(pin);
  return (total + 2) / 4;
}

void setup() {
  Serial.begin(115200);
  pinMode(FLEX_PIN, INPUT); // External resistor, no internal pull-up.
  if (USE_POTENTIOMETER) {
    pinMode(POT_PIN, INPUT);
    potSmoothed = readSensor(POT_PIN);
  }
  flexSmoothed = readSensor(FLEX_PIN);
  pinMode(PITCH_PIN, INPUT);
  pitchSmoothed = readSensor(PITCH_PIN);
}

void loop() {
  unsigned long now = millis();
  if (now - lastSample < SAMPLE_INTERVAL_MS) return;
  lastSample = now;

  if (USE_POTENTIOMETER) {
    potSmoothed += SMOOTHING * (readSensor(POT_PIN) - potSmoothed);
    Serial.print("SLIDER,");
    Serial.print((int)(potSmoothed + 0.5f));
    Serial.print(',');
    Serial.println(ADC_MAX);
  }

  flexSmoothed += SMOOTHING * (readSensor(FLEX_PIN) - flexSmoothed);
  Serial.print("FLEX,");
  Serial.print((int)(flexSmoothed + 0.5f));
  Serial.print(',');
  Serial.println(ADC_MAX);

  pitchSmoothed += SMOOTHING * (readSensor(PITCH_PIN) - pitchSmoothed);
  Serial.print("PITCH,");
  Serial.print((int)(pitchSmoothed + 0.5f));
  Serial.print(',');
  Serial.println(ADC_MAX);
}
