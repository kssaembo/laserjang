import assert from 'node:assert/strict';
import { opticalInteraction } from '../src/optics.js';

const reflection = (type, pieceDirection, incomingDirection) => opticalInteraction(type, pieceDirection, incomingDirection);

assert.deepEqual(reflection('square', 0, 2), { destroy: false, passThrough: false, reflected: [0] });
assert.equal(reflection('square', 0, 0).destroy, true);
assert.equal(reflection('square', 0, 1).destroy, true);
assert.equal(reflection('square', 0, 3).destroy, true);
assert.deepEqual(reflection('square', 1, 3).reflected, [1]);
assert.deepEqual(reflection('square', 3, 1).reflected, [3]);

assert.deepEqual(reflection('triangle', 0, 2), { destroy: false, passThrough: false, reflected: [1] });
assert.deepEqual(reflection('triangle', 0, 3), { destroy: false, passThrough: false, reflected: [0] });
assert.equal(reflection('triangle', 0, 0).destroy, true);
assert.equal(reflection('triangle', 0, 1).destroy, true);

assert.deepEqual(reflection('splitter', 0, 0), { destroy: false, passThrough: true, reflected: [3] });
assert.deepEqual(reflection('splitter', 0, 1).reflected, [2]);
assert.deepEqual(reflection('splitter', 0, 2).reflected, [1]);
assert.deepEqual(reflection('splitter', 0, 3).reflected, [0]);
assert.deepEqual(reflection('splitter', 1, 0).reflected, [1]);

console.log('optical interaction tests: OK');
