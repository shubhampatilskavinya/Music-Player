import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const { authConfigured, encodeIdentity, decodeIdentity, newGuestId } = await import(url(compile('app/auth/identity.ts')));

const withEnv = (vars, fn) => {
  const previous = {};
  for (const key of Object.keys(vars)) { previous[key] = process.env[key]; process.env[key] = vars[key]; }
  try { return fn(); } finally { for (const key of Object.keys(vars)) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } }
};

test('encode/decode round-trips an identity', () => {
  withEnv({ MIRC_SESSION_SECRET: 'test-secret' }, () => {
    const cookie = encodeIdentity({ role: 'host', id: 'host', name: 'Mirc' }, 3600);
    assert.deepEqual(decodeIdentity(cookie), { role: 'host', id: 'host', name: 'Mirc' });
  });
});

test('a tampered signature or body fails verification', () => {
  withEnv({ MIRC_SESSION_SECRET: 'test-secret' }, () => {
    const cookie = encodeIdentity({ role: 'guest', id: 'abc', name: 'Guest' }, 3600);
    const [body, mac] = cookie.split('.');
    assert.equal(decodeIdentity(`${body}.${mac.slice(0, -1)}x`), null);
    assert.equal(decodeIdentity(`${body}x.${mac}`), null);
    assert.equal(decodeIdentity('not-a-cookie'), null);
    assert.equal(decodeIdentity(null), null);
  });
});

test('an expired identity fails verification', () => {
  withEnv({ MIRC_SESSION_SECRET: 'test-secret' }, () => {
    const cookie = encodeIdentity({ role: 'host', id: 'host', name: 'Mirc' }, -10);
    assert.equal(decodeIdentity(cookie), null);
  });
});

test('missing secret makes decodeIdentity return null instead of throwing', () => {
  withEnv({ MIRC_SESSION_SECRET: 'test-secret' }, () => {
    const cookie = encodeIdentity({ role: 'host', id: 'host', name: 'Mirc' }, 3600);
    withEnv({ MIRC_SESSION_SECRET: '' }, () => { assert.equal(decodeIdentity(cookie), null); });
  });
});

test('authConfigured reflects all three required env vars', () => {
  withEnv({ MIRC_HOST_PIN: '', MIRC_SESSION_SECRET: '', MIRC_PARTY_CODE: '' }, () => { assert.equal(authConfigured(), false); });
  withEnv({ MIRC_HOST_PIN: '1234', MIRC_SESSION_SECRET: 'secret', MIRC_PARTY_CODE: 'MIRC-7' }, () => { assert.equal(authConfigured(), true); });
});

test('newGuestId generates distinct hex ids', () => {
  const a = newGuestId(), b = newGuestId();
  assert.match(a, /^[a-f0-9]{16}$/);
  assert.notEqual(a, b);
});
