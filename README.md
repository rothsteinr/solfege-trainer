# Solfège Trainer

A fixed-do solfège course built on A. Danhauser, *Solfège des Solfèges*, Book 1 (G. Schirmer, tr. J. H. Cornell, 1891; public domain).

Lessons 1–20 are transcribed from the book. Each lesson runs in five steps: the idea, a scale warm-up, a reading drill on the lesson's notes, a spoken pass in rhythm, and a sung pass graded by pitch detection in the browser.

Also included: a note-reading drill (treble and bass clef) and a scale trainer for every key Book 1 uses, tonic to tonic or do to do.

## Use

Open the GitHub Pages address in Chrome or Safari and allow the microphone. On an iPhone, use Safari's Share button, then Add to Home Screen.

Progress is stored in the browser on each device. Settings has a copy-and-paste code to move it between devices.

## Files

- `index.html`: page and styles
- `app.js`: views, audio, microphone, lesson runner
- `core.js`: pitch math, YIN pitch detection, grading, scales
- `lessons.js`: Danhauser Lessons 1–20 as note data
- `vexflow.js`: VexFlow 4.2.5 music notation (MIT licence)
- `sw.js`, `manifest.webmanifest`, icons: offline use and home-screen install

No build step: the files are served as they are.
