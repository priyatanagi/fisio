import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import type { ModelCatalog, ModelInfo, ProviderType } from '../types/provider';
import { PROVIDER_PRESETS } from '../types/provider';
import { fetchModelCatalog } from '../pipeline/providerApi';
import { noAutofillProps } from '../utils/autofillGuard';

export function filterModels(models: ModelInfo[], query: string): ModelInfo[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return models;
  return models.filter((model) => {
    const haystack = `${model.id} ${model.name} ${model.detail ?? ''}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

interface ModelPickerProps {
  provider: ProviderType;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  /** Bump to re-query the provider, e.g. after a successful connection test. */
  reloadToken?: number;
  onChange: (model: string) => void;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({
  provider,
  model,
  baseUrl,
  apiKey,
  reloadToken = 0,
  onChange,
}) => {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  // Search text is kept separate from the saved config so filtering does not
  // persist half-typed model ids.
  const [draft, setDraft] = useState(model);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) setDraft(model);
  }, [model, open]);

  const load = useCallback(
    async (refresh: boolean) => {
      setLoading(true);
      try {
        // Ollama is queried directly from the browser; cloud providers go
        // through the server, which holds their keys.
        const catalog = await fetchModelCatalog({ provider, baseUrl, apiKey }, refresh);
        setCatalog(catalog);
      } catch {
        setCatalog(null);
      } finally {
        setLoading(false);
      }
    },
    [provider, baseUrl, apiKey]
  );

  // baseURL/key edits must not fire a request per keystroke, so only a provider
  // change or an explicit reload actually queries the catalog.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void loadRef.current(false);
  }, [provider]);

  useEffect(() => {
    if (reloadToken > 0) void loadRef.current(true);
  }, [reloadToken]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const matches = useMemo(
    () => filterModels(catalog?.models ?? [], draft),
    [catalog, draft]
  );
  const trimmed = model.trim();
  const selected = catalog?.models.find((entry) => entry.id === trimmed);
  const unknown = Boolean(catalog?.live && trimmed && !selected);

  const commit = (value: string) => {
    setDraft(value);
    if (value !== model) onChange(value);
  };

  const source = (() => {
    const endpoint = catalog?.endpoint;
    if (!endpoint) return PROVIDER_PRESETS[provider].name;
    try {
      return new URL(endpoint).host;
    } catch {
      return endpoint.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    }
  })();

  const statusLine = loading
    ? 'Loading models from provider...'
    : catalog?.live
      ? `${catalog.models.length} live model${catalog.models.length === 1 ? '' : 's'} · ${source}`
      : catalog
        ? `Built-in suggestions — ${source} did not return a list (${catalog.error})`
        : 'Loading...';

  return (
    <div className="space-y-1" ref={boxRef}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-400">Model identifier</span>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={loading}
          className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 hover:text-zinc-200 disabled:opacity-50"
          title="Ask the provider for its current model list"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          reload
        </button>
      </div>

      <div className="relative">
        <input
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => commit(draft.trim())}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setHighlight((index) => Math.min(index + 1, matches.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setHighlight((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter') {
              if (open && matches[highlight]) {
                event.preventDefault();
                commit(matches[highlight].id);
              }
              setOpen(false);
            } else if (event.key === 'Escape') {
              setDraft(model);
              setOpen(false);
            }
          }}
          placeholder="Search by name or type a model id"
          spellCheck={false}
          {...noAutofillProps('model-identifier')}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 pr-8 text-[11px] font-mono text-zinc-100 outline-none focus:border-zinc-500"
        />
        <ChevronDown className="w-3.5 h-3.5 text-zinc-600 absolute right-2 top-2.5 pointer-events-none" />

        {open && matches.length === 0 && draft.trim() && catalog && (
          <div className="absolute z-20 mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-[10px] font-mono text-zinc-500">
            No listed model matches “{draft.trim()}” — this id will be used exactly as typed.
          </div>
        )}

        {/* mousedown is prevented so choosing an option does not fire blur first. */}
        {open && matches.length > 0 && (
          <ul
            className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl"
            onMouseDown={(event) => event.preventDefault()}
          >
            {matches.map((entry, index) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => {
                    commit(entry.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-2 py-1.5 text-[11px] flex items-center gap-2 ${
                    index === highlight ? 'bg-zinc-800' : ''
                  }`}
                >
                  <span className="truncate flex-1 min-w-0">
                    <span className="block font-mono text-zinc-100 truncate">{entry.id}</span>
                    <span className="block text-zinc-500 truncate">
                      {entry.name}
                      {entry.detail ? ` · ${entry.detail}` : ''}
                    </span>
                  </span>
                  {entry.id === trimmed && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p
        className={`text-[10px] font-mono flex items-center gap-1.5 ${
          catalog?.live ? 'text-zinc-500' : 'text-amber-400/80'
        }`}
      >
        {loading && <Loader2 className="w-3 h-3 animate-spin" />}
        {statusLine}
      </p>
      {selected && selected.name !== selected.id && (
        <p className="text-[10px] text-zinc-400 truncate">{selected.name}</p>
      )}
      {unknown && (
        <p className="text-[10px] text-amber-400 truncate">
          “{trimmed}” is not in this provider&apos;s list; requests will still send it as configured.
        </p>
      )}
    </div>
  );
};
