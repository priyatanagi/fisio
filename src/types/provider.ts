export type ProviderType = 'gemini' | 'openai' | 'anthropic' | 'ollama';
export type AgentRole = 'judge' | 'impower' | 'creator' | 'reviewer' | 'designer';

export interface ProviderConfig {
  provider: ProviderType;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  savedConfigs?: Record<string, { model: string; apiKey: string; baseUrl: string }>;
}

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  provider: 'gemini',
  model: 'gemini-3.1-flash-lite',
  baseUrl: '',
  apiKey: '',
  savedConfigs: {
    gemini: { model: 'gemini-3.1-flash-lite', apiKey: '', baseUrl: '' },
    openai: { model: 'gpt-4o', apiKey: '', baseUrl: 'https://api.openai.com/v1' },
    anthropic: { model: 'claude-3-7-sonnet-20250219', apiKey: '', baseUrl: 'https://api.anthropic.com/v1' },
    ollama: { model: 'gemma4:e4b', apiKey: '', baseUrl: 'http://localhost:11434' },
  },
};

export type MultiAgentConfig = Record<AgentRole, ProviderConfig>;

/** A model offered by a provider. `id` is what gets sent in API requests. */
export interface ModelInfo {
  id: string;
  /** Human label from the provider when it exposes one, otherwise the id. */
  name: string;
  provider: ProviderType;
  /** Short capability note, e.g. '128K in · 16K out' or '4B params'. */
  detail?: string;
}

export interface ModelCatalog {
  models: ModelInfo[];
  /** False when the provider listing failed and `models` is the built-in list. */
  live: boolean;
  provider: ProviderType;
  error?: string;
  /** Endpoint that was actually queried, which may come from env rather than the UI. */
  endpoint?: string;
}

export const DEFAULT_MULTI_AGENT_CONFIG: MultiAgentConfig = {
  judge: { ...DEFAULT_PROVIDER_CONFIG },
  impower: { ...DEFAULT_PROVIDER_CONFIG },
  creator: { ...DEFAULT_PROVIDER_CONFIG },
  reviewer: { ...DEFAULT_PROVIDER_CONFIG },
  designer: { ...DEFAULT_PROVIDER_CONFIG },
};

export const PROVIDER_PRESETS: Record<
  ProviderType,
  {
    name: string;
    description: string;
    defaultBaseUrl: string;
    defaultModel: string;
    /** Offline fallback only; /api/models returns the provider's real catalog. */
    models: { id: string; name: string }[];
  }
> = {
  gemini: {
    name: 'Google Gemini',
    description: 'Built-in Gemini API engine with automatic rate limit fallback',
    defaultBaseUrl: '',
    defaultModel: 'gemini-3.1-flash-lite',
    models: [
      { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite (High Quota & Fast)' },
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Deep Reasoning)' },
      { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' },
    ],
  },
  openai: {
    name: 'OpenAI Compatible',
    description: 'Compatible with OpenAI, Groq, DeepSeek, OpenRouter, vLLM, and Ollama',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o (High Performance)' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Cost-Effective)' },
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)' },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq)' },
    ],
  },
  anthropic: {
    name: 'Anthropic Claude',
    description: 'Anthropic Messages API for Claude 3.5 & Claude 3.7 models',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-7-sonnet-20250219',
    models: [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet (Latest)' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku (Fast)' },
    ],
  },
  ollama: {
    name: 'Ollama (Local)',
    description: 'Free local inference via the Ollama native API. No API key required.',
    defaultBaseUrl: 'http://localhost:11434',
    defaultModel: 'gemma4:e4b',
    models: [
      { id: 'gemma4:e4b', name: 'gemma4:e4b (local)' },
      { id: 'ornith:9b', name: 'ornith:9b (local)' },
    ],
  },
};
