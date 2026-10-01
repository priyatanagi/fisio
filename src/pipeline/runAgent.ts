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
  /** Identifies the run whose background activity the UI is watching. */
  runId?: string;
  /** Sub-grouping inside a run, e.g. a batch row. */
  eventLabel?: string;
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
  const callId = options.runId
    ? `${options.role}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    : undefined;
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
        runId: options.runId,
        eventLabel: options.eventLabel,
        callId,
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
