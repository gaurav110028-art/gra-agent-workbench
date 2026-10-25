import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createSafeFetch } from '../lib/security/egress.mjs';

function transportMock(t, transport, chunks, headers = {}, inspect = () => {}) {
  t.mock.method(transport, 'request', (url, options, callback) => {
    inspect(url, options);
    const req = new EventEmitter();
    req.write = () => {};
    req.destroy = error => req.emit('error', error);
    req.end = () => queueMicrotask(() => {
      const response = Readable.from(chunks);
      response.statusCode = 200; response.headers = headers;
      callback(response);
    });
    return req;
  });
}
test('native transport pins the approved lookup address while preserving TLS hostname verification', async t => {
  let resolutions = 0;
  transportMock(t, https, [Buffer.from('synthetic success')], {}, (url, options) => {
    assert.equal(url.hostname, 'approved.test');
    assert.equal(options.agent, false);
    assert.notEqual(options.rejectUnauthorized, false);
    options.lookup('approved.test', {}, (error, address, family) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4); });
    options.lookup('approved.test', { all: true }, (error, addresses) => { assert.equal(error, null); assert.deepEqual(addresses, [{ address: '8.8.8.8', family: 4 }]); });
  });
  const fetch = createSafeFetch({ lookup: async () => { resolutions++; return [{ address: '8.8.8.8', family: 4 }]; } });
  assert.equal(await (await fetch('https://approved.test')).text(), 'synthetic success');
  assert.equal(resolutions, 1);
});
test('native response buffering rejects actual streamed excess and unsolicited compression', async t => {
  transportMock(t, http, [Buffer.from('123456')]);
  const fetch = createSafeFetch({ lookup: async () => [{ address: '8.8.8.8', family: 4 }] });
  await assert.rejects(fetch('http://approved.test', { maxBytes: 5 }), e => e.code === 'UPSTREAM_TOO_LARGE');
});
test('unsolicited compressed upstream data never passes through as a successful decoded response', async t => {
  transportMock(t, http, [Buffer.from('compressed synthetic bytes')], { 'content-encoding': 'gzip' });
  const fetch = createSafeFetch({ lookup: async () => [{ address: '8.8.8.8', family: 4 }] });
  await assert.rejects(fetch('http://approved.test'), e => e.code === 'UPSTREAM_ENCODING');
});
