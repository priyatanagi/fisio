import { describe, expect, it } from 'vitest';
import { noAutofillProps, noAutofillSecretProps } from './autofillGuard';

describe('noAutofillProps', () => {
  it('turns off browser and password-manager autofill', () => {
    const props = noAutofillProps('base-url-creator');
    expect(props).toMatchObject({
      name: 'base-url-creator',
      autoComplete: 'off',
      'data-1p-ignore': 'true',
      'data-lpignore': 'true',
      'data-form-type': 'other',
    });
  });

  it('gives each field a distinct name so heuristics cannot pair them', () => {
    expect(noAutofillProps('base-url-creator').name).not.toBe(
      noAutofillProps('api-key-creator').name
    );
  });
});

describe('noAutofillSecretProps', () => {
  it('marks the secret as a new password so saved logins are not offered', () => {
    const props = noAutofillSecretProps('api-key-creator');
    expect(props.autoComplete).toBe('new-password');
    expect(props['data-1p-ignore']).toBe('true');
  });

  it('does not leave the text-field "off" hint on the secret', () => {
    expect(noAutofillSecretProps('api-key-creator').autoComplete).not.toBe('off');
  });
});
