import React, { useState } from 'react';
import {
  X,
  Cpu,
  Server,
  Key,
  Globe,
  Check,
  AlertCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  Eye,
  EyeOff,
} from 'lucide-react';
import { ProviderConfig, ProviderType, PROVIDER_PRESETS } from '../types/provider';

interface ProviderSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerConfig: ProviderConfig;
  onSaveConfig: (config: ProviderConfig) => void;
}

export const ProviderSettingsModal: React.FC<ProviderSettingsModalProps> = ({
  isOpen,
  onClose,
  providerConfig,
  onSaveConfig,
}) => {
  const [activeProvider, setActiveProvider] = useState<ProviderType>(providerConfig.provider);
  const [model, setModel] = useState<string>(providerConfig.model);
  const [apiKey, setApiKey] = useState<string>(providerConfig.apiKey || '');
  const [baseUrl, setBaseUrl] = useState<string>(providerConfig.baseUrl || '');
  const [showKey, setShowKey] = useState<boolean>(false);

  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentPreset = PROVIDER_PRESETS[activeProvider];

  const handleProviderChange = (newProvider: ProviderType) => {
    setActiveProvider(newProvider);
    const preset = PROVIDER_PRESETS[newProvider];
    setModel(preset.defaultModel);
    setBaseUrl(preset.defaultBaseUrl);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: activeProvider,
          model,
          apiKey,
          baseUrl,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: data.message || 'Connection verified successfully!',
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Connection test failed. Please verify API key and endpoint.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Network error while attempting connection test.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    const updated: ProviderConfig = {
      provider: activeProvider,
      model: model.trim() || currentPreset.defaultModel,
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
    };

    onSaveConfig(updated);
    setSaveFeedback(true);
    setTimeout(() => {
      setSaveFeedback(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/70">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-zinc-200" />
            <div>
              <h2 className="text-base font-semibold text-zinc-100">AI Agent Provider & Model</h2>
              <p className="text-xs text-zinc-400">
                Connect Gemini API, OpenAI Compatible (OpenAI, DeepSeek, Groq, Ollama), or Anthropic Claude.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Provider Selector Tabs */}
        <div className="px-6 pt-3 border-b border-zinc-800 bg-zinc-950/40 grid grid-cols-3 gap-2">
          {(['gemini', 'openai', 'anthropic'] as ProviderType[]).map((prov) => {
            const isSelected = activeProvider === prov;
            const pInfo = PROVIDER_PRESETS[prov];
            return (
              <button
                key={prov}
                type="button"
                onClick={() => handleProviderChange(prov)}
                className={`py-2.5 px-3 text-xs font-medium rounded-t-lg border-b-2 transition-all flex flex-col items-center gap-1 ${
                  isSelected
                    ? 'border-zinc-100 bg-zinc-900 text-zinc-100 font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                }`}
              >
                <span>{pInfo.name}</span>
                <span className="text-[10px] text-zinc-400 font-normal">
                  {prov === 'gemini' ? 'Default' : prov === 'openai' ? 'OpenAI / DeepSeek' : 'Claude 3.7'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Form Body */}
        <div className="flex-1 p-6 overflow-y-auto space-y-5 bg-zinc-950 text-xs">
          {/* Provider Overview */}
          <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg flex items-start gap-2.5 text-zinc-300">
            <Server className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold text-zinc-200">{currentPreset.name} Engine: </span>
              <span className="text-zinc-400">{currentPreset.description}</span>
            </div>
          </div>

          {/* Model Selection */}
          <div className="space-y-1.5">
            <label className="text-zinc-300 font-medium flex items-center justify-between">
              <span>Model Identifier</span>
              <span className="text-[11px] text-zinc-400 font-mono">Preset or Custom Model</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={currentPreset.models.some((m) => m.id === model) ? model : 'custom'}
                onChange={(e) => {
                  if (e.target.value !== 'custom') {
                    setModel(e.target.value);
                  }
                }}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 text-xs outline-none focus:border-zinc-500"
              >
                {currentPreset.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
                <option value="custom">Custom Model Name...</option>
              </select>

              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. gpt-4o, deepseek-chat, gemini-3.8-flash"
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-100 font-mono text-xs outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          {/* Base URL (Optional / Custom for OpenAI / Anthropic) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-zinc-300 font-medium flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-zinc-400" />
                <span>Base URL</span>
              </label>
              {currentPreset.defaultBaseUrl && (
                <button
                  type="button"
                  onClick={() => setBaseUrl(currentPreset.defaultBaseUrl)}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 font-mono underline"
                >
                  Reset Default
                </button>
              )}
            </div>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={currentPreset.defaultBaseUrl || 'Default platform endpoint'}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-zinc-100 font-mono text-xs outline-none focus:border-zinc-500"
            />
            <p className="text-[11px] text-zinc-400">
              {activeProvider === 'openai'
                ? 'Supports official OpenAI, DeepSeek (https://api.deepseek.com/v1), Groq (https://api.groq.com/openai/v1), OpenRouter, or local Ollama.'
                : activeProvider === 'anthropic'
                ? 'Standard Anthropic endpoint is https://api.anthropic.com/v1'
                : 'Leave blank to use the standard Gemini API endpoint.'}
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-zinc-300 font-medium flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-zinc-400" />
                <span>API Key</span>
              </span>
              {activeProvider === 'gemini' && (
                <span className="text-[11px] text-zinc-400 font-mono">
                  (Optional if system key is active)
                </span>
              )}
            </label>
            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  activeProvider === 'gemini'
                    ? 'Using system GEMINI_API_KEY by default, or paste custom key...'
                    : `Paste your ${currentPreset.name} API Key here...`
                }
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 pr-10 text-zinc-100 font-mono text-xs outline-none focus:border-zinc-500"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 text-zinc-400 hover:text-zinc-200"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Test Connection Button & Result */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-medium transition-colors"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                  <span>Testing Connection...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Test Connection</span>
                </>
              )}
            </button>

            {testResult && (
              <div
                className={`flex-1 p-2 rounded-lg text-[11px] flex items-center gap-2 border ${
                  testResult.success
                    ? 'bg-emerald-950/40 border-emerald-800/70 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800/70 text-rose-300'
                }`}
              >
                {testResult.success ? (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span className="truncate">{testResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between">
          <span className="text-xs text-zinc-400 font-mono">
            Provider: {activeProvider.toUpperCase()} • {model}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-zinc-100 hover:bg-white text-zinc-950 rounded-lg transition-all font-semibold shadow-sm"
            >
              {saveFeedback ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Saved!</span>
                </>
              ) : (
                <span>Apply Provider</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
