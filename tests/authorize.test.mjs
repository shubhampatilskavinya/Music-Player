import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const { authorizeCommand } = await import(url(compile('app/auth/authorize.ts')));

const host = { role: 'host', id: 'host', name: 'Mirc' };
const guest = { role: 'guest', id: 'g1', name: 'Guest' };
const PARTY_CONTROL = ['next', 'previous', 'seek', 'volume', 'fade', 'select', 'append-play', 'promote', 'add-to-playlist', 'reorder'];
const LEASE = ['heartbeat', 'release', 'ended', 'report', 'play', 'pause'];

test('lease commands pass with no identity', () => {
  for (const type of LEASE) assert.doesNotThrow(() => authorizeCommand(null, { type }));
});

test('no identity throws for party-control commands', () => {
  for (const type of PARTY_CONTROL) assert.throws(() => authorizeCommand(null, { type }));
  assert.throws(() => authorizeCommand(null, { type: 'append' }));
  assert.throws(() => authorizeCommand(null, { type: 'remove' }));
});

test('host passes every command', () => {
  for (const type of [...PARTY_CONTROL, ...LEASE, 'append', 'play-next', 'remove']) assert.doesNotThrow(() => authorizeCommand(host, { type }));
});

test('guest passes only append/play-next/remove, and all lease commands', () => {
  for (const type of ['append', 'play-next', 'remove']) assert.doesNotThrow(() => authorizeCommand(guest, { type }));
  for (const type of LEASE) assert.doesNotThrow(() => authorizeCommand(guest, { type }));
  for (const type of PARTY_CONTROL) assert.throws(() => authorizeCommand(guest, { type }));
});
