import type { AnyRole } from './stages';
import type { ProviderConfig } from '../types/provider';
import type { UserProfile } from '../types/profile';
import type { UniversalRules } from '../config/universalRules';

export interface RunAgentOptions {
  role: AnyRole;
  input: Record<string, unknown>;
  userProfile: UserProfile;
  providerConfig: ProviderConfig;
  universalRules: UniversalRules;
  signal: AbortSignal;
}

export class AgentError extends Error {
  constructor(
    message: string,
    public readonly recoverable: boolean,
    public readonly aborted = false
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export async function runAgent(options: RunAgentOptions): Promise<any> {
  let response: Response;
  try {
    response = await fetch('/api/run-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        role: options.role,
        input: options.input,
        userProfile: options.userProfile,
        providerConfig: options.providerConfig,
        universalRules: options.universalRules,
      }),
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new AgentError('Request aborted', true, true);
    }
    throw new AgentError((err as Error).message || 'Network error', true);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    throw new AgentError(
      payload.error || `Server responded with status ${response.status}`,
      payload.recoverable !== false
    );
  }

  return payload.data;
}
