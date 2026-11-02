/* Solfège Trainer: course on Danhauser Book 1 with listening, spoken and sung passes. */
(function () {
  'use strict';
  var C = window.SolfegeCore, D = window.DANHAUSER, VF = window.Vex && window.Vex.Flow;
  var $app = document.getElementById('app');

  /* ---------- storage ---------- */
  var STORE_KEY = 'solfege-trainer-v1';
  var defaults = {
    settings: { useTi: false, octave: 0, reaction: 0.08, pass: 90, guide: false, metronome: true, syllables: true, clickVol: 0.5 },
    lessons: {}, reading: {}, steps: {}
  };
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (s) return merge(JSON.parse(JSON.stringify(defaults)), s);
    } catch (e) { /* storage unavailable */ }
    return JSON.parse(JSON.stringify(defaults));
  }
  function merge(a, b) {
    Object.keys(b || {}).forEach(function (k) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]);
      else a[k] = b[k];
    });
    return a;
  }
  var state = load();
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
  var S = function () { return state.settings; };

  /* ---------- lessons ---------- */
  var LESSONS = D.raw.map(function (l) {
    var bars = C.parseBars(l.body, l.dur);
    var unit = D.units.filter(function (u) { return u.lessons.indexOf(l.n) >= 0; })[0];
    return Object.assign({}, l, { bars: bars, unit: unit });
  });
  function lessonByN(n) { return LESSONS.filter(function (l) { return l.n === n; })[0]; }
  function lessonRecord(n) { return state.lessons[n] || {}; }
  function nextLesson() {
    for (var i = 0; i < LESSONS.length; i++) if (!lessonRecord(LESSONS[i].n).passed) return LESSONS[i];
    return LESSONS[LESSONS.length - 1];
  }

  /* ---------- audio ---------- */
  /* iOS: Web Audio is "ambient" by default and the silent switch mutes it.
     "playback" (iOS 17+) makes it behave like media; "play-and-record" while the microphone is on. */
  function setAudioSession(type) {
    try { if (navigator.audioSession && navigator.audioSession.type !== type) navigator.audioSession.type = type; } catch (e) { /* not supported */ }
  }
  var Audio = {
    ctx: null, master: null, bus: null, nodes: [], unlocked: false,
    ensure: function () {
      setAudioSession(Mic && Mic.analyser ? 'play-and-record' : 'playback');
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) throw new Error('This browser has no Web Audio support.');
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
        var comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp); comp.connect(this.ctx.destination);
      }
      if (this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) { /* ignore */ } }
      if (!this.unlocked) {
        // play one silent sample inside the user's tap so iOS starts the audio output
        try {
          var b = this.ctx.createBuffer(1, 1, 22050), src = this.ctx.createBufferSource();
          src.buffer = b; src.connect(this.ctx.destination); src.start(0);
          this.unlocked = true;
        } catch (e) { /* ignore */ }
      }
      return this.ctx;
    },
    newBus: function () {
      this.stop();
      this.bus = this.ctx.createGain(); this.bus.connect(this.master);
      return this.bus;
    },
    stop: function () {
      this.nodes.forEach(function (n) { try { n.stop(0); } catch (e) { /* already stopped */ } });
      this.nodes = [];
      if (this.bus) { try { this.bus.disconnect(); } catch (e) { /* ignore */ } this.bus = null; }
    },
    tone: function (midi, t, dur, vel) {
      var ctx = this.ctx, out = this.bus || this.master;
      vel = vel || 0.22; dur = Math.max(0.12, dur);
      var f = C.midiToFreq(midi);
      var g = ctx.createGain(); g.connect(out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.015);
      g.gain.exponentialRampToValueAtTime(vel * 0.55, t + 0.22);
      g.gain.linearRampToValueAtTime(vel * 0.38, t + dur);
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.12);
      var self = this;
      [[1, 1], [2, 0.32], [3, 0.12], [4, 0.05]].forEach(function (h) {
        var o = ctx.createOscillator(), og = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f * h[0]; og.gain.value = h[1];
        o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.15);
        self.nodes.push(o);
      });
    },
    click: function (t, accent) {
      var ctx = this.ctx, out = this.bus || this.master;
      var v = S().clickVol * (accent ? 0.5 : 0.3);
      if (v <= 0) return;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = accent ? 1760 : 1320;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.06);
      this.nodes.push(o);
    },
    chord: function (midis, t, dur) {
      var self = this;
      midis.forEach(function (m, i) { self.tone(m, t + i * 0.12, dur - i * 0.12, 0.13); });
    }
  };

  /* ---------- microphone + pitch ---------- */
  var Mic = {
    analyser: null, stream: null, buf: null, lastT: 0, error: null,
    supported: function () { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },
    start: function () {
      var self = this;
      if (this.analyser) return Promise.resolve(true);
      if (!this.supported()) return Promise.reject(new Error('unsupported'));
      setAudioSession('play-and-record');
      var ctx = Audio.ensure();
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        .then(function (stream) {
          self.stream = stream;
          var src = ctx.createMediaStreamSource(stream);
          self.analyser = ctx.createAnalyser(); self.analyser.fftSize = 2048;
          src.connect(self.analyser);
          self.buf = new Float32Array(self.analyser.fftSize);
          self.error = null;
          return true;
        });
    },
    read: function () {
      if (!this.analyser) return null;
      var ctx = Audio.ctx;
      this.analyser.getFloatTimeDomainData(this.buf);
      var r = C.rms(this.buf);
      var t = ctx.currentTime - this.buf.length / ctx.sampleRate / 2 - (ctx.baseLatency || 0);
      if (r < 0.006) return { t: t, rms: r };
      var y = C.yin(this.buf, ctx.sampleRate, 65, 1100, 0.15);
      if (!y || y.clarity < 0.75) return { t: t, rms: r };
      return { t: t, rms: r, freq: y.freq, midi: C.freqToMidi(y.freq) };
    }
  };
  function micErrorText(err) {
    var n = err && err.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'The microphone was blocked. Allow microphone access for this page in your browser settings, then try again. Inside the Claude app preview the microphone is never available: open the hosted app instead.';
    if (n === 'NotFoundError') return 'No microphone was found. Connect one, or use a computer or phone with a built-in microphone.';
    if (err && err.message === 'unsupported') return 'This browser does not allow microphone access here. Open the app from its web address in Chrome or Safari.';
    return 'The microphone could not start (' + (n || (err && err.message) || 'unknown error') + ').';
  }

  /* ---------- score rendering ---------- */
  var NOTE_W = { w: 58, h: 46, q: 36, e: 30 };
  function vfKey(p) { var x = C.parsePitch(p); return x.letter.toLowerCase() + (x.acc === 'n' ? '' : x.acc) + '/' + x.octave; }
  function makeNote(n, opts) {
    var note;
    if (n.rest) {
      note = new VF.StaveNote({ keys: [n.dur === 'w' ? 'd/5' : 'b/4'], duration: n.dur + 'r', clef: opts.clef });
    } else {
      note = new VF.StaveNote({ keys: [vfKey(n.pitch)], duration: n.dur, clef: opts.clef, auto_stem: true });
      var acc = C.parsePitch(n.pitch).acc;
      if (acc && opts.accidentals !== false) note.addModifier(new VF.Accidental(acc), 0);
      if (n.fermata) note.addModifier(new VF.Articulation('a@a').setPosition(VF.Modifier.Position.ABOVE), 0);
      if (opts.syllables) {
        var a = new VF.Annotation(C.syllable(n.pitch, S().useTi));
        a.setFont('Georgia', 13, 'normal');
        a.setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM);
        note.addModifier(a, 0);
      }
    }
    return note;
  }

  /* Render bars into el. Returns {notes:[{note, el, src}], staves:[...]} in timeline order. */
  function renderScore(el, bars, opts) {
    opts = Object.assign({ clef: 'treble', syllables: true, time: true, endBar: true }, opts || {});
    el.innerHTML = '';
    if (!VF) { el.textContent = 'Music notation library failed to load.'; return { notes: [] }; }
    var holder = document.createElement('div'); el.appendChild(holder);
    var W = opts.width || Math.max(opts.minWidth || 300, Math.floor(el.clientWidth) - 10);
    var widths = bars.map(function (b) { return 22 + b.reduce(function (s, n) { return s + NOTE_W[n.dur]; }, 0); });
    var clefExtra = 46, timeExtra = opts.time ? 30 : 0;
    var rows = C.packRows(widths, W - 20 - timeExtra, clefExtra);
    var rowH = opts.syllables ? 122 : 100, top = opts.top || 4;
    var renderer = new VF.Renderer(holder, VF.Renderer.Backends.SVG);
    renderer.resize(W, rows.length * rowH + top + 8);
    var ctx = renderer.getContext();
    var out = { notes: [], staves: [], width: W };
    rows.forEach(function (row, ri) {
      var avail = W - 20 - clefExtra - (ri === 0 ? timeExtra : 0);
      var sum = row.reduce(function (s, bi) { return s + widths[bi]; }, 0);
      var scale = avail / sum;
      if (ri === rows.length - 1 && rows.length > 1 && sum < avail * 0.6) scale = Math.min(scale, 1.25);
      var x = 10;
      row.forEach(function (bi, k) {
        var w = widths[bi] * scale + (k === 0 ? clefExtra : 0) + (ri === 0 && k === 0 ? timeExtra : 0);
        var stave = new VF.Stave(x, top + ri * rowH, w);
        if (k === 0) stave.addClef(opts.clef);
        if (ri === 0 && k === 0 && opts.time) stave.addTimeSignature('C');
        if (bi === bars.length - 1 && opts.endBar) stave.setEndBarType(VF.Barline.type.END);
        stave.setContext(ctx).draw();
        var notes = bars[bi].map(function (n) { return makeNote(n, opts); });
        var voice = new VF.Voice({ num_beats: 4, beat_value: 4 }).setStrict(false).addTickables(notes);
        new VF.Formatter().joinVoices([voice]).format([voice], Math.max(20, w - (stave.getNoteStartX() - x) - 14));
        voice.draw(ctx, stave);
        notes.forEach(function (vn, ni) { out.notes.push({ note: vn, el: vn.getSVGElement(), src: bars[bi][ni], bar: bi }); });
        out.staves.push(stave);
        x += w;
      });
    });
    if (opts.halfSteps && opts.halfSteps.length) drawHalfSteps(ctx, out, opts.halfSteps);
    var svg = holder.querySelector('svg');
    if (svg) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', opts.label || 'Music notation'); }
    return out;
  }

  function drawHalfSteps(ctx, out, idxs) {
    idxs.forEach(function (i) {
      var a = out.notes[i], b = out.notes[i + 1];
      if (!a || !b) return;
      var x1 = a.note.getAbsoluteX() + 6, x2 = b.note.getAbsoluteX() + 6;
      var y = a.note.getStave().getYForLine(0) - 14;
      ctx.save(); ctx.setStrokeStyle('#2448b8'); ctx.setFillStyle('#2448b8'); ctx.setLineWidth(1.5);
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo((x1 + x2) / 2, y - 9); ctx.lineTo(x2, y); ctx.stroke();
      ctx.setFont('Georgia', 12, 'normal'); ctx.fillText('½', (x1 + x2) / 2 - 4, y - 13);
      ctx.restore();
    });
  }

  function markNote(rn, cls) {
    if (!rn || !rn.el) return;
    rn.el.classList.remove('is-current', 'is-good', 'is-close', 'is-off', 'is-missed', 'is-dim');
    if (cls) rn.el.classList.add(cls);
  }
  function clearMarks(score) { (score.notes || []).forEach(function (rn) { markNote(rn, null); }); }

  /* ---------- runner: listen / speak / sing ---------- */
  var Runner = { active: null };
  /* events: [{beat, beats, midi|null, play, grade, ref}] */
  function run(opts) {
    stopRun();
    var ctx = Audio.ensure();
    Audio.newBus();
    var spb = 60 / opts.bpm;
    var oct = 12 * (S().octave || 0);
    var t = ctx.currentTime + 0.25;
    if (opts.chord) { Audio.chord([60 + oct, 64 + oct, 67 + oct, 72 + oct], t, 1.5); t += 1.8; }
    if (opts.startMidi != null) { Audio.tone(opts.startMidi + oct, t, spb * 1.5, 0.22); t += spb * 2; }
    var countIn = opts.countIn == null ? 4 : opts.countIn;
    for (var b = 0; b < countIn; b++) Audio.click(t + b * spb, b === 0);
    var t0 = t + countIn * spb;
    var evs = opts.events.map(function (e) {
      var s = t0 + e.beat * spb, en = s + e.beats * spb;
      return Object.assign({}, e, { start: s, end: en });
    });
    var total = evs.length ? Math.max.apply(null, evs.map(function (e) { return e.beat + e.beats; })) : 0;
    if (opts.metronome) for (b = 0; b < Math.ceil(total); b++) Audio.click(t0 + b * spb, b % 4 === 0);
    evs.forEach(function (e) { if (e.play && e.midi != null) Audio.tone(e.midi + oct, e.start, (e.end - e.start) * 0.94); });
    var endT = evs.length ? evs[evs.length - 1].end : t0;
    var samples = [], graded = {}, results = new Array(evs.length);
    var cur = -1, lastRead = 0, stopped = false;
    var R = {
      stop: function (silent) {
        if (stopped) return; stopped = true; Audio.stop();
        if (!silent && opts.onStop) opts.onStop();
      }
    };
    function frame() {
      if (stopped) return;
      var now = ctx.currentTime;
      // current event
      var idx = -1;
      for (var i = 0; i < evs.length; i++) if (now >= evs[i].start && now < evs[i].end) { idx = i; break; }
      if (idx !== cur) { cur = idx; if (opts.onCurrent) opts.onCurrent(idx, evs[idx]); }
      if (now < t0 && opts.onCount) opts.onCount(Math.ceil((t0 - now) / spb));
      // pitch
      if (opts.listen && now - lastRead > 0.03) {
        lastRead = now;
        var r = Mic.read();
        if (r) {
          if (r.midi != null) samples.push({ t: r.t, midi: r.midi });
          if (opts.onPitch) opts.onPitch(r, evs[idx] || evs[nextIndex(now)]);
        }
      }
      // grading
      if (opts.listen) {
        evs.forEach(function (e, i) {
          if (!e.grade || graded[i] || e.midi == null) return;
          var w = C.scoreWindow(e.start, e.end, S().reaction);
          if (now > w[1] + 0.05) {
            graded[i] = true;
            results[i] = C.gradeNote(samples, e.midi + oct, w[0], w[1]);
            results[i].midi = e.midi;
            if (opts.onGraded) opts.onGraded(i, results[i], e);
          }
        });
      }
      if (now > endT + 0.35) {
        stopped = true; Audio.stop();
        if (opts.onEnd) opts.onEnd(results, evs);
        Runner.active = null;
        return;
      }
      requestAnimationFrame(frame);
    }
    function nextIndex(now) { for (var i = 0; i < evs.length; i++) if (evs[i].start > now) return i; return evs.length - 1; }
    requestAnimationFrame(frame);
    Runner.active = R;
    return R;
  }
  function stopRun(silent) { if (Runner.active) { Runner.active.stop(silent); Runner.active = null; } }

  function eventsFromBars(bars, play, grade) {
    var tl = C.timeline(bars);
    return tl.map(function (e) {
      var beats = e.fermata ? e.beats * 1.5 : e.beats;
      return { beat: e.start, beats: beats, midi: e.rest ? null : e.midi, play: play, grade: grade && !e.rest, ref: e.i };
    });
  }

  /* ---------- small DOM helpers ---------- */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else if (v !== false && v != null) el.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function btn(label, onclick, cls, attrs) { return h('button', Object.assign({ type: 'button', class: 'btn ' + (cls || ''), onclick: onclick }, attrs || {}), [label]); }
  function toggle(label, on, onchange) {
    var b = btn(label, function () { var v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(v)); onchange(v); }, 'toggle', { 'aria-pressed': String(!!on) });
    return b;
  }
  function stepperCtl(value, min, max, step, fmt, onchange) {
    var out = h('output', { text: fmt(value) });
    var set = function (v) { value = Math.max(min, Math.min(max, v)); out.textContent = fmt(value); onchange(value); };
    return h('div', { class: 'stepper' }, [
      h('button', { type: 'button', 'aria-label': 'Slower', onclick: function () { set(value - step); } }, ['−']), out,
      h('button', { type: 'button', 'aria-label': 'Faster', onclick: function () { set(value + step); } }, ['+'])
    ]);
  }
  function pill(rec) {
    if (rec.passed) return h('span', { class: 'pill pass', text: rec.best + '%' });
    if (rec.best != null) return h('span', { class: 'pill try', text: rec.best + '%' });
    return h('span', { class: 'pill none', text: 'new' });
  }

  /* tuner widget */
  function tunerWidget() {
    var big = h('div', { class: 'big', text: '–' }), target = h('div', { class: 'target', text: '' });
    var needle = h('div', { class: 'needle' }), cents = h('div', { class: 'cents', text: '' });
    var el = h('div', { class: 'tuner', 'aria-label': 'Pitch you are singing' }, [
      h('div', {}, [big, target]),
      h('div', { class: 'meter' }, [h('div', { class: 'scale' }), needle, h('div', { class: 'ticks' }, [h('span', { text: '−100¢' }), h('span', { text: '0' }), h('span', { text: '+100¢' })])]),
      cents
    ]);
    return {
      el: el,
      show: function (r, targetMidi) {
        if (!r || r.midi == null) { big.style.opacity = .35; return; }
        big.style.opacity = 1;
        var nm = C.midiToName(r.midi);
        big.textContent = C.syllable(nm.letter + nm.octave, S().useTi) + (nm.acc ? (nm.acc === '#' ? '♯' : '♭') : '');
        var ref = targetMidi != null ? targetMidi + 12 * (S().octave || 0) : Math.round(r.midi);
        var c = C.foldCents((r.midi - ref) * 100);
        target.textContent = targetMidi != null ? 'target ' + C.syllable(C.midiToName(targetMidi).letter + '4', S().useTi) : '';
        var pos = Math.max(-100, Math.min(100, c));
        needle.style.left = (50 + pos / 2) + '%';
        needle.style.background = Math.abs(c) <= C.GOOD ? 'var(--good)' : Math.abs(c) <= C.CLOSE ? 'var(--close)' : 'var(--off)';
        cents.textContent = (c > 0 ? '+' : '') + Math.round(c) + '¢';
      },
      reset: function () { big.textContent = '–'; target.textContent = ''; cents.textContent = ''; needle.style.left = '50%'; needle.style.background = 'var(--ink)'; }
    };
  }

  /* ---------- views ---------- */
  var cleanup = [];
  function onLeave(fn) { cleanup.push(fn); }
  function leave() { stopRun(true); cleanup.forEach(function (f) { try { f(); } catch (e) { /* ignore */ } }); cleanup = []; }

  function viewHome() {
    var passed = LESSONS.filter(function (l) { return lessonRecord(l.n).passed; }).length;
    var nx = nextLesson();
    var hero = h('section', { class: 'card hero' }, [
      h('div', { class: 'stack' }, [
        h('div', { class: 'eyebrow', text: passed === LESSONS.length ? 'All lessons passed' : 'Next lesson' }),
        h('h1', { text: 'Lesson ' + nx.n + ': ' + nx.title }),
        h('p', { class: 'muted', text: nx.focus }),
        h('div', { class: 'stack small muted' }, [
          h('div', { text: passed + ' of ' + LESSONS.length + ' lessons passed' }),
          h('div', { class: 'bar' }, [h('span', { style: 'width:' + Math.round(100 * passed / LESSONS.length) + '%' })])
        ])
      ]),
      h('a', { class: 'btn primary', href: '#lesson-' + nx.n }, [lessonRecord(nx.n).best != null ? 'Continue lesson ' + nx.n : 'Start lesson ' + nx.n])
    ]);
    var how = h('section', { class: 'card' }, [
      h('h2', { text: 'How each lesson works' }),
      h('p', { class: 'prose muted', text: 'Read the idea, warm up on the scale, drill the notes the lesson uses, say the names in rhythm, then sing it. The app listens and marks every note. Sing ' + S().pass + '% of the notes in tune to pass; you can always skip ahead.' })
    ]);
    var units = h('section', { class: 'card' }, [h('h2', { text: 'Book 1, Lessons 1–20' })].concat(D.units.map(function (u) {
      var done = u.lessons.filter(function (n) { return lessonRecord(n).passed; }).length;
      return h('div', { class: 'unit' }, [
        h('div', { class: 'unit-head' }, [h('h3', { text: u.title }), h('span', { class: 'small muted', text: done + '/' + u.lessons.length })]),
        h('div', { class: 'lessons' }, u.lessons.map(function (n) {
          var l = lessonByN(n);
          return h('a', { class: 'lesson-link' + (l === nx ? ' next' : ''), href: '#lesson-' + n }, [
            h('span', { class: 'num', text: String(n) }),
            h('span', { class: 't' }, [l.title, h('small', { text: l.sub })]),
            pill(lessonRecord(n))
          ]);
        }))
      ]);
    })));
    $app.replaceChildren(hero, how, units);
  }

  var STEP_NAMES = ['Idea', 'Warm-up', 'Reading', 'Speak', 'Sing'];
  function viewLesson(n, stepIdx) {
    leave();
    var L = lessonByN(n);
    if (!L) { location.hash = '#home'; return; }
    var rec = lessonRecord(n);
    var stepsDone = state.steps[n] || {};
    if (stepIdx == null) stepIdx = rec.best != null ? 4 : 0;
    var bpm = (state.bpm && state.bpm[n]) || L.bpm;

    var idx = LESSONS.indexOf(L);
    var prev = LESSONS[idx - 1], next = LESSONS[idx + 1];
    var head = h('section', { class: 'card' }, [
      h('div', { class: 'row spread' }, [
        h('div', { class: 'lesson-head' }, [
          h('div', { class: 'eyebrow', text: L.unit.title }),
          h('h1', { text: 'Lesson ' + L.n + ': ' + L.title }),
          h('p', { class: 'muted', text: L.sub + ' · ' + L.tempo + (L.by ? ' · ' + L.by : '') })
        ]),
        h('div', { class: 'row' }, [
          prev ? h('a', { class: 'btn', href: '#lesson-' + prev.n, 'aria-label': 'Previous lesson' }, ['‹ ' + prev.n]) : null,
          next ? h('a', { class: 'btn', href: '#lesson-' + next.n, 'aria-label': 'Next lesson' }, [next.n + ' ›']) : null
        ])
      ]),
      h('div', { class: 'steps', role: 'tablist' }, STEP_NAMES.map(function (s, i) {
        return h('button', { type: 'button', role: 'tab', class: stepsDone[i] ? 'done' : '', 'aria-current': i === stepIdx ? 'step' : false,
          onclick: function () { viewLesson(n, i); } }, [s]);
      }))
    ]);

    var panel = h('section', { class: 'card' });
    var scoreCard = h('section', { class: 'card' });
    $app.replaceChildren(head, panel, scoreCard);
    stopRun(true);

    function markStep(i) { state.steps[n] = state.steps[n] || {}; state.steps[n][i] = true; save(); }
    function nextStepBtn(i) {
      return btn(i < 4 ? 'Next: ' + STEP_NAMES[i + 1] + ' ›' : 'Next lesson ›', function () {
        markStep(i);
        if (i < 4) viewLesson(n, i + 1); else if (next) location.hash = '#lesson-' + next.n; else location.hash = '#home';
      }, 'primary');
    }

    // score (shown for every step except warm-up and reading, which bring their own)
    var score = null, scoreEl = h('div', { class: 'page' });
    var showSyl = S().syllables;
    function drawScore() { score = renderScore(scoreEl, L.bars, { syllables: showSyl, label: 'Lesson ' + L.n }); }
    var tempoCtl = stepperCtl(bpm, 40, 160, 4, function (v) { return 'tempo ' + v; }, function (v) { bpm = v; state.bpm = state.bpm || {}; state.bpm[n] = v; save(); });
    var listenBtn = btn('▶ Listen', function () { startListen(); });
    var stopBtn = btn('■ Stop', function () { stopRun(); }, '', { disabled: true });
    var sylBtn = toggle('Syllables', showSyl, function (v) { showSyl = v; S().syllables = v; save(); drawScore(); });
    var metBtn = toggle('Metronome', S().metronome, function (v) { S().metronome = v; save(); });
    var fromIn = h('input', { type: 'number', min: 1, max: L.bars.length, value: 1, id: 'bar-from', 'aria-label': 'From bar' });
    var toIn = h('input', { type: 'number', min: 1, max: L.bars.length, value: L.bars.length, id: 'bar-to', 'aria-label': 'To bar' });
    var tools = h('div', { class: 'score-tools' }, [listenBtn, stopBtn, h('span', { class: 'sep' }), tempoCtl, metBtn, sylBtn, h('span', { class: 'sep' }),
      h('span', { class: 'small muted' }, ['Bars ']), fromIn, h('span', { class: 'small muted' }, [' to ']), toIn]);
    var tempoNote = h('p', { class: 'small muted', text: L.tempo === 'Moderato' ? 'Danhauser sets Moderato at 100 to 104 beats a minute for all the elementary lessons.' : 'Lento: slow. Take the time to hear each interval before you sing it.' });
    scoreCard.append(h('div', { class: 'row spread' }, [h('h2', { text: 'The lesson' }), tempoNote]), tools, scoreEl);

    function range() {
      var a = Math.max(1, Math.min(L.bars.length, parseInt(fromIn.value, 10) || 1));
      var b = Math.max(a, Math.min(L.bars.length, parseInt(toIn.value, 10) || L.bars.length));
      return [a - 1, b - 1];
    }
    var TL = C.timeline(L.bars);
    function sliceEvents(play, grade) {
      var r = range();
      var all = eventsFromBars(L.bars, play, grade);
      var first = null;
      var out = all.filter(function (e) {
        var bar = TL[e.ref].bar;
        return bar >= r[0] && bar <= r[1];
      });
      if (out.length) first = out[0].beat;
      out.forEach(function (e) { e.beat -= first; });
      return out;
    }
    function busy(on) { listenBtn.disabled = on; stopBtn.disabled = !on; }
    function cursorOpts(extra) {
      return Object.assign({
        bpm: bpm, metronome: S().metronome,
        onCurrent: function (i, e) {
          score.notes.forEach(function (rn) { if (rn.el && rn.el.classList.contains('is-current')) rn.el.classList.remove('is-current'); });
          if (e) markNote(score.notes[e.ref], 'is-current');
        },
        onStop: function () { busy(false); clearCurrent(); },
        onEnd: function () { busy(false); clearCurrent(); }
      }, extra || {});
    }
    function clearCurrent() { if (score) score.notes.forEach(function (rn) { if (rn.el) rn.el.classList.remove('is-current'); }); }
    function startListen() {
      clearMarks(score); busy(true);
      run(cursorOpts({ events: sliceEvents(true, false), chord: true, countIn: 4 }));
    }

    // step panels
    panel.replaceChildren();
    if (stepIdx === 0) {
      panel.append(
        h('h2', { text: 'The idea' }),
        h('div', { class: 'prose' }, L.unit.concept.map(function (p) { return h('p', { text: p }); })),
        h('div', { class: 'notice info' }, [h('b', { text: 'This lesson: ' }), L.focus]),
        h('div', { class: 'row' }, [nextStepBtn(0)])
      );
    } else if (stepIdx === 1) {
      panel.append(h('h2', { text: 'Warm-up: the scale of C' }), h('p', { class: 'muted prose', text: 'Listen, then echo each note: the app plays it, you sing it back in the gap. Sing in whatever octave suits your voice; the app accepts either.' }));
      var wu = scaleTrainer({ key: 'C', from: 'tonic', compact: true });
      panel.append(wu, h('div', { class: 'row' }, [nextStepBtn(1)]));
    } else if (stepIdx === 2) {
      var pset = {};
      L.bars.forEach(function (b) { b.forEach(function (x) { if (!x.rest) pset[x.pitch] = 1; }); });
      panel.append(h('h2', { text: 'Reading: the notes in this lesson' }),
        h('p', { class: 'muted prose', text: 'Name ten notes drawn from this lesson. Click a syllable or press its key.' }),
        readingDrill({ pitches: Object.keys(pset), limit: 10, clef: 'treble', onDone: function () { markStep(2); } }),
        h('div', { class: 'row' }, [nextStepBtn(2)]));
    } else if (stepIdx === 3) {
      var countEl = h('span', { class: 'small muted' });
      var speakStart = btn('▶ Start speaking pass', function () {
        clearMarks(score); busy(true); speakStart.disabled = true; selfRate.hidden = true;
        run(cursorOpts({
          events: sliceEvents(false, false), chord: true, startMidi: null, countIn: 4, metronome: true,
          onCount: function (c) { countEl.textContent = 'Starts in ' + c; },
          onCurrent: function (i, e) { countEl.textContent = ''; clearCurrent(); if (e) markNote(score.notes[e.ref], 'is-current'); },
          onEnd: function () { busy(false); clearCurrent(); speakStart.disabled = false; selfRate.hidden = false; countEl.textContent = ''; },
          onStop: function () { busy(false); clearCurrent(); speakStart.disabled = false; countEl.textContent = ''; }
        }));
      }, 'primary');
      var selfRate = h('div', { class: 'row', hidden: true }, [
        h('span', { text: 'How did it go?' }),
        btn('Clean, every name on time', function () { rec.spoke = (rec.spoke || 0) + 1; state.lessons[n] = rec; markStep(3); save(); viewLesson(n, 4); }),
        btn('I stumbled, go again', function () { selfRate.hidden = true; })
      ]);
      panel.append(h('h2', { text: 'Speak the names in rhythm' }),
        h('p', { class: 'muted prose', text: 'After one bar of clicks, the cursor moves through the lesson at the tempo above. Say each note name as the cursor reaches it and hold it for its full value. Keep counting through the rests. Slow the tempo if you need to.' }),
        h('div', { class: 'row' }, [speakStart, countEl]), selfRate);
    } else if (stepIdx === 4) {
      singPanel();
    }

    function singPanel() {
      var tuner = tunerWidget();
      var status = h('div', { class: 'small muted', text: '' });
      var resultBox = h('div');
      var guideBtn = toggle('Play the melody while I sing', S().guide, function (v) { S().guide = v; save(); });
      var startBtn = btn('● Start singing', function () { begin(); }, 'primary');
      var micNote = h('div');
      panel.append(
        h('h2', { text: 'Sing it' }),
        h('p', { class: 'muted prose', text: 'You will hear the C chord, then your first note, then one bar of clicks. Sing the lesson on its note names. Each note turns green when it is in tune, amber when close, red when it is a different note.' }),
        h('div', { class: 'row' }, [startBtn, guideBtn]),
        h('p', { class: 'small muted', text: 'With the melody playing, use headphones; otherwise the microphone hears the speaker instead of you.' }),
        micNote, tuner.el,
        h('div', { class: 'legend' }, [h('span', { class: 'g', text: 'in tune (within 25¢)' }), h('span', { class: 'c', text: 'close (25–50¢)' }), h('span', { class: 'o', text: 'wrong note' }), h('span', { class: 'm', text: 'not heard' })]),
        status, resultBox
      );
      if (!Mic.supported()) micNote.replaceChildren(h('div', { class: 'notice', text: micErrorText({ message: 'unsupported' }) }));

      function begin() {
        resultBox.replaceChildren(); micNote.replaceChildren();
        startBtn.disabled = true; status.textContent = 'Starting the microphone…';
        Mic.start().then(function () {
          clearMarks(score); busy(true); status.textContent = '';
          var evs = sliceEvents(S().guide, true);
          var firstNote = evs.filter(function (e) { return e.midi != null; })[0];
          run(cursorOpts({
            events: evs, chord: true, startMidi: firstNote ? firstNote.midi : null, countIn: 4, listen: true,
            onCount: function (c) { status.textContent = 'Starts in ' + c; },
            onCurrent: function (i, e) {
              status.textContent = '';
              if (score) score.notes.forEach(function (rn) { if (rn.el) rn.el.classList.remove('is-current'); });
              if (e && e.midi != null && !(score.notes[e.ref].el.classList.contains('is-good'))) markNote(score.notes[e.ref], 'is-current');
            },
            onPitch: function (r, e) { tuner.show(r, e && e.midi); },
            onGraded: function (i, res, e) { markNote(score.notes[e.ref], 'is-' + res.status); },
            onEnd: function (results) { busy(false); startBtn.disabled = false; tuner.reset(); showResult(results); },
            onStop: function () { busy(false); startBtn.disabled = false; tuner.reset(); status.textContent = 'Stopped.'; }
          }));
        }).catch(function (err) {
          startBtn.disabled = false; status.textContent = '';
          micNote.replaceChildren(h('div', { class: 'notice', text: micErrorText(err) }));
        });
      }
      function showResult(results) {
        var sum = C.summarize(results.filter(Boolean));
        var r = range(); var whole = r[0] === 0 && r[1] === L.bars.length - 1;
        var pass = sum.pct >= S().pass;
        if (whole) {
          rec.best = Math.max(rec.best || 0, sum.pct);
          rec.attempts = (rec.attempts || 0) + 1;
          rec.last = new Date().toISOString().slice(0, 10);
          if (pass) rec.passed = true;
          state.lessons[n] = rec; if (pass) markStep(4); save();
        }
        var missedBars = {};
        results.forEach(function (res, i) { if (res && (res.status === 'off' || res.status === 'missed')) missedBars[score.notes[i] ? score.notes[i].bar + 1 : 0] = 1; });
        var bars = Object.keys(missedBars).map(Number).sort(function (a, b) { return a - b; });
        resultBox.replaceChildren(h('div', { class: 'result ' + (pass ? 'pass' : 'fail') }, [
          h('div', { class: 'score', text: sum.pct + '%' }),
          h('div', { class: 'stack' }, [
            h('div', { text: sum.inTune + ' of ' + sum.total + ' notes in tune' + (whole ? (pass ? '. Lesson passed.' : '. ' + S().pass + '% passes.') : ' (bars ' + (r[0] + 1) + '–' + (r[1] + 1) + ', practice run).') }),
            bars.length ? h('div', { class: 'small muted', text: 'Work on bar' + (bars.length > 1 ? 's ' : ' ') + bars.slice(0, 8).join(', ') + '. Set the bar range above to loop them slowly.' }) : null,
            h('div', { class: 'row' }, [btn('Sing again', function () { begin(); }), pass && next ? h('a', { class: 'btn primary', href: '#lesson-' + next.n }, ['Lesson ' + next.n + ' ›']) : null])
          ])
        ]));
      }
    }

    drawScore();
    var ro = new ResizeObserver(debounce(function () { if (!Runner.active) drawScore(); }, 200));
    ro.observe(scoreEl); onLeave(function () { ro.disconnect(); });
  }

  /* scale trainer: used by the Scales tab and the warm-up step */
  function scaleTrainer(o) {
    var key = o.key || 'C', from = o.from || 'tonic', bpm = 72;
    var wrap = h('div', { class: 'stack' });
    var page = h('div', { class: 'page' });
    var tuner = tunerWidget();
    var info = h('div', { class: 'small muted' });
    var score;
    function pitches() { return C.scale(key, from); }
    function draw() {
      var ps = pitches();
      var bars = [ps.map(function (p, i) { return { pitch: p, midi: C.pitchToMidi(p), dur: 'q', beats: 1, fermata: i === ps.length - 1 }; })];
      score = renderScore(page, bars, { syllables: true, time: false, halfSteps: C.halfSteps(ps), label: 'Scale', top: 30 });
      var minor = key === key.toLowerCase();
      info.textContent = (minor ? 'Harmonic minor: the seventh is raised. ' : '') + 'Half steps are marked ½. ' + (from === 'do' ? 'Fixed do from do to do, then the tonic, as Dalcroze taught it.' : '');
    }
    function evs(play) {
      return pitches().map(function (p, i) { return { beat: i, beats: 1, midi: C.pitchToMidi(p), play: play, grade: !play, ref: i }; });
    }
    function echoEvs() {
      var out = [];
      pitches().forEach(function (p, i) {
        var m = C.pitchToMidi(p);
        out.push({ beat: i * 4, beats: 1.5, midi: m, play: true, grade: false, ref: i });
        out.push({ beat: i * 4 + 2, beats: 1.6, midi: m, play: false, grade: true, ref: i, echo: true });
      });
      return out;
    }
    var bListen = btn('▶ Listen', function () { go('listen'); });
    var bEcho = btn('↺ Echo', function () { go('echo'); }, 'primary');
    var bSing = btn('● Sing alone', function () { go('sing'); });
    var bStop = btn('■ Stop', function () { stopRun(); }, '', { disabled: true });
    var status = h('div', { class: 'small muted' });
    function set(on) { bListen.disabled = bEcho.disabled = bSing.disabled = on; bStop.disabled = !on; }
    function go(mode) {
      var listen = mode !== 'listen';
      var startIt = function () {
        clearMarks(score); set(true); status.textContent = '';
        var events = mode === 'listen' ? evs(true) : mode === 'echo' ? echoEvs() : evs(false);
        run({
          bpm: bpm, events: events, chord: true, countIn: mode === 'sing' ? 4 : 2, startMidi: mode === 'sing' ? events[0].midi : null,
          metronome: mode === 'sing' && S().metronome, listen: listen,
          onCurrent: function (i, e) {
            score.notes.forEach(function (rn) { if (rn.el) rn.el.classList.remove('is-current'); });
            if (e && !(score.notes[e.ref].el.classList.contains('is-good'))) markNote(score.notes[e.ref], 'is-current');
          },
          onPitch: function (r, e) { tuner.show(r, e && e.midi); },
          onGraded: function (i, res, e) { markNote(score.notes[e.ref], 'is-' + res.status); },
          onEnd: function (results) {
            set(false); tuner.reset();
            if (listen) { var s = C.summarize(results.filter(Boolean)); status.textContent = s.inTune + ' of ' + s.total + ' notes in tune.'; }
          },
          onStop: function () { set(false); tuner.reset(); }
        });
      };
      if (!listen) return startIt();
      Mic.start().then(startIt).catch(function (err) {
        if (mode === 'echo') { status.textContent = micErrorText(err) + ' Echo will run without marking.'; mode = 'echo'; listen = false; startIt(); }
        else status.textContent = micErrorText(err);
      });
    }
    var controls = [bListen, bEcho, bSing, bStop];
    if (!o.compact) {
      var keys = h('div', { class: 'keys', role: 'group', 'aria-label': 'Key' }, ['C', 'a', 'G', 'e', 'F', 'd', 'D', 'b', 'Bb', 'g'].map(function (k) {
        var label = k === k.toLowerCase() ? k.replace('b', 'b') + ' minor' : k.replace('b', '♭') + ' major';
        label = { a: 'la minor', e: 'mi minor', d: 're minor', b: 'si minor', g: 'sol minor', C: 'do major', G: 'sol major', F: 'fa major', D: 're major', Bb: 'si♭ major' }[k];
        var b = h('button', { type: 'button', class: 'btn toggle', 'aria-pressed': String(k === key), onclick: function () {
          key = k; keys.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); stopRun(true); draw();
        } }, [label]);
        return b;
      }));
      var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Start from' }, [['tonic', 'Tonic to tonic'], ['do', 'Do to do']].map(function (x) {
        var b = h('button', { type: 'button', 'aria-pressed': String(x[0] === from), onclick: function () {
          from = x[0]; seg.querySelectorAll('button').forEach(function (y) { y.setAttribute('aria-pressed', String(y === b)); }); stopRun(true); draw();
        } }, [x[1]]);
        return b;
      }));
      wrap.append(h('div', { class: 'field' }, [h('span', { class: 'lbl', text: 'Key (in the order Book 1 introduces them)' }), keys]), h('div', { class: 'row' }, [seg]));
    }
    wrap.append(h('div', { class: 'score-tools' }, controls.concat([h('span', { class: 'sep' }), stepperCtl(bpm, 40, 140, 4, function (v) { return 'tempo ' + v; }, function (v) { bpm = v; })])), page, info, tuner.el, status);
    requestAnimationFrame(draw);
    var ro = new ResizeObserver(debounce(function () { if (!Runner.active) draw(); }, 200));
    ro.observe(page); onLeave(function () { ro.disconnect(); });
    return wrap;
  }

  /* reading drill */
  var TREBLE_RANGE = ['B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5'];
  var TREBLE_WIDE = ['G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6'];
  var BASS_RANGE = ['E2', 'F2', 'G2', 'A2', 'B2', 'C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4'];
  var SYLS = [['do', 'C', 'd', '1'], ['re', 'D', 'r', '2'], ['mi', 'E', 'm', '3'], ['fa', 'F', 'f', '4'], ['sol', 'G', 's', '5'], ['la', 'A', 'l', '6'], ['si', 'B', 't', '7']];
  function readingDrill(o) {
    var clef = o.clef || 'treble';
    var pool = o.pitches;
    var count = 0, right = 0, times = [], streak = 0, current = null, shownAt = 0, locked = false, last = null;
    var noteBox = h('div', { class: 'drill-note page' });
    var flash = h('div', { class: 'flash', 'aria-live': 'assertive' });
    var answers = h('div', { class: 'answers' }, SYLS.map(function (s) {
      var label = s[0] === 'si' && S().useTi ? 'ti' : s[0];
      return h('button', { type: 'button', 'data-letter': s[1], onclick: function () { answer(s[1]); } }, [label, h('kbd', { text: s[3] + ' · ' + (s[0] === 'si' && S().useTi ? 't' : s[2]) })]);
    }));
    var stCount = h('b', { text: '0' }), stAcc = h('b', { text: '–' }), stTime = h('b', { text: '–' });
    var stats = h('div', { class: 'stats' }, [h('div', { class: 'stat' }, [stCount, h('span', { text: 'notes' })]), h('div', { class: 'stat' }, [stAcc, h('span', { text: 'correct' })]), h('div', { class: 'stat' }, [stTime, h('span', { text: 'median time' })])]);
    var heat = h('div', { class: 'heat' });
    var playToggle = toggle('Play each note', o.sound !== false, function (v) { o.sound = v; });
    var side = h('div', { class: 'stack' }, [stats, o.limit ? null : h('div', { class: 'small muted', text: 'Accuracy per note, all sessions' }), o.limit ? null : heat, playToggle]);
    var wrap = h('div', { class: 'drill' }, [h('div', { class: 'stack' }, [noteBox, flash, answers]), side]);

    function weight(p) {
      var r = state.reading[clef + ':' + p] || { seen: 0, right: 0, ms: 0 };
      var miss = r.seen ? 1 - r.right / r.seen : 0.5;
      var slow = r.seen ? Math.min(1, (r.ms / r.seen) / 3000) : 0.5;
      return 1 + 4 * miss + slow;
    }
    function pick() {
      var cands = pool.filter(function (p) { return p !== last || pool.length < 2; });
      var ws = cands.map(weight), tot = ws.reduce(function (a, b) { return a + b; }, 0), x = Math.random() * tot;
      for (var i = 0; i < cands.length; i++) { x -= ws[i]; if (x <= 0) return cands[i]; }
      return cands[cands.length - 1];
    }
    function show() {
      if (o.limit && count >= o.limit) return finish();
      current = pick(); last = current; locked = false;
      answers.querySelectorAll('button').forEach(function (b) { b.classList.remove('right', 'wrong'); });
      renderScore(noteBox, [[{ pitch: current, midi: C.pitchToMidi(current), dur: 'w', beats: 4 }]], { clef: clef, syllables: false, time: false, endBar: false, width: 190, label: 'Note to name' });
      var svg = noteBox.querySelector('svg');
      if (svg) {
        var w = svg.getAttribute('width'), hh = svg.getAttribute('height');
        svg.setAttribute('viewBox', '0 -6 ' + w + ' ' + (hh - 0));
        svg.removeAttribute('width'); svg.removeAttribute('height');
      }
      shownAt = performance.now();
    }
    function answer(letter) {
      if (locked || !current) return;
      var ok = C.parsePitch(current).letter === letter;
      var ms = performance.now() - shownAt;
      var keyR = clef + ':' + current;
      var r = state.reading[keyR] || { seen: 0, right: 0, ms: 0 };
      r.seen++; if (ok) r.right++; r.ms += Math.min(ms, 8000); state.reading[keyR] = r; save();
      count++; if (ok) { right++; streak++; } else streak = 0;
      times.push(ms);
      var btnEl = answers.querySelector('[data-letter="' + letter + '"]');
      var correctBtn = answers.querySelector('[data-letter="' + C.parsePitch(current).letter + '"]');
      locked = true;
      if (o.sound !== false) { try { Audio.ensure(); Audio.tone(C.pitchToMidi(current) + 12 * (S().octave || 0), Audio.ctx.currentTime + 0.02, 0.6); } catch (e) { /* audio unavailable */ } }
      if (ok) { btnEl.classList.add('right'); flash.textContent = streak > 2 ? streak + ' in a row' : ''; }
      else { btnEl.classList.add('wrong'); correctBtn.classList.add('right'); flash.textContent = 'That was ' + C.syllable(current, S().useTi) + '.'; }
      stCount.textContent = String(count);
      stAcc.textContent = Math.round(100 * right / count) + '%';
      stTime.textContent = (C.median(times) / 1000).toFixed(1) + 's';
      drawHeat();
      setTimeout(show, ok ? 380 : 1100);
    }
    function drawHeat() {
      if (o.limit) return;
      heat.replaceChildren.apply(heat, pool.map(function (p) {
        var r = state.reading[clef + ':' + p];
        var pct = r && r.seen ? Math.round(100 * r.right / r.seen) : null;
        var bg = pct == null ? 'transparent' : pct >= 90 ? 'color-mix(in srgb, var(--good) 18%, transparent)' : pct >= 70 ? 'color-mix(in srgb, var(--close) 18%, transparent)' : 'color-mix(in srgb, var(--off) 16%, transparent)';
        return h('div', { style: 'background:' + bg, title: p }, [h('b', { text: C.syllable(p, S().useTi) }), h('span', { class: 'muted', text: p.slice(-1) + ' · ' + (pct == null ? '–' : pct + '%') })]);
      }));
    }
    function finish() {
      current = null; flash.textContent = '';
      answers.querySelectorAll('button').forEach(function (b) { b.classList.remove('right', 'wrong'); });
      noteBox.replaceChildren(h('div', { class: 'stack', style: 'text-align:center;padding:24px' }, [
        h('h3', { text: right + ' of ' + count + ' correct' }),
        h('p', { class: 'muted', text: 'Median ' + (C.median(times) / 1000).toFixed(1) + ' s per note.' }),
        btn('Ten more', function () { count = 0; right = 0; times = []; show(); })
      ]));
      if (o.onDone) o.onDone(right, count);
    }
    function onKey(e) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      var k = e.key.toLowerCase();
      for (var i = 0; i < SYLS.length; i++) if (k === SYLS[i][2] || k === SYLS[i][3] || (SYLS[i][0] === 'si' && k === 'i')) { answer(SYLS[i][1]); e.preventDefault(); return; }
    }
    document.addEventListener('keydown', onKey);
    onLeave(function () { document.removeEventListener('keydown', onKey); });
    o.setPool = function (p, c) { pool = p; clef = c; drawHeat(); show(); };
    requestAnimationFrame(function () { show(); drawHeat(); });
    return wrap;
  }

  function viewReading() {
    var mode = 'lesson';
    var cfg = {};
    var drillHolder = h('div');
    function build() {
      var pitches = mode === 'lesson' ? TREBLE_RANGE : mode === 'wide' ? TREBLE_WIDE : BASS_RANGE;
      leave();
      drillHolder.replaceChildren(readingDrill(cfg = { pitches: pitches, clef: mode === 'bass' ? 'bass' : 'treble' }));
    }
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Range' }, [['lesson', 'Treble, Lessons 1–20 (si to mi)'], ['wide', 'Treble, wide (sol to do)'], ['bass', 'Bass clef']].map(function (x) {
      var b = h('button', { type: 'button', 'aria-pressed': String(x[0] === mode), onclick: function () {
        mode = x[0]; seg.querySelectorAll('button').forEach(function (y) { y.setAttribute('aria-pressed', String(y === b)); }); build();
      } }, [x[1]]);
      return b;
    }));
    $app.replaceChildren(h('section', { class: 'card' }, [
      h('h1', { text: 'Note reading' }),
      h('p', { class: 'muted prose', text: 'Name each note as fast as you can. Notes you miss or answer slowly come back more often. Keys: d r m f s l t, or 1 to 7.' }),
      seg, drillHolder
    ]));
    build();
  }

  function viewScales() {
    $app.replaceChildren(h('section', { class: 'card' }, [
      h('h1', { text: 'Scales' }),
      h('p', { class: 'muted prose', text: 'Every key Book 1 uses, in its order. In fixed do the names never change: in sol major you still sing fa on F♯. Listen for where the half steps fall. Echo plays a note and gives you a gap to sing it back.' }),
      scaleTrainer({ key: 'C', from: 'tonic' })
    ]));
  }

  function viewSettings() {
    var s = S();
    var tuner = tunerWidget();
    var micBtn, micOn = false, raf = 0;
    function micLoop() {
      if (!micOn) return;
      var r = Mic.read(); if (r) tuner.show(r, null);
      raf = requestAnimationFrame(micLoop);
    }
    micBtn = btn('Test microphone', function () {
      if (micOn) { micOn = false; cancelAnimationFrame(raf); micBtn.textContent = 'Test microphone'; tuner.reset(); return; }
      Mic.start().then(function () { micOn = true; micBtn.textContent = 'Stop test'; micLoop(); })
        .catch(function (err) { micMsg.textContent = micErrorText(err); });
    });
    var micMsg = h('p', { class: 'small muted' });
    onLeave(function () { micOn = false; cancelAnimationFrame(raf); });

    function segField(label, help, options, value, onset) {
      var seg = h('div', { class: 'seg', role: 'group', 'aria-label': label }, options.map(function (x) {
        var b = h('button', { type: 'button', 'aria-pressed': String(x[0] === value), onclick: function () {
          seg.querySelectorAll('button').forEach(function (y) { y.setAttribute('aria-pressed', String(y === b)); }); onset(x[0]); save();
        } }, [x[1]]);
        return b;
      }));
      return h('div', { class: 'field' }, [h('span', { class: 'lbl', text: label }), help ? h('span', { class: 'small muted', text: help }) : null, seg]);
    }
    var exportBox = h('textarea', { id: 'export', readonly: true, 'aria-label': 'Progress code' });
    var importBox = h('textarea', { id: 'import', placeholder: 'Paste a progress code here', 'aria-label': 'Paste progress code' });
    var ioMsg = h('p', { class: 'small muted' });
    function code() { return btoa(unescape(encodeURIComponent(JSON.stringify({ lessons: state.lessons, reading: state.reading, steps: state.steps, settings: state.settings, bpm: state.bpm || {} })))); }

    $app.replaceChildren(
      h('section', { class: 'card' }, [
        h('h1', { text: 'Settings' }),
        segField('Seventh syllable', 'Danhauser and the French tradition use si. Some teachers use ti.', [[false, 'si'], [true, 'ti']], s.useTi, function (v) { s.useTi = v; }),
        segField('Playback octave', 'Men usually sing treble-clef notes an octave lower. Grading accepts any octave either way.', [[0, 'As written'], [-1, 'One octave lower']], s.octave, function (v) { s.octave = v; }),
        segField('Pass mark', 'Share of notes that must be in tune (within 50 cents) to pass a lesson.', [[80, '80%'], [90, '90%'], [95, '95%']], s.pass, function (v) { s.pass = v; }),
        segField('Click volume', null, [[0, 'Off'], [0.25, 'Soft'], [0.5, 'Medium'], [0.9, 'Loud']], s.clickVol, function (v) { s.clickVol = v; }),
        segField('Reaction allowance', 'How far behind the beat the app still counts your note.', [[0.04, 'Tight'], [0.08, 'Normal'], [0.15, 'Relaxed']], s.reaction, function (v) { s.reaction = v; })
      ]),
      h('section', { class: 'card' }, [
        h('h2', { text: 'Microphone' }),
        h('p', { class: 'muted prose', text: 'Sing a steady note. The syllable should match what you sing and the needle should settle near the centre.' }),
        h('div', { class: 'row' }, [micBtn]), micMsg, tuner.el
      ]),
      h('section', { class: 'card' }, [
        h('h2', { text: 'Move progress between devices' }),
        h('p', { class: 'muted prose', text: 'Progress is saved in this browser only. To continue on another device, copy this code there and paste it below.' }),
        h('div', { class: 'row' }, [btn('Show my progress code', function () { exportBox.value = code(); exportBox.select(); }), btn('Copy', function () {
          exportBox.value = code();
          if (navigator.clipboard) navigator.clipboard.writeText(exportBox.value).then(function () { ioMsg.textContent = 'Copied.'; }, function () { exportBox.select(); ioMsg.textContent = 'Select the code and copy it.'; });
          else { exportBox.select(); ioMsg.textContent = 'Select the code and copy it.'; }
        })]),
        exportBox, importBox,
        h('div', { class: 'row' }, [btn('Load pasted progress', function () {
          try {
            var data = JSON.parse(decodeURIComponent(escape(atob(importBox.value.trim()))));
            ['lessons', 'reading', 'steps', 'settings', 'bpm'].forEach(function (k) { if (data[k]) state[k] = data[k]; });
            state.settings = merge(JSON.parse(JSON.stringify(defaults.settings)), state.settings);
            save(); ioMsg.textContent = 'Progress loaded.';
          } catch (e) { ioMsg.textContent = 'That code could not be read. Copy it again, all of it.'; }
        }), btn('Reset all progress', function () {
          if (resetArmed) { state = JSON.parse(JSON.stringify(defaults)); save(); ioMsg.textContent = 'Progress cleared.'; resetArmed = false; }
          else { resetArmed = true; ioMsg.textContent = 'Press Reset again to clear every lesson and reading statistic.'; }
        })]), ioMsg
      ]),
      h('section', { class: 'card' }, [
        h('h2', { text: 'Install on your iPhone' }),
        h('p', { class: 'muted prose', text: 'Open this page in Safari, tap the Share button, then Add to Home Screen. It opens full screen like an app and works offline after the first visit.' })
      ])
    );
    var resetArmed = false;
  }

  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  /* ---------- router ---------- */
  function route() {
    leave();
    var hsh = (location.hash || '#home').slice(1);
    var navKey = hsh.indexOf('lesson-') === 0 ? 'home' : hsh;
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === navKey) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    if (hsh.indexOf('lesson-') === 0) return viewLesson(parseInt(hsh.slice(7), 10));
    if (hsh === 'reading') return viewReading();
    if (hsh === 'scales') return viewScales();
    if (hsh === 'settings') return viewSettings();
    return viewHome();
  }
  window.addEventListener('hashchange', route);
  // start audio on the first tap anywhere, so later sounds are allowed on iPhone
  ['pointerdown', 'touchend', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, function first() {
      try { Audio.ensure(); } catch (e) { /* no audio */ }
      document.removeEventListener(ev, first, true);
    }, true);
  });
  route();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    try { navigator.serviceWorker.register('sw.js').catch(function () { /* not available here */ }); } catch (e) { /* sandboxed */ }
  }
  window.__solfege = { state: state, C: C, run: run, Mic: Mic, Audio: Audio, LESSONS: LESSONS };
})();
