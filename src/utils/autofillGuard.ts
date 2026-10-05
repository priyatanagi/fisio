/**
 * Props that keep browser password managers and address books out of fields
 * that are not credentials in the login sense.
 *
 * Chrome pairs the nearest text input before a password input as a
 * "username" field and offers to fill both from a saved login. In the
 * Providers view that means a saved email lands in Base URL and a saved
 * password in API key, without the user touching anything. Worse, those
 * values are autofilled into the DOM but never reach React state, so the UI
 * shows a base URL/key that the app does not actually send.
 *
 * Firefox/Zen honours `autocomplete="off"` and ignores the rest, which is
 * why both are set; 1Password/Dashlane/LastPass read the data-* attributes.
 */
export function noAutofillProps(name: string) {
  return {
    name,
    autoComplete: 'off',
    'data-1p-ignore': 'true',
    'data-lpignore': 'true',
    'data-form-type': 'other',
  } as const;
}

/**
 * Same intent for a secret field. `new-password` is the only value browsers
 * reliably treat as "this is not an existing credential", so it suppresses
 * the offer to fill a saved password.
 */
export function noAutofillSecretProps(name: string) {
  return {
    ...noAutofillProps(name),
    autoComplete: 'new-password',
  } as const;
}
