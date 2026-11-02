/* Solfège trainer core: pure functions shared by the app and the Node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SolfegeCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var SYL = { C: 'do', D: 're', E: 'mi', F: 'fa', G: 'sol', A: 'la', B: 'si' };
  var BEATS = { w: 4, h: 2, q: 1, e: 0.5 };

  /* "C#4" -> {letter:'C', acc:'#', octave:4} */
  function parsePitch(s) {
    var m = /^([A-G])(#|b|n)?(-?\d)$/.exec(s);
    if (!m) throw new Error('Bad pitch: ' + s);
    return { letter: m[1], acc: m[2] || '', octave: parseInt(m[3], 10) };
  }

  function pitchToMidi(s) {
    var p = parsePitch(s);
    var a = p.acc === '#' ? 1 : p.acc === 'b' ? -1 : 0;
    return 12 * (p.octave + 1) + SEMI[p.letter] + a;
  }

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function freqToMidi(f) { return 69 + 12 * Math.log2(f / 440); }

  /* Fixed-do syllable for a written pitch. Accidentals keep the plain syllable (French practice). */
  function syllable(s, useTi) {
    var p = parsePitch(s);
    if (p.letter === 'B' && useTi) return 'ti';
    return SYL[p.letter];
  }

  /* Syllable for the nearest chromatic pitch to a sung MIDI value (used by the tuner). */
  var CHROMA = [['C', ''], ['C', '#'], ['D', ''], ['E', 'b'], ['E', ''], ['F', ''], ['F', '#'], ['G', ''], ['A', 'b'], ['A', ''], ['B', 'b'], ['B', '']];
  function midiToName(m) {
    var r = Math.round(m);
    var pc = ((r % 12) + 12) % 12;
    var oct = Math.floor(r / 12) - 1;
    var c = CHROMA[pc];
    return { letter: c[0], acc: c[1], octave: oct, pitch: c[0] + c[1] + oct };
  }

  /* Parse a lesson body: bars separated by '|', tokens separated by spaces.
     Token: PITCH[:dur][!]  or  r[:dur]   (dur w|h|q|e, default from lesson; '!' = fermata) */
  function parseBars(body, defDur) {
    return body.split('|').map(function (bar) {
      return bar.trim().split(/\s+/).filter(Boolean).map(function (tok) {
        var fermata = tok.charAt(tok.length - 1) === '!';
        if (fermata) tok = tok.slice(0, -1);
        var parts = tok.split(':');
        var dur = parts[1] || defDur;
        if (!BEATS[dur]) throw new Error('Bad duration in ' + tok);
        if (parts[0] === 'r') return { rest: true, dur: dur, beats: BEATS[dur] };
        return { pitch: parts[0], midi: pitchToMidi(parts[0]), dur: dur, beats: BEATS[dur], fermata: fermata };
      });
    });
  }

  function barBeats(bar) { return bar.reduce(function (s, n) { return s + n.beats; }, 0); }

  /* Check every bar has the right number of beats (fermata final bars may be a lone whole note). */
  function validateLesson(lesson, beatsPerBar) {
    var errs = [];
    lesson.bars.forEach(function (bar, i) {
      var b = barBeats(bar);
      if (Math.abs(b - beatsPerBar) > 1e-9) errs.push('Lesson ' + lesson.n + ' bar ' + (i + 1) + ' has ' + b + ' beats');
    });
    return errs;
  }

  /* Flatten bars into a timeline in beats. */
  function timeline(bars) {
    var out = [], t = 0, idx = 0;
    bars.forEach(function (bar, bi) {
      bar.forEach(function (n, ni) {
        out.push({ i: idx++, bar: bi, pos: ni, start: t, beats: n.beats, rest: !!n.rest, midi: n.midi, pitch: n.pitch, fermata: n.fermata });
        t += n.beats;
      });
    });
    return out;
  }

  /* Fold a cents difference into [-600, 600): octave errors are ignored so any voice can sing. */
  function foldCents(c) {
    var x = ((c + 600) % 1200 + 1200) % 1200 - 600;
    return x;
  }

  function median(a) {
    if (!a.length) return NaN;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /* Grade one note from pitch samples.
     samples: [{t, midi}] (only voiced frames), window: [t0, t1] in seconds.
     Returns {status:'good'|'close'|'off'|'missed', cents} */
  var GOOD = 25, CLOSE = 50;
  function gradeNote(samples, targetMidi, t0, t1) {
    var vals = [];
    for (var i = 0; i < samples.length; i++) {
      var s = samples[i];
      if (s.t >= t0 && s.t <= t1) vals.push(foldCents((s.midi - targetMidi) * 100));
    }
    var dur = t1 - t0;
    // need voice for at least ~30% of the scored window (frames arrive ~30/s)
    var needed = Math.max(3, Math.floor(dur * 30 * 0.3));
    if (vals.length < needed) return { status: 'missed', cents: null, n: vals.length };
    var c = median(vals);
    var a = Math.abs(c);
    return { status: a <= GOOD ? 'good' : a <= CLOSE ? 'close' : 'off', cents: Math.round(c), n: vals.length };
  }

  /* Score window for a note that sounds from start to end (seconds):
     skip the attack, leave the release, shift for the singer's reaction time. */
  function scoreWindow(start, end, reaction) {
    var d = end - start;
    return [start + Math.min(0.25 * d, 0.35) + reaction, end - Math.min(0.1 * d, 0.15) + reaction];
  }

  function summarize(results) {
    var sung = results.filter(function (r) { return r; });
    var ok = sung.filter(function (r) { return r.status === 'good' || r.status === 'close'; }).length;
    var good = sung.filter(function (r) { return r.status === 'good'; }).length;
    return { total: sung.length, inTune: ok, good: good, pct: sung.length ? Math.round(100 * ok / sung.length) : 0 };
  }

  /* YIN pitch detector. Returns {freq, clarity} or null. */
  function yin(buf, sr, minF, maxF, threshold) {
    minF = minF || 70; maxF = maxF || 1100; threshold = threshold || 0.15;
    var maxTau = Math.min(Math.floor(sr / minF), buf.length >> 1);
    var minTau = Math.max(2, Math.floor(sr / maxF));
    var W = buf.length - maxTau;
    var d = new Float32Array(maxTau + 1);
    for (var tau = 1; tau <= maxTau; tau++) {
      var sum = 0;
      for (var j = 0; j < W; j++) { var x = buf[j] - buf[j + tau]; sum += x * x; }
      d[tau] = sum;
    }
    // cumulative mean normalized difference
    var run = 0; d[0] = 1;
    for (tau = 1; tau <= maxTau; tau++) { run += d[tau]; d[tau] = run ? d[tau] * tau / run : 1; }
    var best = -1;
    for (tau = minTau; tau <= maxTau; tau++) {
      if (d[tau] < threshold) {
        while (tau + 1 <= maxTau && d[tau + 1] < d[tau]) tau++;
        best = tau; break;
      }
    }
    if (best < 0) return null;
    var t = best;
    if (t > 1 && t < maxTau) {
      var a = d[t - 1], b = d[t], c = d[t + 1];
      var den = a + c - 2 * b;
      if (den) t = t + (a - c) / (2 * den);
    }
    return { freq: sr / t, clarity: 1 - d[best] };
  }

  function rms(buf) {
    var s = 0;
    for (var i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }

  /* Greedy line packing: measure widths -> rows that fit maxWidth. */
  function packRows(widths, maxWidth, firstExtra) {
    var rows = [], cur = [], w = 0;
    widths.forEach(function (mw, i) {
      var extra = cur.length === 0 ? firstExtra : 0;
      if (cur.length && w + mw > maxWidth) { rows.push(cur); cur = []; w = 0; extra = firstExtra; }
      cur.push(i); w += mw + extra;
    });
    if (cur.length) rows.push(cur);
    return rows;
  }

  /* Major / natural-minor scale spelling for the scale trainer. */
  var KEYS = {
    'C': { tonic: 'C', acc: {} },
    'G': { tonic: 'G', acc: { F: '#' } },
    'D': { tonic: 'D', acc: { F: '#', C: '#' } },
    'A': { tonic: 'A', acc: { F: '#', C: '#', G: '#' } },
    'E': { tonic: 'E', acc: { F: '#', C: '#', G: '#', D: '#' } },
    'F': { tonic: 'F', acc: { B: 'b' } },
    'Bb': { tonic: 'B', acc: { B: 'b', E: 'b' } },
    'Eb': { tonic: 'E', acc: { B: 'b', E: 'b', A: 'b' } },
    'Ab': { tonic: 'A', acc: { B: 'b', E: 'b', A: 'b', D: 'b' } }
  };
  var MINOR_OF = { 'a': ['C', 'A'], 'e': ['G', 'E'], 'b': ['D', 'B'], 'f#': ['A', 'F'], 'd': ['F', 'D'], 'g': ['Bb', 'G'], 'c': ['Eb', 'C'] };

  /* Scale as pitches. mode 'major'|'minor' (harmonic minor, as Danhauser presents it). from 'tonic'|'do' */
  function scale(keyName, from) {
    var minor = keyName === keyName.toLowerCase();
    var sig, tonicLetter;
    if (minor) { sig = KEYS[MINOR_OF[keyName][0]].acc; tonicLetter = MINOR_OF[keyName][1]; }
    else { sig = KEYS[keyName].acc; tonicLetter = KEYS[keyName].tonic; }
    var startLetter = from === 'do' ? 'C' : tonicLetter;
    var si = LETTERS.indexOf(startLetter);
    var octave = 4;
    var out = [];
    for (var k = 0; k <= 7; k++) {
      var L = LETTERS[(si + k) % 7];
      var o = octave + Math.floor((si + k) / 7);
      var acc = sig[L] || '';
      if (minor) {
        // raise the 7th degree (leading tone)
        var seventh = LETTERS[(LETTERS.indexOf(tonicLetter) + 6) % 7];
        if (L === seventh) acc = acc === 'b' ? 'n' : acc === '' ? '#' : acc;
      }
      out.push(L + (acc === 'n' ? '' : acc) + o);
    }
    if (from === 'do' && startLetter !== tonicLetter) {
      // finish on the tonic (Dalcroze): the tonic nearest the final do
      var tacc = sig[tonicLetter] || '';
      var last = pitchToMidi(out[out.length - 1]);
      var a4 = tonicLetter + tacc + '4', a5 = tonicLetter + tacc + '5';
      out.push(Math.abs(pitchToMidi(a5) - last) < Math.abs(pitchToMidi(a4) - last) ? a5 : a4);
    }
    return out;
  }

  /* Indices i where scale[i]->scale[i+1] is a half step. */
  function halfSteps(pitches) {
    var r = [];
    for (var i = 0; i + 1 < pitches.length; i++) {
      if (Math.abs(pitchToMidi(pitches[i + 1]) - pitchToMidi(pitches[i])) === 1) r.push(i);
    }
    return r;
  }

  return {
    LETTERS: LETTERS, BEATS: BEATS, KEYS: KEYS, MINOR_OF: MINOR_OF,
    parsePitch: parsePitch, pitchToMidi: pitchToMidi, midiToFreq: midiToFreq, freqToMidi: freqToMidi,
    syllable: syllable, midiToName: midiToName, parseBars: parseBars, barBeats: barBeats,
    validateLesson: validateLesson, timeline: timeline, foldCents: foldCents, median: median,
    gradeNote: gradeNote, scoreWindow: scoreWindow, summarize: summarize, yin: yin, rms: rms,
    packRows: packRows, scale: scale, halfSteps: halfSteps, GOOD: GOOD, CLOSE: CLOSE
  };
});
