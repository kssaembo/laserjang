import fs from 'node:fs';
import path from 'node:path';

const RATE = 44100;
const outDir = path.resolve('public/audio');
fs.mkdirSync(outDir, { recursive: true });

const clamp = v => Math.max(-1, Math.min(1, v));
const env = (t, dur, attack = .01, release = .12) => Math.min(1, t / attack) * Math.min(1, (dur - t) / release);
const sine = (f, t) => Math.sin(Math.PI * 2 * f * t);
const tri = (f, t) => 2 * Math.asin(Math.sin(Math.PI * 2 * f * t)) / Math.PI;
const saw = (f, t) => 2 * ((t * f) % 1) - 1;
let seed = 84721;
const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741824 - 1; };

function toneAt(t, start, dur, f0, f1 = f0, shape = 'sine', gain = .3) {
  if (t < start || t >= start + dur) return 0;
  const lt = t - start;
  const f = f0 + (f1 - f0) * (lt / dur);
  const wave = shape === 'tri' ? tri(f, lt) : shape === 'saw' ? saw(f, lt) : sine(f, lt);
  return wave * gain * env(lt, dur, Math.min(.012, dur * .15), Math.min(.15, dur * .4));
}

function makeWav(filename, duration, synth) {
  seed = 84721;
  const count = Math.floor(RATE * duration);
  const data = Buffer.alloc(count * 2);
  for (let i = 0; i < count; i++) {
    const t = i / RATE;
    data.writeInt16LE(Math.round(clamp(synth(t, duration)) * 32767), i * 2);
  }
  const wav = Buffer.alloc(44 + data.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + data.length, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(data.length, 40); data.copy(wav, 44);
  fs.writeFileSync(path.join(outDir, filename), wav);
}

makeWav('ui-click.wav', .11, t => toneAt(t, 0, .09, 780, 540, 'tri', .22) + toneAt(t, .018, .07, 1180, 900, 'sine', .1));
makeWav('ui-confirm.wav', .28, t => toneAt(t, 0, .12, 520, 620, 'tri', .2) + toneAt(t, .1, .17, 760, 980, 'sine', .22));
makeWav('ui-error.wav', .32, t => toneAt(t, 0, .16, 280, 190, 'saw', .16) + toneAt(t, .13, .18, 210, 130, 'saw', .16));
makeWav('piece-select.wav', .2, t => toneAt(t, 0, .16, 690, 910, 'sine', .25) + toneAt(t, .02, .13, 1380, 1220, 'sine', .09));
makeWav('piece-move.wav', .34, (t, d) => toneAt(t, 0, .26, 135, 92, 'tri', .24) + noise() * .07 * env(t, d, .01, .22) + toneAt(t, .23, .1, 310, 260, 'sine', .13));
makeWav('piece-rotate.wav', .38, t => toneAt(t, 0, .1, 240, 310, 'tri', .18) + toneAt(t, .1, .1, 315, 390, 'tri', .18) + toneAt(t, .22, .14, 640, 820, 'sine', .16));
makeWav('game-start.wav', 1.25, t => [262, 392, 523, 659].reduce((v, f, i) => v + toneAt(t, i * .16, .52, f, f * 1.03, i < 2 ? 'tri' : 'sine', .13), 0));
makeWav('laser-fire.wav', .82, (t, d) => toneAt(t, 0, .78, 320, 1450, 'saw', .11) + toneAt(t, .05, .72, 640, 1900, 'sine', .16) + noise() * .025 * env(t, d, .02, .2));
makeWav('laser-reflect.wav', .18, t => toneAt(t, 0, .16, 1500, 2050, 'sine', .22) + toneAt(t, .015, .12, 2400, 1850, 'sine', .09));
makeWav('splitter.wav', .42, t => toneAt(t, 0, .35, 740, 1060, 'sine', .15) + toneAt(t, .07, .32, 910, 1420, 'sine', .14) + toneAt(t, .1, .28, 1220, 1750, 'tri', .08));
makeWav('piece-destroy.wav', .62, (t, d) => noise() * .18 * env(t, d, .005, .5) * Math.max(0, 1 - t / d) + toneAt(t, 0, .5, 180, 58, 'saw', .14));
makeWav('king-hit.wav', 1.25, (t, d) => toneAt(t, 0, 1.05, 165, 52, 'saw', .19) + toneAt(t, .04, .85, 420, 115, 'tri', .13) + noise() * .08 * env(t, d, .004, .8));
makeWav('victory.wav', 2.4, t => [392, 523, 659, 784, 1046].reduce((v, f, i) => v + toneAt(t, i * .22, .62, f, f * 1.015, i < 2 ? 'tri' : 'sine', .14), 0) + toneAt(t, 1.08, 1.25, 523, 526, 'sine', .08));
makeWav('result-sent.wav', .68, t => toneAt(t, 0, .24, 520, 690, 'tri', .18) + toneAt(t, .18, .28, 760, 980, 'sine', .2) + toneAt(t, .37, .27, 1040, 1320, 'sine', .13));

console.log(`Generated 14 sound effects in ${outDir}`);
