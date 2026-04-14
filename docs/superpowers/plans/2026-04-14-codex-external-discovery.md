# Codex External Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add Codex external-session discovery and attach so already-running Codex sessions appear in Pixel Agents with workspace-scoped visibility by default, global visibility behind `Watch All Sessions`, and detach-only close semantics.

**Architecture:** Extend the provider discovery contract so external scanning is provider-driven instead of Claude-specific. Parse Codex rollout transcripts from `~/.codex/sessions/**/rollout-*.jsonl` through a pure testable helper, then project root sessions into external agents and child sessions into best-effort synthetic subagents keyed by a stable synthetic `parentToolId`.

**Tech Stack:** TypeScript, VS Code Extension API, Vitest, Playwright, Codex CLI transcript files, React webview

---

## File Structure

- Modify: `src/providers/providerAdapter.ts`
  - Extend the provider contract so external discovery is no longer hardcoded to Claude directory assumptions.
- Modify: `src/providers/providerRegistry.ts`
  - Mark Codex as externally discoverable and keep registry metadata authoritative.
- Modify: `src/providers/claude/claudeProvider.ts`
  - Keep Claude aligned with the new external-discovery contract without changing behavior.
- Modify: `src/providers/codex/codexProvider.ts`
  - Expose Codex sessions root, transcript matcher, and platform hook policy.
- Create: `server/src/providers/codex/codexExternalDiscovery.ts`
  - Pure helper to enumerate Codex rollout transcripts and extract `session_meta` for root/child classification.
- Create: `server/__tests__/codexExternalDiscovery.test.ts`
  - Unit coverage for recursive rollout discovery and metadata extraction.
- Create: `server/src/providers/codex/codexExternalAttachPlanner.ts`
  - Pure helper to decide `adoptRoot` vs `attachChild` vs `pendingChild` vs `ignore`.
- Create: `server/__tests__/codexExternalAttachPlanner.test.ts`
  - Unit coverage for child-session best-effort attach decisions.
- Modify: `src/fileWatcher.ts`
  - Replace Claude-centric external scanning with provider-driven scanning and child-session projection.
- Modify: `src/types.ts`
  - Add the minimal agent state needed for hidden external Codex child sessions and synthetic parent linkage.
- Modify: `src/agentManager.ts`
  - Re-send synthetic external subagent state on webview restore the same way current subagent state is replayed.
- Modify: `src/PixelAgentsViewProvider.ts`
  - Keep the existing close/dismiss semantics, but make scanner startup and hook gating provider-aware.
- Modify: `e2e/helpers/launch.ts`
  - Seed external Codex rollout transcripts into the isolated `HOME` for scenario-driven tests.
- Create: `e2e/tests/codex-external-discovery.spec.ts`
  - Verify root attach, `Watch All Sessions`, detach-only close, and best-effort child attach.
- Modify: `README.md`
  - Replace the “external discovery deferred” note for Codex.
- Modify: `webview-ui/src/changelogData.ts`
  - Add a release note entry for Codex external attach.

### Task 1: Extend the provider discovery contract for Codex

**Files:**

- Modify: `src/providers/providerAdapter.ts`
- Modify: `src/providers/providerRegistry.ts`
- Modify: `src/providers/claude/claudeProvider.ts`
- Modify: `src/providers/codex/codexProvider.ts`
- Create: `server/__tests__/providerAdapters.test.ts`
- Modify: `server/__tests__/providerRegistry.test.ts`

- [x] **Step 1: Write the failing provider discovery tests**

Add assertions that Codex is externally discoverable and that the adapter contract exposes Codex discovery information:

```ts
import { describe, expect, it } from 'vitest';

import {
  getExternalDiscoveryAdapters,
  getProviderAdapter,
} from '../../src/providers/providerAdapters.js';
import { getProviderById } from '../../src/providers/providerRegistry.js';

describe('providerAdapters', () => {
  it('exposes Codex external discovery alongside Claude', () => {
    expect(getProviderById('codex')?.supportsExternalDiscovery).toBe(true);
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
```

- [x] **Step 2: Run the tests to verify they fail**

Run:

- `cd server && npm test -- providerRegistry.test.ts providerAdapters.test.ts`

Expected:

- FAIL because Codex still reports `supportsExternalDiscovery: false`
- FAIL because the adapter contract does not yet expose a platform hook policy

- [x] **Step 3: Extend the provider adapter contract**

Update `src/providers/providerAdapter.ts` to add the provider-driven discovery hooks needed by the scanner:

```ts
export interface ExternalSessionDescriptor {
  providerId: ProviderId;
  sessionId: string;
  transcriptPath: string;
  projectDir: string;
  cwd?: string;
  kind: 'root' | 'child';
  parentThreadId?: string;
  folderName?: string;
  label?: string;
}

export interface ProviderAdapter {
  id: ProviderId;
  descriptor: ProviderDescriptor;
  usesTranscriptFile: boolean;
  terminalLabel(index: number): string;
  matchesTerminalLabel(terminalName: string): boolean;
  buildLaunchPlan(input: ProviderLaunchRequest): ProviderLaunchPlan;
  getProjectDir(cwd?: string): string;
  getProjectsRoot?(): string;
  listExternalSessionFiles?(rootDir: string): string[];
  supportsHooksOnCurrentPlatform?(): boolean;
  installIntegration?(extensionPath: string): void;
  uninstallIntegration?(): void;
}
```

- [x] **Step 4: Wire Codex and Claude to the new contract**

Make the minimal descriptor/provider changes:

```ts
const CODEX_DESCRIPTOR: ProviderDescriptor = {
  id: 'codex',
  displayName: 'Codex',
  terminalPrefix: 'Codex',
  supportsExternalDiscovery: true,
  supportsStructuredEvents: true,
};

function codexSessionsRoot(): string {
  return path.join(os.homedir(), '.codex', 'sessions');
}

supportsHooksOnCurrentPlatform(): boolean {
  return process.platform !== 'win32';
}

listExternalSessionFiles(rootDir: string): string[] {
  return listCodexRolloutFiles(rootDir);
}
```

Keep Claude behavior unchanged by returning `true` from `supportsHooksOnCurrentPlatform()` and leaving its root as `~/.claude/projects`.

- [x] **Step 5: Run validation**

Run:

- `cd server && npm test -- providerRegistry.test.ts providerAdapters.test.ts`
- `npm run check-types`

Expected: PASS

- [x] **Step 6: Commit**

```bash
git add src/providers/providerAdapter.ts src/providers/providerRegistry.ts src/providers/claude/claudeProvider.ts src/providers/codex/codexProvider.ts server/__tests__/providerRegistry.test.ts server/__tests__/providerAdapters.test.ts
git commit -m "refactor: enable codex external discovery contract"
```

### Task 2: Add a pure Codex transcript discovery parser

**Files:**

- Create: `server/src/providers/codex/codexExternalDiscovery.ts`
- Create: `server/__tests__/codexExternalDiscovery.test.ts`

- [x] **Step 1: Write the failing parser tests**

Add tests that cover recursive rollout discovery plus `session_meta` parsing for both root and child sessions:

```ts
import { describe, expect, it } from 'vitest';

import {
  listCodexRolloutFiles,
  parseCodexExternalSession,
} from '../src/providers/codex/codexExternalDiscovery.js';

describe('codexExternalDiscovery', () => {
  it('parses a root rollout transcript', () => {
    const result = parseCodexExternalSession(rootTranscriptPath);
    expect(result).toMatchObject({
      kind: 'root',
      sessionId: '019d8b41-fa15-75a3-854a-242a4f58db7f',
      cwd: 'C:\\Users\\m.sanchioni\\Developer\\workspaces\\pixel-agents',
    });
  });

  it('parses a child rollout transcript with parent thread metadata', () => {
    const result = parseCodexExternalSession(childTranscriptPath);
    expect(result).toMatchObject({
      kind: 'child',
      parentThreadId: '019d8b41-fa15-75a3-854a-242a4f58db7f',
      label: 'Mill',
    });
  });
});
```

- [x] **Step 2: Run the parser tests to verify they fail**

Run:

- `cd server && npm test -- codexExternalDiscovery.test.ts`

Expected: FAIL because the parser module does not exist yet

- [x] **Step 3: Implement recursive rollout discovery and metadata parsing**

Create `server/src/providers/codex/codexExternalDiscovery.ts` with two pure entry points:

```ts
export function listCodexRolloutFiles(rootDir: string): string[] {
  // Recursively walk YYYY/MM/DD folders and keep only rollout-*.jsonl files.
}

export function parseCodexExternalSession(
  transcriptPath: string,
): ExternalSessionDescriptor | null {
  // Read only until the first session_meta line is found.
  // Return null when no usable session_meta exists.
}
```

The parser must extract:

- `sessionId` from `payload.id`
- `cwd` from `payload.cwd`
- `kind: 'child'` when `payload.source.subagent.thread_spawn.parent_thread_id` exists
- `parentThreadId`
- `label` from `agent_nickname ?? agent_role ?? 'Subagent'`
- `projectDir` from `path.dirname(transcriptPath)`

- [x] **Step 4: Run the parser tests to verify they pass**

Run:

- `cd server && npm test -- codexExternalDiscovery.test.ts`

Expected: PASS

- [x] **Step 5: Commit**

```bash
git add server/src/providers/codex/codexExternalDiscovery.ts server/__tests__/codexExternalDiscovery.test.ts
git commit -m "test: add codex external transcript discovery parser"
```

### Task 3: Add a pure attach planner for root vs child Codex sessions

**Files:**

- Create: `server/src/providers/codex/codexExternalAttachPlanner.ts`
- Create: `server/__tests__/codexExternalAttachPlanner.test.ts`
- Modify: `src/types.ts`

- [x] **Step 1: Write the failing attach-planner tests**

Add tests for the four decisions the watcher must make:

```ts
import { describe, expect, it } from 'vitest';

import {
  decideCodexExternalAttach,
  syntheticParentToolIdForThread,
} from '../src/providers/codex/codexExternalAttachPlanner.js';

describe('codexExternalAttachPlanner', () => {
  it('adopts root sessions as external agents', () => {
    expect(decideCodexExternalAttach(rootCandidate, [])).toMatchObject({
      type: 'adoptRoot',
    });
  });

  it('attaches child sessions when the parent root thread is already known', () => {
    expect(decideCodexExternalAttach(childCandidate, [parentAgent])).toMatchObject({
      type: 'attachChild',
      parentAgentId: 7,
      parentToolId: syntheticParentToolIdForThread(parentAgent.codexRootThreadId!),
    });
  });

  it('keeps child sessions pending when the parent is not known yet', () => {
    expect(decideCodexExternalAttach(childCandidate, [])).toMatchObject({
      type: 'pendingChild',
    });
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run:

- `cd server && npm test -- codexExternalAttachPlanner.test.ts`

Expected: FAIL because the planner module does not exist yet

- [x] **Step 3: Implement the planner and the minimal state additions**

Add a pure helper that returns one of:

```ts
export type CodexExternalAttachDecision =
  | { type: 'adoptRoot' }
  | { type: 'attachChild'; parentAgentId: number; parentToolId: string }
  | { type: 'pendingChild'; parentThreadId: string }
  | { type: 'ignore'; reason: string };

export function syntheticParentToolIdForThread(parentThreadId: string): string {
  return `external-codex-parent:${parentThreadId}`;
}
```

Extend `AgentState` only with the fields needed to track hidden external child sessions without surfacing them as root office agents:

```ts
externalCodexParentAgentId?: number;
externalCodexParentToolId?: string;
externalCodexChildLabel?: string;
```

- [x] **Step 4: Run the tests to verify they pass**

Run:

- `cd server && npm test -- codexExternalAttachPlanner.test.ts`
- `npm run check-types`

Expected: PASS

- [x] **Step 5: Commit**

```bash
git add server/src/providers/codex/codexExternalAttachPlanner.ts server/__tests__/codexExternalAttachPlanner.test.ts src/types.ts
git commit -m "feat: plan codex external root and child attachment"
```

### Task 4: Integrate provider-driven scanning and best-effort child attach into the watcher

**Files:**

- Modify: `src/fileWatcher.ts`
- Modify: `src/PixelAgentsViewProvider.ts`
- Modify: `src/agentManager.ts`

- [x] **Step 1: Write the failing end-to-end tests for external Codex attach**

Create the new e2e file first so the runtime work is driven by user-visible behavior:

```ts
test('external Codex root session appears in the current workspace', async ({}, testInfo) => {
  // Seed a rollout transcript in the isolated HOME before opening VS Code.
  // Open Pixel Agents and assert a Codex character appears without clicking + Agent.
});

test('Watch All Sessions reveals an external Codex session from another workspace', async ({}, testInfo) => {
  // Seed a second transcript with a different cwd and enable the toggle in Settings.
});

test('closing an external Codex session only detaches it from Pixel Agents', async ({}, testInfo) => {
  // Close from Debug View, then verify the transcript still exists on disk.
});

test('external Codex child session appears as a best-effort subagent', async ({}, testInfo) => {
  // Seed a root rollout and a child rollout that references the root thread id.
});
```

- [x] **Step 2: Run the new e2e file to verify it fails**

Run:

- `npm run e2e -- --grep "external Codex"`

Expected:

- FAIL because the launch helper does not seed external transcripts yet
- FAIL because the watcher only understands Claude-style flat JSONL directories

- [x] **Step 3: Seed external Codex rollout transcripts in the e2e launcher**

Update `e2e/helpers/launch.ts` so test titles can request seeded external-session scenarios. The helper should create realistic files under the isolated temp home:

```ts
const codexSessionsRoot = path.join(tmpHome, '.codex', 'sessions', '2026', '04', '14');

function seedCodexExternalRollout(
  transcriptPath: string,
  payload: {
    id: string;
    cwd: string;
    nickname?: string;
    parentThreadId?: string;
  },
): void {
  fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });
  fs.writeFileSync(
    transcriptPath,
    `${JSON.stringify({
      timestamp: '2026-04-14T09:46:49.696Z',
      type: 'session_meta',
      payload: {
        id: payload.id,
        cwd: payload.cwd,
        agent_nickname: payload.nickname,
        source: payload.parentThreadId
          ? { subagent: { thread_spawn: { parent_thread_id: payload.parentThreadId, depth: 1 } } }
          : undefined,
      },
    })}\n`,
  );
}
```

- [x] **Step 4: Replace the Claude-centric external scanner paths with provider-driven discovery**

Refactor `src/fileWatcher.ts` so external scanning no longer assumes:

- flat project directories full of `*.jsonl`
- `DEFAULT_PROVIDER_ID`
- transcript filename == session id

Make the scanner:

1. loop over `getExternalDiscoveryAdapters()`
2. call `provider.listExternalSessionFiles?(rootDir)` when available
3. for Codex, parse each rollout through `parseCodexExternalSession`
4. feed the result into `decideCodexExternalAttach`
5. apply the decision:
   - `adoptRoot`: create an external root agent and set `codexRootThreadId = sessionId`
   - `attachChild`: do **not** create a root office character; instead:
     - store the hidden child session in `agents`
     - set `externalCodexParentAgentId` and `externalCodexParentToolId`
     - seed `activeSubagentToolIds`, `activeSubagentToolNames`, and `activeSubagentToolStatuses`
     - emit `subagentToolStart` using a synthetic child tool id derived from the child session id
   - `pendingChild`: leave it queued until a parent root session is discovered on a later scan

Platform rule:

- only skip workspace scanning when hooks are actually active for the provider being scanned
- on Windows, Codex must continue transcript scanning even when the global hooks toggle is on

- [x] **Step 5: Keep replay, close, and restore behavior consistent**

Update `src/agentManager.ts` and the watcher cleanup paths so synthetic external Codex subagents survive webview refreshes and clear correctly:

```ts
for (const [parentToolId, subagentIds] of agent.activeSubagentToolIds) {
  for (const subToolId of subagentIds) {
    webview.postMessage({
      type: 'subagentToolStart',
      id: agent.id,
      parentToolId,
      toolId: subToolId,
      toolName: subagentNames?.get(subToolId) ?? '',
      status: subagentStatuses?.get(subToolId) ?? '',
    });
  }
}
```

Also keep the external close contract unchanged in `src/PixelAgentsViewProvider.ts`: `closeAgent` on an external Codex session must only dismiss and detach.

- [x] **Step 6: Run validation**

Run:

- `cd server && npm test -- providerRegistry.test.ts providerAdapters.test.ts codexExternalDiscovery.test.ts codexExternalAttachPlanner.test.ts`
- `npm run check-types`
- `npm run e2e -- --grep "external Codex"`

Expected: PASS

- [x] **Step 7: Commit**

```bash
git add src/fileWatcher.ts src/PixelAgentsViewProvider.ts src/agentManager.ts e2e/helpers/launch.ts e2e/tests/codex-external-discovery.spec.ts
git commit -m "feat: attach external codex sessions and best-effort subagents"
```

### Task 5: Ship docs and regression coverage

**Files:**

- Modify: `README.md`
- Modify: `webview-ui/src/changelogData.ts`

- [x] **Step 1: Update the README preview scope**

Replace the deferred external-discovery note with the shipped behavior:

```md
- **Codex preview scope** - Codex launch, app-server lifecycle mapping, `spawnAgent` visualization, and external-session discovery/attach are supported. Windows uses transcript-based external discovery; non-Windows can additionally use hooks where available.
```

- [x] **Step 2: Add a changelog bullet**

Update `webview-ui/src/changelogData.ts`:

```ts
'Codex external-session discovery for current workspace and Watch All Sessions',
'Best-effort external Codex child-thread attach as linked subagents',
```

- [x] **Step 3: Run the final regression suite**

Run:

- `npm run lint`
- `npm run build`
- `npm test`
- `npm run e2e`

Expected: PASS

- [x] **Step 4: Commit**

```bash
git add README.md webview-ui/src/changelogData.ts
git commit -m "docs: ship codex external discovery support"
```
