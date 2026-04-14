import { describe, expect, it } from 'vitest';

import type { ExternalSessionDescriptor } from '../../src/providers/providerAdapter.js';
import type { AgentState } from '../../src/types.js';
import {
  decideCodexExternalAttach,
  syntheticParentToolIdForThread,
} from '../src/providers/codex/codexExternalAttachPlanner.js';

const rootCandidate: ExternalSessionDescriptor = {
  providerId: 'codex',
  sessionId: 'root-thread-1',
  transcriptPath: '/tmp/root-rollout.jsonl',
  projectDir: '/tmp',
  cwd: '/workspace/current',
  kind: 'root',
};

const childCandidate: ExternalSessionDescriptor = {
  providerId: 'codex',
  sessionId: 'child-thread-1',
  transcriptPath: '/tmp/child-rollout.jsonl',
  projectDir: '/tmp',
  cwd: '/workspace/current',
  kind: 'child',
  parentThreadId: 'root-thread-1',
  label: 'Mill',
};

function buildAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 7,
    sessionId: 'root-thread-1',
    isExternal: true,
    providerId: 'codex',
    projectDir: '/tmp',
    jsonlFile: '/tmp/root-rollout.jsonl',
    fileOffset: 0,
    lineBuffer: '',
    activeToolIds: new Set(),
    activeToolStatuses: new Map(),
    activeToolNames: new Map(),
    activeSubagentToolIds: new Map(),
    activeSubagentToolNames: new Map(),
    activeSubagentToolStatuses: new Map(),
    backgroundAgentToolIds: new Set(),
    isWaiting: false,
    permissionSent: false,
    hadToolsInTurn: false,
    lastDataAt: 0,
    linesProcessed: 0,
    seenUnknownRecordTypes: new Set(),
    hookDelivered: false,
    codexRootThreadId: 'root-thread-1',
    ...overrides,
  };
}

describe('codexExternalAttachPlanner', () => {
  it('adopts root sessions as external agents', () => {
    expect(decideCodexExternalAttach(rootCandidate, [])).toEqual({ type: 'adoptRoot' });
  });

  it('attaches child sessions when the parent root thread is already known', () => {
    expect(decideCodexExternalAttach(childCandidate, [buildAgent()])).toEqual({
      type: 'attachChild',
      parentAgentId: 7,
      parentToolId: syntheticParentToolIdForThread('root-thread-1'),
    });
  });

  it('keeps child sessions pending when the parent is not known yet', () => {
    expect(decideCodexExternalAttach(childCandidate, [])).toEqual({
      type: 'pendingChild',
      parentThreadId: 'root-thread-1',
    });
  });

  it('ignores child sessions without parent metadata', () => {
    expect(
      decideCodexExternalAttach(
        {
          ...childCandidate,
          parentThreadId: undefined,
        },
        [],
      ),
    ).toEqual({
      type: 'ignore',
      reason: 'missing-parent-thread',
    });
  });
});
