import { describe, it, expect } from 'vitest';

import {
  phaseToPlainLanguage,
  recoveryActionsForStatus,
} from '../web/src/lib/installer-ui.js';

describe('installer UI helpers', () => {
  it('maps internal phases to plain-language progress labels', () => {
    expect(phaseToPlainLanguage('preflight')).toContain('Checking your system');
    expect(phaseToPlainLanguage('dependencies')).toContain('Installing required tools');
    expect(phaseToPlainLanguage('verification')).toContain('Verifying everything works');
  });

  it('offers retry/restart/contact-support actions when failed', () => {
    const actions = recoveryActionsForStatus('failed', null);
    expect(actions).toEqual(['retry', 'restart', 'contact-support']);
  });

  it('offers explicit approve/reject when waiting on external confirmation', () => {
    const actions = recoveryActionsForStatus('waiting-confirmation', {
      id: 'create-cloud-project',
      description: 'Create cloud project',
      scope: 'external',
      risk: 'account',
    });

    expect(actions).toContain('approve-external');
    expect(actions).toContain('reject-external');
    expect(actions).toContain('restart');
  });
});
