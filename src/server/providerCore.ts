import type { ProviderType } from '../types/provider';
import type { TokenUsage, EventEmit, PublishInput } from '../types/agentEvents';
import { readableProviderError } from './providerText';

export class ProviderCallError extends Error {
  constructor(
    message: string,
    public readonly recoverable: boolean
  ) {
    super(message);
    this.name = 'ProviderCallError';
  }
}

/**
 * Ties provider-internal attempts to the run the UI is watching. `emit` is the
 * transport: on the server it becomes an NDJSON line in the run-agent
 * response; in the browser it writes straight to the local event bus.
 */
export interface CallTrace {
  runId: string;
  role: string;
  label?: string;
  callId?: string;
  emit: EventEmit;
}

export interface ProviderCallResult {
  text: string;
  /** Model that actually answered; differs from the config when Gemini fell back. */
  model: string;
  provider: ProviderType;
  attempts: number;
  usage?: TokenUsage;
  requestedModel: string;
  /**
   * True when the provider stopped because it hit its output ceiling rather
   * than finishing. The body is then usually a valid-looking prefix.
   */
  truncated?: boolean;
}

type PublishRest = Omit<PublishInput, 'runId' | 'role'>;

/**
 * A stalled provider socket used to block a run forever (observed: one Reviewer
 * request that never returned). Generations finish in seconds, so a slow
 * attempt is cut short and reported instead of hanging the pipeline.
 */
export const REQUEST_TIMEOUT_MS = 180_000;

export function isTimeoutError(err: unknown): boolean {
  const e = err as { name?: string; message?: string };
  const name = String(e?.name ?? '');
  const message = String(e?.message ?? '');
  return (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    /timed out|timeout|was aborted/i.test(message)
  );
}

export function describeFailure(err: unknown): string {
  if (isTimeoutError(err)) return `no response after ${REQUEST_TIMEOUT_MS / 1000}s`;
  return readableProviderError(String((err as Error)?.message || err));
}

export function trace(
  callTrace: CallTrace | undefined,
  provider: ProviderType,
  rest: PublishRest
): void {
  if (!callTrace) return;
  callTrace.emit({
    ...rest,
    runId: callTrace.runId,
    role: callTrace.role,
    label: callTrace.label,
    callId: callTrace.callId,
    provider,
  });
}
