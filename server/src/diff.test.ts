import assert from 'node:assert/strict';
import test from 'node:test';
import { diffLines } from './diff.js';

test('diffLines marks unchanged lines as equal', () => {
  const diff = diffLines('a\nb\nc', 'a\nb\nc');
  assert.ok(diff);
  assert.deepEqual(diff!.map((d) => d.op), ['equal', 'equal', 'equal']);
});

test('diffLines detects an added line', () => {
  const diff = diffLines('a\nb', 'a\nb\nc');
  assert.ok(diff);
  assert.deepEqual(diff, [
    { op: 'equal', text: 'a' },
    { op: 'equal', text: 'b' },
    { op: 'add', text: 'c' },
  ]);
});

test('diffLines detects a removed line', () => {
  const diff = diffLines('a\nb\nc', 'a\nc');
  assert.ok(diff);
  assert.deepEqual(diff, [
    { op: 'equal', text: 'a' },
    { op: 'remove', text: 'b' },
    { op: 'equal', text: 'c' },
  ]);
});

test('diffLines returns null for oversized inputs instead of hanging on a huge table', () => {
  const huge = Array.from({ length: 2001 }, (_, i) => `line ${i}`).join('\n');
  assert.equal(diffLines(huge, 'a'), null);
});
