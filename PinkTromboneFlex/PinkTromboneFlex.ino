// Pink Trombone: flex sensor A1 -> tongue diameter, potentiometer A4 -> pitch.
// USB serial: 115200 baud; FLEX, PITCH and MUTE frames.
// MUTE is the legacy frame name for the latched start/stop button bit.
// Momentary normally-open button: D2 -> button -> GND (internal pull-up).
// Each press flips the button bit; the webpage toggles audio playback on changes.
// Flex wiring: supply -> flex -> A1 -> 10k resistor -> GND.
// Pitch pot wiring: outer pins to supply/GND; wiper to A4.
// Use the board's logic supply (5V on classic Uno/Nano, 3.3V otherwise).

const int FLEX_PIN = A1;
const int PITCH_PIN = A3;
const int BUTTON_PIN = 2;
const unsigned long BUTTON_DEBOUNCE_MS = 30;
const int ADC_MAX = 1023; // Assumes default 10-bit analogRead().
const float SMOOTHING = 0.2f;
const unsigned long SAMPLE_INTERVAL_MS = 20;

float flexSmoothed = 0;
float pitchSmoothed = 0;
unsigned long lastSample = 0;
bool buttonState = false;
int lastButtonReading = HIGH;
int stableButtonState = HIGH;
unsigned long buttonChangedAt = 0;

void sendButtonState() {
  Serial.print("MUTE,");
  Serial.println(buttonState ? 1 : 0);
}

void updatePlaybackButton(unsigned long now) {
  const int reading = digitalRead(BUTTON_PIN);
  if (reading != lastButtonReading) {
    lastButtonReading = reading;
    buttonChangedAt = now;
  }
  if (now - buttonChangedAt >= BUTTON_DEBOUNCE_MS && reading != stableButtonState) {
    stableButtonState = reading;
    if (stableButtonState == LOW) { // Toggle once per debounced press, never on release.
      buttonState = !buttonState;
      sendButtonState();
    }
  }
}

int readSensor(int pin) {
  analogRead(pin); // Discard first conversion after switching ADC channels.
  delayMicroseconds(200);
  long total = 0;
  for (int i = 0; i < 4; i++) total += analogRead(pin);
  return (total + 2) / 4;
}

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  // A button held during startup must be released before its first toggle.
  lastButtonReading = stableButtonState = digitalRead(BUTTON_PIN);
  buttonChangedAt = millis();
  pinMode(FLEX_PIN, INPUT); // External resistor, no internal pull-up.
  flexSmoothed = readSensor(FLEX_PIN);
  pinMode(PITCH_PIN, INPUT);
  pitchSmoothed = readSensor(PITCH_PIN);
}

void loop() {
  unsigned long now = millis();
  updatePlaybackButton(now);
  if (now - lastSample < SAMPLE_INTERVAL_MS) return;
  lastSample = now;
  // Repeat the absolute state so a newly connected page can resynchronize.
  sendButtonState();

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
