# Chimera + Arduino

Double-click `start.command` to open Chimera in Chrome. Keep its terminal window open while playing. The app runs at http://127.0.0.1:5319/; a stable local address preserves browser calibration between launches.

The default Clay 3D view shows a sculpted side section. The tongue follows the flex sensor and the on-screen articulators. Drag to turn the sculpture slightly, scroll or pinch to zoom, and double-click to reset. Switch off Clay 3D for the original 2D editing handles.

Connect Arduino, select the board, then press Breathe or D2. Close Serial Monitor first. Sound comes from the computer.

- A1: flex sensor → tongue height (the nearest equivalent of Pink Trombone’s diameter).
- A3: pitch potentiometer → C3–C6, in 37 semitone steps.
- D2: toggle sound, or pause/resume the saved melody. The first button frame sets a baseline.
- Calibrate each sensor through its full travel, then finish calibration. Use Reverse as needed.
- Screen pitch/tongue edits pause the corresponding sensor. Follow sensor resumes it.
- The hardware controls operate in Play mode; other Chimera modes remain available.
- Saved melody: expand its panel to play, transpose, restart or loop it. Notes run on the audio thread.

The existing Arduino sketch is unchanged. Its current pitch input is A3; its old A4 comments are stale. No re-upload is needed.

The complete editable Chimera source is in `chimera-source/`. Install Rust (with wasm32-unknown-unknown) and Bun, then follow its README to build. Copy the generated `dist/` contents into this folder when rebuilding. `index.html`, `assets/`, `data/` and `fonts/` are the ready-to-run app, so normal use does not require build tools or internet access.

Upstream: https://github.com/jamesondh/chimera-vocal-synth
Version: 1d3ea496cad0fbe3e73361515aec187e868fbd47 (MIT; see CHIMERA-LICENSE.txt and bundled third-party licenses).

The original app, launcher, MIDI and Arduino files are backed up in Pink-Trombone-backup.zip in this chat’s outputs. Existing Git history and working edits were preserved. To restore, extract that backup over this folder.
