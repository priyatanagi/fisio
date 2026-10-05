import { describe, expect, it } from 'vitest';
import { parseServerInfo } from './serverInfo';

describe('parseServerInfo', () => {
  it('reads the identity fields from a healthy payload', () => {
    const info = parseServerInfo({
      status: 'ok',
      app: 'Fisio Architect',
      instance: 'A1B2',
      port: 5177,
      pid: 1234,
      startedAt: '2026-10-02T00:00:00.000Z',
    });
    expect(info).toEqual({
      app: 'Fisio Architect',
      instance: 'A1B2',
      port: 5177,
      pid: 1234,
      startedAt: '2026-10-02T00:00:00.000Z',
    });
  });

  it('stays usable against an older server that omits them', () => {
    expect(parseServerInfo({ status: 'ok', hasKey: true })).toEqual({
      app: undefined,
      instance: undefined,
      port: undefined,
      pid: undefined,
      startedAt: undefined,
    });
  });

  it('rejects a non-numeric port rather than rendering nonsense', () => {
    expect(parseServerInfo({ port: '5177' })?.port).toBeUndefined();
  });

  it('returns null for payloads that are not objects', () => {
    expect(parseServerInfo(null)).toBeNull();
    expect(parseServerInfo('ok')).toBeNull();
    expect(parseServerInfo(undefined)).toBeNull();
  });
});
