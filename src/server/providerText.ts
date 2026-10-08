/**
 * Text-shaping helpers shared by every provider implementation and by the
 * client-side role validation. Kept in its own leaf module (no imports) so
 * the browser bundle can use them without pulling in any SDK.
 */

export function cleanJsonOutput(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

/**
 * Providers put the real reason inside a JSON error body, which the SDKs and
 * `response.text()` hand back verbatim. Unwrap it so the activity panel can read.
 */
export function readableProviderError(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed.startsWith('{')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    const message =
      parsed?.error?.message ?? parsed?.error?.error_message ?? parsed?.message ?? parsed?.msg;
    if (typeof message !== 'string' || !message.trim()) return trimmed;
    const status = parsed?.error?.status ?? parsed?.error?.code;
    return typeof status === 'string' ? `${message.trim()} (${status})` : message.trim();
  } catch {
    return trimmed;
  }
}
