import { describe, expect, it } from 'vitest';
import { resolveInitialChatSelection } from '../web/src/lib/chat-launch';

describe('resolveInitialChatSelection', () => {
  it('uses companion and conversation from the launch url', () => {
    expect(
      resolveInitialChatSelection(
        '?companion=forge&conversation=convo-123',
        'cipher',
      ),
    ).toEqual({
      companionId: 'forge',
      conversationId: 'convo-123',
      launchedFromOnboarding: true,
    });
  });

  it('falls back to the active companion when the url is empty', () => {
    expect(resolveInitialChatSelection('', 'vortex')).toEqual({
      companionId: 'vortex',
      conversationId: null,
      launchedFromOnboarding: false,
    });
  });

  it('ignores a blank companion in the url', () => {
    expect(
      resolveInitialChatSelection('?companion=&conversation=convo-999', 'aether'),
    ).toEqual({
      companionId: 'aether',
      conversationId: 'convo-999',
      launchedFromOnboarding: false,
    });
  });
});
