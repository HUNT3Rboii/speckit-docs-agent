import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RpcClient, RpcError, RpcNotification } from '../backend/rpcClient';

/**
 * Framing tests. A stream hands over chunks, not messages, and the bugs that
 * live here - a reply split across two reads, three replies in one - are
 * invisible in a running editor until the day they are not.
 */

function harness() {
  const written: string[] = [];
  let emit: (chunk: string) => void = () => {};

  const client = new RpcClient({
    onData: (listener) => {
      emit = listener;
    },
    write: (line) => written.push(line),
  });

  return { client, written, feed: (chunk: string) => emit(chunk) };
}

describe('RpcClient framing', () => {
  it('sends a request as one newline-terminated JSON line', () => {
    const { client, written } = harness();
    void client.request('convert', { markdown: '# Doc' });

    assert.equal(written.length, 1);
    assert.ok(written[0].endsWith('\n'));
    assert.deepEqual(JSON.parse(written[0]), {
      jsonrpc: '2.0',
      id: 1,
      method: 'convert',
      params: { markdown: '# Doc' },
    });
  });

  it('resolves a reply that arrives split across chunks', async () => {
    const { client, feed } = harness();
    const pending = client.request<{ ok: boolean }>('ping');

    const reply = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }) + '\n';
    feed(reply.slice(0, 12));
    feed(reply.slice(12));

    assert.deepEqual(await pending, { ok: true });
  });

  it('resolves several replies delivered in a single chunk', async () => {
    const { client, feed } = harness();
    const first = client.request<number>('a');
    const second = client.request<number>('b');

    feed(
      JSON.stringify({ jsonrpc: '2.0', id: 1, result: 1 }) +
        '\n' +
        JSON.stringify({ jsonrpc: '2.0', id: 2, result: 2 }) +
        '\n'
    );

    assert.equal(await first, 1);
    assert.equal(await second, 2);
  });

  it('matches replies by id, not arrival order', async () => {
    const { client, feed } = harness();
    const first = client.request<string>('slow');
    const second = client.request<string>('fast');

    feed(JSON.stringify({ jsonrpc: '2.0', id: 2, result: 'fast' }) + '\n');
    feed(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'slow' }) + '\n');

    assert.equal(await first, 'slow');
    assert.equal(await second, 'fast');
  });

  it('rejects with the backend error message and code', async () => {
    const { client, feed } = harness();
    const pending = client.request('convert');

    feed(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'typst failed' } }) + '\n');

    await assert.rejects(pending, (error: RpcError) => {
      assert.equal(error.message, 'typst failed');
      assert.equal(error.code, -32000);
      assert.equal(error.method, 'convert');
      return true;
    });
  });

  it('surfaces a notification, which carries no id', () => {
    const { client, feed } = harness();
    const seen: RpcNotification[] = [];
    client.on('notification', (notification: RpcNotification) => seen.push(notification));

    feed(JSON.stringify({ jsonrpc: '2.0', method: 'ready', params: { protocol: 1 } }) + '\n');

    assert.deepEqual(seen, [{ method: 'ready', params: { protocol: 1 } }]);
  });

  it('ignores blank lines between messages', async () => {
    const { client, feed } = harness();
    const pending = client.request<boolean>('ping');

    feed('\n\n' + JSON.stringify({ jsonrpc: '2.0', id: 1, result: true }) + '\n\n');

    assert.equal(await pending, true);
  });

  it('reports a non-JSON line without dropping later messages', async () => {
    // A stray print() in the backend corrupts one line, not the session.
    const { client, feed } = harness();
    const errors: Error[] = [];
    client.on('protocolError', (error: Error) => errors.push(error));

    const pending = client.request<boolean>('ping');
    feed('this is not json\n');
    feed(JSON.stringify({ jsonrpc: '2.0', id: 1, result: true }) + '\n');

    assert.equal(await pending, true);
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /not JSON/);
  });

  it('rejects everything in flight when the backend goes away', async () => {
    const { client } = harness();
    const pending = client.request('convert');

    client.close('The backend stopped (exit code 1).');

    await assert.rejects(pending, /The backend stopped/);
  });

  it('refuses new requests once closed', async () => {
    const { client } = harness();
    client.close('gone');
    await assert.rejects(client.request('ping'), /not running/);
  });
});
