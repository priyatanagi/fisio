/**
 * Cloud configuration. Two values come from the build environment and are
 * public by design (the anon key grants nothing without the row level
 * policies in supabase/schema.sql); the workspace secret is typed once inside
 * the app and therefore never appears in the bundle, in git, or in .env.
 */

const URL_KEY = 'VITE_SUPABASE_URL';
const ANON_KEY = 'VITE_SUPABASE_ANON_KEY';
const SERVICE_KEY = 'VITE_SUPABASE_SERVICE_ROLE_KEY';

export interface CloudEnv {
  url: string;
  anonKey: string;
  configured: boolean;
  /** Why cloud sync is unavailable, in user-facing words. */
  error?: string;
}

/** Storage that may not exist: node, tests, and privacy modes without it. */
function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function read(key: string): string {
  return store()?.getItem(key)?.trim() ?? '';
}

function write(key: string, value: string): void {
  const target = store();
  if (!target) return;
  try {
    if (value) target.setItem(key, value);
    else target.removeItem(key);
  } catch (err) {
    console.warn(`[cloud] could not persist ${key}`, err);
  }
}

/**
 * `my-project.supabase.co` is what people copy from the dashboard, so the
 * scheme is added when missing. Anything that is not http(s) is rejected rather
 * than sent as a request, because a typo there silently posts content to an
 * unrelated host.
 */
export function normalizeSupabaseUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (!parsed.hostname.includes('.')) return null;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function decodeBase64Url(value: string): string | null {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return globalThis.atob?.(normalized) ?? null;
  } catch {
    return null;
  }
}

/**
 * Supabase ships two kinds of key that are both JWTs, so the `eyJ` prefix means
 * nothing: the `role` claim is the only reliable difference between a public
 * anon key and a service_role key that bypasses every policy. The claim is
 * signature-protected, so a key cannot disguise itself as anon, and a key we
 * cannot decode is left alone — it is the public one it claims to be.
 */
function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  const payload = decodeBase64Url(parts[1]);
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as { role?: unknown };
    return typeof parsed.role === 'string' ? parsed.role : null;
  } catch {
    return null;
  }
}

export function readCloudEnv(source?: Record<string, string | undefined>): CloudEnv {
  const env = (source ?? (import.meta.env as Record<string, string | undefined>)) ?? {};
  const url = normalizeSupabaseUrl(env[URL_KEY] ?? '') ?? '';
  const anonKey = (env[ANON_KEY] ?? '').trim();

  // A secret key in a VITE_ variable is shipped to every visitor and bypasses
  // every policy, so refusing to run is better than quietly using it.
  if ((env[SERVICE_KEY] ?? '').trim()) {
    return { url, anonKey, configured: false, error: 'VITE_SUPABASE_SERVICE_ROLE_KEY is set — the app refuses to run with a service_role key. Remove it and use the public anon key.' };
  }
  if (/^sb_secret_/i.test(anonKey) || jwtRole(anonKey) === 'service_role') {
    return { url, anonKey, configured: false, error: 'That key is a service_role secret key, which bypasses all row level security. Use the key labelled "anon" / "public" instead.' };
  }
  if (!url) {
    return { url: '', anonKey, configured: false, error: `VITE_SUPABASE_URL is missing or not a valid https URL.` };
  }
  if (!anonKey) {
    return { url, anonKey, configured: false, error: 'VITE_SUPABASE_ANON_KEY is missing.' };
  }
  return { url, anonKey, configured: true };
}

const SECRET_KEY = 'fitseo_cloud_workspace_secret';
const AUTO_SYNC_KEY = 'fitseo_cloud_auto_sync';
const LAST_SYNC_KEY = 'fitseo_cloud_last_sync';

export function getWorkspaceSecret(): string {
  return read(SECRET_KEY);
}

export function setWorkspaceSecret(secret: string): void {
  write(SECRET_KEY, secret.trim());
}

/**
 * 32 hex characters from the WebCrypto generator. Written to the row's
 * `workspace_secret` column and compared against the request header by the RLS
 * policies, so it is effectively the account password for this data.
 */
export function generateWorkspaceSecret(): string {
  const bytes = new Uint8Array(16);
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** On by default: the point of cloud storage is that saving locally is enough. */
export function isAutoSyncEnabled(): boolean {
  return read(AUTO_SYNC_KEY) !== 'false';
}

export function setAutoSyncEnabled(enabled: boolean): void {
  write(AUTO_SYNC_KEY, String(enabled));
}

export function getLastSyncedAt(): string {
  return read(LAST_SYNC_KEY);
}

export function setLastSyncedAt(iso: string): void {
  write(LAST_SYNC_KEY, iso);
}

const SETTINGS_SAVED_AT_KEY = 'fitseo_settings_saved_at';

/**
 * When this device last changed its rules. The cloud settings row is a single
 * document per workspace, so the two sides need one comparable timestamp to
 * decide who wins — and it has to be written by the save itself, not inferred
 * from the objects, which carry no edit time.
 */
export function getSettingsSavedAt(): string {
  return read(SETTINGS_SAVED_AT_KEY);
}

export function setSettingsSavedAt(iso: string): void {
  write(SETTINGS_SAVED_AT_KEY, iso);
}
