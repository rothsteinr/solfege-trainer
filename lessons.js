/* Danhauser, Solfège des Solfèges, Book 1 (Schirmer ed., tr. J.H. Cornell, 1891/1906; public domain).
   Lessons 1–20, transcribed from the scan. Notes are written pitch, treble clef, C major, common time.
   Repeat signs in Lessons 1–10 are not repeated here; the final note carries the fermata. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DANHAUSER = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var units = [
    {
      id: 'scale', title: 'The scale of C', lessons: [1, 2],
      concept: [
        'In fixed do the syllable belongs to the note, not to the key: do is always C, re is always D, and so on up to si (B).',
        'Book 1 opens with the C major scale because here fixed do and the key agree: do is also the home note. Use these first lessons to fix the sound of each step against do.',
        'Listen for the two half steps: mi–fa and si–do. Every other step in the scale is a whole step.'
      ]
    },
    {
      id: 'intervals', title: 'Intervals', lessons: [3, 4, 5, 6, 7, 8, 9, 10],
      concept: [
        'Each lesson pairs one interval going up with the next smaller one coming down (or the reverse), climbing the scale one step at a time.',
        'Hear the second note before you sing it. If a leap is unsure, fill it in silently: think the scale notes between the two, then sing only the target.',
        'Lesson 10 measures every interval from do, then every interval back down to do. It is the reference for the whole unit.'
      ]
    },
    {
      id: 'whole', title: 'Whole notes and whole rests', lessons: [11, 12],
      concept: [
        'The lessons now become melodies. The whole note lasts four beats; the whole rest is four beats of silence.',
        'Beat time with your hand or follow the metronome. Hold each note for its full value and come in exactly on the next bar after a rest.',
        'Danhauser marks the elementary Moderato at 100 to 104 beats a minute, one beat per quarter note.'
      ]
    },
    {
      id: 'half', title: 'Half notes and half rests', lessons: [13, 14, 15, 16, 17],
      concept: [
        'The half note lasts two beats; the half rest is two beats of silence. Two halves fill a bar of common time.',
        'Several of these lessons begin on the rest. Count the silent beats and enter on beat 3 without rushing.',
        'Lesson 14 is a sequence: the same three-bar figure moves up one step at a time, then comes back down. Once you know the figure, read the steps.'
      ]
    },
    {
      id: 'mixed', title: 'Whole notes and half notes', lessons: [18, 19, 20],
      concept: [
        'Now both values appear together. Feel the difference between a note that ends on beat 3 and one that carries through the bar.',
        'Lesson 18 climbs the scale in a mix of halves and wholes, then turns down through broken chords of C major (sol, do, mi).'
      ]
    }
  ];

  var raw = [
    { n: 1, title: 'Scale of C major', sub: 'Whole notes', tempo: 'Lento', bpm: 66, dur: 'w',
      focus: 'Sing the scale slowly from do to mi above, then back down to si below and home to do.',
      body: 'C4|D4|E4|F4|G4|A4|B4|C5|D5|E5|D5|C5|B4|A4|G4|F4|E4|D4|C4|B3|C4!' },
    { n: 2, title: 'Scale of C major', sub: 'Half notes', tempo: 'Lento', bpm: 66, dur: 'h',
      focus: 'Each note twice. Use the repeat to check the second one lands on the same pitch.',
      body: 'C4 C4|D4 D4|E4 E4|F4 F4|G4 G4|A4 A4|B4 B4|C5 C5|B4 B4|A4 A4|G4 G4|F4 F4|E4 E4|D4 D4|C4:w!' },
    { n: 3, title: 'Seconds', sub: 'Up and down by step', tempo: 'Lento', bpm: 66, dur: 'h',
      focus: 'Neighbouring notes, ascending then descending. Watch mi–fa and si–do: they are half steps.',
      body: 'C4 D4|D4 E4|E4 F4|F4 G4|G4 A4|A4 B4|B4 C5|C5 D5|D5 E5|E5 D5|D5 C5|C5 B4|B4 A4|A4 G4|G4 F4|F4 E4|E4 D4|D4 C4|C4 B3|C4:w!' },
    { n: 4, title: 'Thirds', sub: 'Thirds up, seconds down; then thirds down, seconds up', tempo: 'Lento', bpm: 66, dur: 'h',
      focus: 'do–mi, re–fa, mi–sol… Each third is the step pattern of the scale with one note skipped.',
      body: 'C4 E4|D4 F4|E4 G4|F4 A4|G4 B4|A4 C5|B4 D5|C5 E5|D5 B4|C5 A4|B4 G4|A4 F4|G4 E4|F4 D4|E4 C4|D4 B3|C4:w!' },
    { n: 5, title: 'Fourths', sub: 'Fourths up, thirds down; then fourths down, thirds up', tempo: 'Lento', bpm: 66, dur: 'h',
      focus: 'do–fa, re–sol, mi–la… One fourth is larger than the others: fa–si, the augmented fourth.',
      body: 'C4 F4|D4 G4|E4 A4|F4 B4|G4 C5|A4 D5|B4 E5|D5 A4|C5 G4|B4 F4|A4 E4|G4 D4|F4 C4|E4 B3|C4:w!' },
    { n: 6, title: 'Fifths', sub: 'Fifths up, fourths down; then fifths down, fourths up', tempo: 'Lento', bpm: 66, dur: 'h',
      focus: 'do–sol is the fifth to anchor on. Si–fa (bar 12) is the one diminished fifth.',
      body: 'C4 G4|D4 A4|E4 B4|F4 C5|G4 D5|A4 E5|D5 G4|C5 F4|B4 E4|A4 D4|G4 C4|F4 B3|C4:w!' },
    { n: 7, title: 'Sixths', sub: 'Sixths up, fifths down; then sixths down, fifths up', tempo: 'Lento', bpm: 66, dur: 'h',
      focus: 'do–la, re–si, mi–do… Think the octave and come down a third if a sixth feels too wide.',
      body: 'C4 A4|D4 B4|E4 C5|F4 D5|G4 E5|D5 F4|C5 E4|B4 D4|A4 C4|G4 B3|C4:w!' },
    { n: 8, title: 'Sevenths', sub: 'Sevenths up, sixths down; then sevenths down, sixths up', tempo: 'Lento', bpm: 66, dur: 'h',
      focus: 'A seventh is one step short of the octave. Aim for the octave, then fall back a step.',
      body: 'C4 B4|D4 C5|E4 D5|F4 E5|D5 E4|C5 D4|B4 C4|A4 B3|C4:w!' },
    { n: 9, title: 'Octaves', sub: 'Octaves up, sevenths down; then octaves down, sevenths up', tempo: 'Lento', bpm: 66, dur: 'h',
      focus: 'The same syllable at both ends. The octave should sound like one note, high and low.',
      body: 'C4 C5|D4 D5|E4 E5|D5 D4|C5 C4|B4 B3|C4:w!' },
    { n: 10, title: 'Summary of the intervals', sub: 'Every interval measured from do', tempo: 'Lento', bpm: 66, dur: 'h',
      focus: 'Return to low do after every note. Keep do fixed and let the upper note find its place.',
      body: 'C4 D4|C4 E4|C4 F4|C4 G4|C4 A4|C4 B4|C4 C5|C5 C4|B4 C4|A4 C4|G4 C4|F4 C4|E4 C4|D4:w|C4:w!' },
    { n: 11, title: 'Whole notes and whole rests', sub: 'The whole note counts four beats', tempo: 'Moderato', bpm: 100, dur: 'w', by: 'H.L.',
      focus: 'Four beats on each note, four beats of silence at each rest. Keep counting through the rests.',
      body: 'G4|A4|G4|r|B4|C5|B4|r|C5|D5|C5|r|D5|B4|C5|r' },
    { n: 12, title: 'Whole notes and whole rests', sub: 'The whole note counts four beats', tempo: 'Moderato', bpm: 100, dur: 'w', by: 'H.L.',
      focus: 'The low phrase (re, do, mi, re) leads to a leap up to la. Hear la before you go there.',
      body: 'E4|F4|E4|r|D4|C4|E4|D4|A4|G4|C5|B4|A4|G4|C5|B4|C5|E4|F4|r|E4|D4|C4|r' },
    { n: 13, title: 'Half notes and half rests', sub: 'The half note counts two beats', tempo: 'Moderato', bpm: 100, dur: 'h', by: 'Rod.',
      focus: 'Starts on a rest: count 1, 2 and sing do on beat 3.',
      body: 'r C4|D4 E4|F4 r|r G4|A4 B4|C5 r|r C5|B4 A4|G4 r|r F4|E4 D4|C4 E4|G4 C5|E5 C5|G4 E4|C4 r' },
    { n: 14, title: 'Half notes and half rests', sub: 'A three-bar sequence, up and down the scale', tempo: 'Moderato', bpm: 100, dur: 'h', by: 'Rod.',
      focus: 'The figure do re | mi do | mi (rest) repeats one step higher each time, then descends.',
      body: 'C4 D4|E4 C4|E4 r|D4 E4|F4 D4|F4 r|E4 F4|G4 E4|G4 r|F4 G4|A4 F4|A4 r|G4 A4|B4 G4|B4 r|A4 B4|C5 A4|C5 r|' +
            'B4 C5|D5 B4|D5 r|C5 D5|E5 C5|E5 r|E5 D5|C5 E5|C5 r|D5 C5|B4 D5|B4 r|C5 B4|A4 C5|A4 r|B4 A4|G4 B4|G4 r|' +
            'A4 G4|F4 A4|F4 r|G4 F4|E4 G4|E4 r|F4 E4|D4 F4|D4 r|E4 D4|C4 E4|C4 r' },
    { n: 15, title: 'Half notes and half rests', sub: 'Leaps from do above', tempo: 'Moderato', bpm: 100, dur: 'h', by: 'H.L.',
      focus: 'High do is the anchor: every leap in the first bars starts there.',
      body: 'C5 G4|C5 A4|C5 E4|G4 r|C5 G4|C5 D5|C5 D5|E5 r|D5 A4|C5 E4|F4 B3|C4 r' },
    { n: 16, title: 'Half notes and half rests', sub: 'Steps and thirds', tempo: 'Moderato', bpm: 100, dur: 'h', by: 'H.L.',
      focus: 'Mostly steps and thirds around mi, fa, sol. The last bars leap from do down to si.',
      body: 'E4 F4|G4 E4|A4 G4|F4 r|D4 E4|F4 D4|G4 F4|E4 r|E4 F4|G4 E4|C5 B4|A4 r|A4 G4|F4 r|E4 G4|C4 r' },
    { n: 17, title: 'Half notes and half rests', sub: 'Entries after the rest', tempo: 'Moderato', bpm: 100, dur: 'h', by: 'H.L.',
      focus: 'The second half enters on beat 3 in every bar. Breathe on the rest and come in on time.',
      body: 'E4 r|D4 r|F4 A4|G4 r|E4 r|D4 r|F4 A4|A4 G4|r C5|r B4|r A4|r G4|r C5|r B4|r A4|r G4|E4 r|G4 r|E4 D4|C4 r' },
    { n: 18, title: 'Whole notes and half notes', sub: 'Up the scale, down the chord', tempo: 'Moderato', bpm: 100, dur: 'h', by: 'H.L.',
      focus: 'Two halves then a whole, climbing to mi. The return outlines the C chord: sol, do, mi.',
      body: 'C4 D4|E4:w|F4 G4|A4:w|B4 C5|D5:w|E5 D5|C5:w|B4 A4|G4:w|F4 E4|D4:w|C4 B3|C4 E4|G4 C5|E5 C5|G4 E4|C4:w' },
    { n: 19, title: 'Whole notes and half notes', sub: 'Note, rest, note', tempo: 'Moderato', bpm: 100, dur: 'h', by: 'G.C.',
      focus: 'Whole notes alternate with half note plus rest. Count the rest so the next whole note is on beat 1.',
      body: 'C5:w|B4 r|D5:w|C5 r|E5:w|D5 r|C5 B4|C5 r|D5:w|C5 r|B4:w|A4 r|B4:w|E4 C5|B4 A4|G4 r|C5:w|B4 r|D5:w|C5 r|E5:w|D5 r|C5 B4|C5 r' },
    { n: 20, title: 'Whole notes and half notes', sub: 'Two phrases', tempo: 'Moderato', bpm: 100, dur: 'h', by: 'H.L.',
      focus: 'Two phrases that start alike. The first stops on re, the second goes home to do.',
      body: 'G4:w|C5 B4|C5:w|G4 r|F4:w|E4 G4|E4:w|D4 r|G4:w|C5 B4|C5:w|G4 r|F4:w|E4 D4|D4:w|C4 r' }
  ];

  return { units: units, raw: raw, source: 'A. Danhauser, Solfège des Solfèges, Book 1 (G. Schirmer, tr. J. H. Cornell)' };
});
