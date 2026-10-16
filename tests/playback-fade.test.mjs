import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../app/playback-fade.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { playbackGain } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('current track fades out and the next track fades in', () => {
  assert.equal(playbackGain(0, 90, 3), 0);
  assert.equal(playbackGain(1.5, 90, 3), 0.5);
  assert.equal(playbackGain(30, 90, 3), 1);
  assert.equal(playbackGain(88.5, 90, 3), 0.5);
  assert.equal(playbackGain(90, 90, 3), 0);
  assert.equal(playbackGain(0, 75, 3), 0);
});
test('off restores volume, seeks follow position, short clips never exceed maximum', () => {
  assert.equal(playbackGain(89, 90, 0), 1);
  assert.equal(playbackGain(30, 90, 3), 1);
  assert.equal(playbackGain(1, 2, 8), 1);
  assert.equal(playbackGain(1.5, 2, 8), 0.5);
  assert.equal(playbackGain(100, 90, 3), 0);
  assert.equal(playbackGain(-1, 90, 3), 0);
  assert.equal(playbackGain(1.5, 0, 3), 0.5);
});
