export type ProviderType = 'gemini' | 'openai' | 'anthropic';

export interface ProviderConfig {
  provider: ProviderType;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  provider: 'gemini',
  model: 'gemini-3.1-flash-lite',
  baseUrl: '',
  apiKey: '',
};

export const PROVIDER_PRESETS: Record<
  ProviderType,
  {
    name: string;
    description: string;
    defaultBaseUrl: string;
    defaultModel: string;
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
};
