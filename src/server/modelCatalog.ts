import type { ModelCatalog, ModelInfo, ProviderType } from '../types/provider';
import { PROVIDER_PRESETS } from '../types/provider';

const CACHE_TTL_MS = 60 * 1000;

interface CacheEntry {
  catalog: ModelCatalog;
  at: number;
}

const cache = new Map<string, CacheEntry>();

export interface CatalogRequest {
  provider: ProviderType;
  baseUrl?: string;
  apiKey?: string;
}

function envKey(provider: ProviderType): string | undefined {
  if (provider === 'gemini') return process.env.GEMINI_API_KEY?.trim();
  if (provider === 'openai') return process.env.OPENAI_API_KEY?.trim();
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY?.trim();
  return undefined;
}

function fallback(provider: ProviderType, endpoint: string, error: string): ModelCatalog {
  return {
    provider,
    live: false,
    error,
    endpoint,
    models: PROVIDER_PRESETS[provider].models.map((m) => ({
      id: m.id,
      name: m.name,
      provider,
      detail: 'built-in suggestion',
    })),
  };
}

function normalizeBaseUrl(provider: ProviderType, baseUrl?: string): string {
  const trimmed = baseUrl?.trim();
  if (trimmed) return trimmed.replace(/\/+$/, '');
  if (provider === 'openai') return process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, '') || 'https://api.openai.com/v1';
  if (provider === 'anthropic') return process.env.ANTHROPIC_BASE_URL?.trim().replace(/\/+$/, '') || 'https://api.anthropic.com/v1';
  if (provider === 'ollama') return process.env.OLLAMA_BASE_URL?.trim().replace(/\/+$/, '') || 'http://localhost:11434';
  return 'https://generativelanguage.googleapis.com/v1beta';
}

function prettyParam(size?: string): string | undefined {
  if (!size || size === 'unknown') return undefined;
  return size.toLowerCase();
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    // Proxies often answer with an HTML page; only the status is useful there.
    const body = raw.trimStart().startsWith('<') ? '(non-JSON response)' : raw.slice(0, 180);
    throw new Error(`HTTP ${response.status}${body ? `: ${body}` : ''}`);
  }
  return response.json();
}

async function listGemini(baseUrl: string, apiKey: string | undefined): Promise<ModelInfo[]> {
  if (!apiKey) throw new Error('no API key available for Gemini');
  const data = await fetchJson(`${baseUrl}/models?pageSize=200`, {
    headers: { 'x-goog-api-key': apiKey },
  });
  return (data.models ?? [])
    .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
    .map((m: any) => {
      const id = String(m.name ?? '').replace(/^models\//, '');
      return {
        id,
        name: m.displayName || id,
        provider: 'gemini' as ProviderType,
        detail: [
          m.inputTokenLimit ? `${Math.round(m.inputTokenLimit / 1000)}K in` : null,
          m.outputTokenLimit ? `${Math.round(m.outputTokenLimit / 1000)}K out` : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
      };
    })
    .filter((m: ModelInfo) => m.id);
}

async function listOpenAI(baseUrl: string, apiKey: string | undefined): Promise<ModelInfo[]> {
  if (!apiKey) throw new Error('no API key available for this OpenAI-compatible endpoint');
  const data = await fetchJson(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const items: any[] = data.data ?? data.models ?? (Array.isArray(data) ? data : []);
  return items.map((m) => ({
    id: String(m.id ?? m.name ?? ''),
    name: String(m.id ?? m.name ?? ''),
    provider: 'openai' as ProviderType,
    detail: [m.owned_by, m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : null]
      .filter(Boolean)
      .join(' · ') || undefined,
  })).filter((m: ModelInfo) => m.id);
}

async function listAnthropic(baseUrl: string, apiKey: string | undefined): Promise<ModelInfo[]> {
  if (!apiKey) throw new Error('no API key available for Anthropic');
  const data = await fetchJson(`${baseUrl}/models?limit=100`, {
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
  });
  const items: any[] = data.data ?? [];
  return items
    .map((m) => ({
      id: String(m.id ?? ''),
      name: m.display_name || String(m.id ?? ''),
      provider: 'anthropic' as ProviderType,
      detail: m.created_at ? String(m.created_at).slice(0, 10) : undefined,
    }))
    .filter((m: ModelInfo) => m.id);
}

async function listOllama(baseUrl: string): Promise<ModelInfo[]> {
  const data = await fetchJson(`${baseUrl}/api/tags`);
  const items: any[] = data.models ?? [];
  return items.map((m) => ({
    id: String(m.name ?? ''),
    name: String(m.name ?? ''),
    provider: 'ollama' as ProviderType,
    detail: [
      prettyParam(m.details?.parameter_size),
      prettyParam(m.details?.quantization),
      m.size ? `${Math.round(Number(m.size) / 1e9)} GB` : null,
    ]
      .filter(Boolean)
      .join(' · ') || undefined,
  })).filter((m: ModelInfo) => m.id);
}

async function fetchLive(request: CatalogRequest): Promise<ModelInfo[]> {
  const baseUrl = normalizeBaseUrl(request.provider, request.baseUrl);
  const apiKey = request.apiKey?.trim() || envKey(request.provider);
  switch (request.provider) {
    case 'gemini':
      return listGemini(baseUrl, apiKey);
    case 'openai':
      return listOpenAI(baseUrl, apiKey);
    case 'anthropic':
      return listAnthropic(baseUrl, apiKey);
    case 'ollama':
      return listOllama(baseUrl);
    default:
      throw new Error(`Unsupported provider: ${request.provider}`);
  }
}

function cacheKey(request: CatalogRequest): string {
  const apiKey = request.apiKey?.trim() || envKey(request.provider) || '';
  // Never store the key itself; a short hash keeps per-key caches without leaking secrets.
  let hash = 0;
  for (let i = 0; i < apiKey.length; i++) hash = (hash * 31 + apiKey.charCodeAt(i)) | 0;
  return `${request.provider}|${normalizeBaseUrl(request.provider, request.baseUrl)}|${hash}`;
}

export async function listModels(
  request: CatalogRequest,
  options: { refresh?: boolean } = {}
): Promise<ModelCatalog & { cachedAt?: number }> {
  const key = cacheKey(request);
  const cached = cache.get(key);
  if (cached && !options.refresh && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ...cached.catalog, cachedAt: cached.at };
  }

  try {
    const models = (await fetchLive(request)).sort((a, b) => a.id.localeCompare(b.id));
    if (models.length === 0) throw new Error('provider returned an empty model list');
    const catalog: ModelCatalog = {
      provider: request.provider,
      live: true,
      endpoint: normalizeBaseUrl(request.provider, request.baseUrl),
      models,
    };
    cache.set(key, { catalog, at: Date.now() });
    return { ...catalog, cachedAt: Date.now() };
  } catch (err) {
    const catalog = fallback(
      request.provider,
      normalizeBaseUrl(request.provider, request.baseUrl),
      String((err as Error)?.message || err)
    );
    return { ...catalog, cachedAt: cached?.at };
  }
}

/** Test hook. */
export function resetModelCatalogCache(): void {
  cache.clear();
}
