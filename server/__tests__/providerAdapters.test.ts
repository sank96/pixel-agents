import { describe, expect, it } from 'vitest';

import {
  getExternalDiscoveryAdapters,
  getProviderAdapter,
} from '../../src/providers/providerAdapters.js';

describe('providerAdapters', () => {
  it('exposes Codex external discovery alongside Claude', () => {
    expect(getExternalDiscoveryAdapters().map((provider) => provider.id)).toEqual([
      'claude',
      'codex',
    ]);
  });

  it('returns the Codex sessions root and a platform hook policy', () => {
    const codex = getProviderAdapter('codex');
    expect(codex?.getProjectsRoot?.()).toContain('.codex');
    expect(typeof codex?.supportsHooksOnCurrentPlatform?.()).toBe('boolean');
  });
});
