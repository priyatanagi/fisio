import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  generateWorkspaceSecret,
  getWorkspaceSecret,
  isAutoSyncEnabled,
  normalizeSupabaseUrl,
  readCloudEnv,
  setAutoSyncEnabled,
  setWorkspaceSecret,
} from './cloudConfig';

// The app runs in a browser, but this suite runs in node: a memory store keeps
// the module's storage guard honest without a DOM.
// A real-looking Supabase key: header.payload.signature, base64url.
function jwt(role: string): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'supabase' })}.sig`;
}

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  globalThis.localStorage = {
    getItem: (key: string) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key: string, value: string) => void memory.set(key, String(value)),
    removeItem: (key: string) => void memory.delete(key),
  } as unknown as Storage;
});

afterEach(() => {
  // @ts-expect-error deliberate: back to the node default, which has no storage.
  delete globalThis.localStorage;
});

describe('normalizeSupabaseUrl', () => {
  it('accepts a bare project host and adds the scheme', () => {
    expect(normalizeSupabaseUrl('my-project.supabase.co')).toBe('https://my-project.supabase.co');
  });

  it('drops a trailing slash and keeps the path', () => {
    expect(normalizeSupabaseUrl('https://my-project.supabase.co/')).toBe(
      'https://my-project.supabase.co'
    );
  });

  it('rejects anything that is not a usable https origin', () => {
    expect(normalizeSupabaseUrl('')).toBeNull();
    expect(normalizeSupabaseUrl('not a url')).toBeNull();
    expect(normalizeSupabaseUrl('ftp://my-project.supabase.co')).toBeNull();
  });
});

describe('readCloudEnv', () => {
  it('reports configured only when both the url and the anon key are present', () => {
    expect(readCloudEnv({}).configured).toBe(false);
    expect(readCloudEnv({ VITE_SUPABASE_URL: 'https://p.supabase.co' }).configured).toBe(false);
    expect(
      readCloudEnv({ VITE_SUPABASE_URL: 'https://p.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' })
        .configured
    ).toBe(true);
  });

  it('normalizes the url and trims the key', () => {
    const env = readCloudEnv({
      VITE_SUPABASE_URL: ' my-project.supabase.co ',
      VITE_SUPABASE_ANON_KEY: '  key  ',
    });
    expect(env.url).toBe('https://my-project.supabase.co');
    expect(env.anonKey).toBe('key');
    expect(env.configured).toBe(true);
  });

  it('refuses an env that carries a service_role key, since it bypasses RLS', () => {
    const env = readCloudEnv({
      VITE_SUPABASE_URL: 'https://p.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon-value',
      VITE_SUPABASE_SERVICE_ROLE_KEY: 'nope',
    });
    expect(env.configured).toBe(false);
    expect(env.error).toContain('service_role');
  });

  it('refuses a key that is shaped like a secret key, not an anon key', () => {
    const env = readCloudEnv({
      VITE_SUPABASE_URL: 'https://p.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_secret_deadbeef',
    });
    expect(env.configured).toBe(false);
    expect(env.error).toContain('service_role');
  });

  // Supabase's legacy anon key IS a JWT, so a `eyJ` prefix alone must never be
  // treated as a secret. The role claim is what distinguishes the two.
  it('accepts a legacy anon key that is a JWT with role=anon', () => {
    const env = readCloudEnv({
      VITE_SUPABASE_URL: 'https://p.supabase.co',
      VITE_SUPABASE_ANON_KEY: jwt('anon'),
    });
    expect(env.configured).toBe(true);
  });

  it('refuses a JWT whose role claim is service_role', () => {
    const env = readCloudEnv({
      VITE_SUPABASE_URL: 'https://p.supabase.co',
      VITE_SUPABASE_ANON_KEY: jwt('service_role'),
    });
    expect(env.configured).toBe(false);
    expect(env.error).toContain('service_role');
  });

  it('accepts the new sb_publishable_ key format', () => {
    const env = readCloudEnv({
      VITE_SUPABASE_URL: 'https://p.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_ABCdef123',
    });
    expect(env.configured).toBe(true);
  });

  it('does not reject a JWT it cannot decode, since only a proven service_role is dangerous', () => {
    const env = readCloudEnv({
      VITE_SUPABASE_URL: 'https://p.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'eyJnot-really-a-jwt',
    });
    expect(env.configured).toBe(true);
  });
});

describe('workspace secret storage', () => {
  it('is empty until a secret is entered, and empty clears it', () => {
    expect(getWorkspaceSecret()).toBe('');
    setWorkspaceSecret('  abc123  ');
    expect(getWorkspaceSecret()).toBe('abc123');
    setWorkspaceSecret('');
    expect(getWorkspaceSecret()).toBe('');
  });

  it('survives a missing localStorage instead of throwing', () => {
    // @ts-expect-error deliberate: simulate a runtime with no storage at all.
    delete globalThis.localStorage;
    expect(() => setWorkspaceSecret('abc')).not.toThrow();
    expect(getWorkspaceSecret()).toBe('');
  });

  it('generates a long random secret that is different every time', () => {
    const first = generateWorkspaceSecret();
    const second = generateWorkspaceSecret();
    expect(first).toMatch(/^[a-f0-9]{32,}$/);
    expect(first).not.toBe(second);
  });
});

describe('auto-sync flag', () => {
  it('defaults to on and can be switched off', () => {
    expect(isAutoSyncEnabled()).toBe(true);
    setAutoSyncEnabled(false);
    expect(isAutoSyncEnabled()).toBe(false);
    setAutoSyncEnabled(true);
    expect(isAutoSyncEnabled()).toBe(true);
  });
});
