/**
 * Browser-facing provider calls. Ollama answers on the user's own machine, so
 * its catalog and connection test go straight to the local server from here;
 * cloud providers keep going through the server, which holds their keys.
 */
import type { ModelCatalog, ModelInfo, ProviderConfig, ProviderType } from '../types/provider';
import { PROVIDER_PRESETS } from '../types/provider';
import { readableProviderError } from '../server/providerText';

export interface ConnectionResult {
  ok: boolean;
  message: string;
}

/** Callers may hold a half-filled provider config (a role being edited). */
type CatalogConfig = Pick<Partial<ProviderConfig>, 'baseUrl' | 'apiKey'> & {
  provider: ProviderType;
};
type TestConfig = CatalogConfig & { model?: string };

function ollamaBaseUrl(config: { baseUrl?: string }): string {
  return (config.baseUrl?.trim() || PROVIDER_PRESETS.ollama.defaultBaseUrl).replace(/\/+$/, '');
}

async function fetchOllamaTags(baseUrl: string): Promise<{ name: string; size?: number }[]> {
  const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(8_000) });
  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${readableProviderError(raw).slice(0, 160)}`);
  }
  const data = await response.json();
  return Array.isArray(data.models) ? data.models : [];
}

function toModelInfos(items: { name: string; size?: number }[]): ModelInfo[] {
  return items
    .map((m) => {
      const sizeGb = m.size ? Math.round(Number(m.size) / 1e9) : undefined;
      return {
        id: String(m.name ?? ''),
        name: String(m.name ?? ''),
        provider: 'ollama' as ProviderType,
        detail: sizeGb ? `${sizeGb} GB` : undefined,
      };
    })
    .filter((m) => m.id);
}

export async function fetchModelCatalog(
  config: CatalogConfig,
  refresh = false
): Promise<ModelCatalog | null> {
  if (config.provider !== 'ollama') {
    try {
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          refresh,
        }),
      });
      const payload = await response.json();
      return payload.ok ? ({ ...payload } as ModelCatalog) : null;
    } catch {
      return null;
    }
  }

  const baseUrl = ollamaBaseUrl(config);
  try {
    const models = toModelInfos(await fetchOllamaTags(baseUrl));
    if (models.length === 0) throw new Error('Ollama reported no models — pull one first.');
    return { provider: 'ollama', live: true, endpoint: baseUrl, models };
  } catch (err) {
    return {
      provider: 'ollama',
      live: false,
      endpoint: baseUrl,
      error: String((err as Error)?.message || err),
      models: PROVIDER_PRESETS.ollama.models.map((m) => ({
        id: m.id,
        name: m.name,
        provider: 'ollama' as ProviderType,
        detail: 'built-in suggestion',
      })),
    };
  }
}

export async function testProviderConnection(config: TestConfig): Promise<ConnectionResult> {
  if (config.provider !== 'ollama') {
    try {
      const response = await fetch('/api/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          model: config.model,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
        }),
      });
      const data = await response.json();
      return {
        ok: Boolean(data.success),
        message: data.success ? data.message : data.error ?? 'Connection test failed.',
      };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  const baseUrl = ollamaBaseUrl(config);
  try {
    const items = await fetchOllamaTags(baseUrl);
    const models = items.map((m) => String(m.name ?? '')).filter(Boolean);
    const requested = config.model?.trim();
    const missingLine =
      requested && !models.includes(requested)
        ? ` "${requested}" is not in that list — run "ollama pull ${requested}" first.`
        : '';
    return {
      ok: true,
      message:
        `Successfully connected to ${config.provider.toUpperCase()}! ` +
        `Found ${models.length} model(s) at ${baseUrl}.` +
        (requested ? ` "${requested}" is available.` : '') +
        missingLine,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        `Ollama is not reachable at ${baseUrl} (${String((err as Error)?.message || err)}). ` +
        'Start it with "ollama serve", and make sure this site is allowed via OLLAMA_ORIGINS ' +
        '(see README -> "Using Ollama").',
    };
  }
}
