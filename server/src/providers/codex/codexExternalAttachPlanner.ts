import type { ExternalSessionDescriptor } from '../../../../src/providers/providerAdapter.js';
import type { AgentState } from '../../../../src/types.js';

export type CodexExternalAttachDecision =
  | { type: 'adoptRoot' }
  | { type: 'attachChild'; parentAgentId: number; parentToolId: string }
  | { type: 'pendingChild'; parentThreadId: string }
  | { type: 'ignore'; reason: string };

export function syntheticParentToolIdForThread(parentThreadId: string): string {
  return `external-codex-parent:${parentThreadId}`;
}

export function decideCodexExternalAttach(
  candidate: ExternalSessionDescriptor,
  agents: readonly AgentState[],
): CodexExternalAttachDecision {
  if (candidate.providerId !== 'codex') {
    return { type: 'ignore', reason: 'unsupported-provider' };
  }

  if (candidate.kind === 'root') {
    return { type: 'adoptRoot' };
  }

  if (!candidate.parentThreadId) {
    return { type: 'ignore', reason: 'missing-parent-thread' };
  }

  const parentAgent = agents.find(
    (agent) =>
      agent.providerId === 'codex' &&
      !agent.externalCodexParentAgentId &&
      (agent.codexRootThreadId === candidate.parentThreadId ||
        agent.sessionId === candidate.parentThreadId),
  );

  if (!parentAgent) {
    return { type: 'pendingChild', parentThreadId: candidate.parentThreadId };
  }

  return {
    type: 'attachChild',
    parentAgentId: parentAgent.id,
    parentToolId: syntheticParentToolIdForThread(candidate.parentThreadId),
  };
}
