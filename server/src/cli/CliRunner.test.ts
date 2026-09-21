import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCliJson } from './CliRunner.js';

test('parseCliJson reads a clean JSON payload', () => {
  assert.deepEqual(parseCliJson('{"status":0,"result":{"ok":true}}'), { status: 0, result: { ok: true } });
});

test('parseCliJson recovers the payload when the CLI prints a prompt first', () => {
  // `sf apex run` reading from stdin writes this banner to stdout ahead of its JSON result,
  // which used to fail the parse and surface the banner itself as the error message.
  const stdout = 'Start typing Apex code. Press the Enter key after each line, then press CTRL+D when finished.\n{"status":0,"result":{"success":true}}';
  assert.deepEqual(parseCliJson(stdout), { status: 0, result: { success: true } });
});

test('parseCliJson returns undefined when there is no JSON to find', () => {
  assert.equal(parseCliJson(''), undefined);
  assert.equal(parseCliJson('command not found'), undefined);
  assert.equal(parseCliJson('noise { not json at all'), undefined);
});
