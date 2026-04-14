# Pixel Agents Codex External Discovery Design

## Goal

Add Codex external-session discovery and attach to Pixel Agents so already-running Codex sessions can appear in the office the same way Claude external sessions do today.

The first release must prioritize reliable visibility over perfect historical reconstruction:

1. Pixel Agents opens and discovers already-running Codex sessions.
2. Sessions in the current workspace appear by default.
3. `Watch All Sessions` expands visibility to sessions from other workspaces.
4. Root agents appear immediately.
5. Subagents appear on a best-effort basis when enough transcript metadata exists.

## Product Decisions

### In scope

- Automatic external-session discovery for Codex.
- Workspace-scoped discovery by default.
- Global discovery behind the existing `Watch All Sessions` toggle.
- Best-effort attach of Codex subagents when the transcript exposes parent-child thread relationships.
- UI behavior parity with Claude external agents:
  - no explicit `external` badge
  - `X` detaches from Pixel Agents only
  - no attempt to close the external terminal or remote session

### Out of scope

- WSL support.
- A dedicated `Attach` button.
- Perfect reconstruction of already-finished subagent history.
- Remote introspection of external Codex sessions through app-server transport.
- Changing Claude external-session behavior as part of this feature.

## Platform Strategy

Codex external attach should follow the same high-level architecture as Claude, but the runtime inputs differ by platform.

### Non-Windows

Use the full model:

- hooks when available
- transcript polling
- periodic external scanning

Hooks improve lifecycle accuracy, while transcripts remain necessary for detailed activity and best-effort subagent recovery.

### Windows

Use:

- transcript polling
- periodic external scanning

Do not depend on Codex hooks on Windows in v1. The implementation should remain structurally ready for hooks, but the Windows path must work without them.

## Discovery Source

Codex external attach should use the on-disk session transcripts under:

- `~/.codex/sessions/**/rollout-*.jsonl`

This is the preferred source over `~/.codex/session_index.jsonl`.

### Why not `session_index.jsonl`

`session_index.jsonl` is useful as a lightweight index, but it does not contain enough information to drive attach behavior safely. In practice it lacks the workspace and subagent metadata required for:

- filtering by current workspace
- distinguishing root sessions from child sessions
- linking child sessions back to a parent thread

### Why `rollout-*.jsonl`

Recent Codex rollout transcripts already contain a `session_meta` record with the fields needed for external attach:

- session id
- cwd
- agent nickname and role
- subagent thread-spawn metadata, including `parent_thread_id`

This gives Pixel Agents a stable enough basis to:

- decide whether a session belongs to the current workspace
- create a root agent immediately
- attach a child session as a subagent when a matching parent is known

## UX Behavior

### Default behavior

When Pixel Agents opens, Codex sessions whose transcript metadata points at the current workspace should appear automatically.

The user should not have to launch Codex from Pixel Agents for the office to reflect what is already running in terminals.

### Watch All Sessions

When `Watch All Sessions` is enabled, Pixel Agents should additionally scan all eligible Codex sessions under `~/.codex/sessions`, not only those that map to the current workspace.

This mirrors the current Claude model:

- workspace-local visibility by default
- broader global visibility only when the user explicitly opts in

### Close behavior

Closing an externally attached Codex agent from the UI should:

- remove it from Pixel Agents
- mark its transcript as dismissed for a cooldown period
- avoid immediate re-adoption by the scanner

It should not:

- terminate the Codex terminal
- send a stop signal to the session
- modify the external session itself

## Data Flow

### 1. Scanner startup

When the webview becomes ready, the extension host starts Codex external scanning alongside the existing Claude mechanisms.

### 2. Transcript candidate selection

The scanner walks recent `rollout-*.jsonl` files under `~/.codex/sessions`.

Candidate filtering should prefer:

- files that are active recently enough to still represent a live session
- files not already tracked
- files not currently dismissed by cooldown logic

### 3. Metadata extraction

For each candidate file, the scanner reads the earliest useful `session_meta` line and extracts:

- session id
- cwd
- agent nickname
- agent role
- subagent parent thread metadata when present

The scanner should stop reading once it has enough metadata to classify the file.

### 4. Workspace filtering

If `Watch All Sessions` is disabled, the scanner adopts only sessions whose `cwd` belongs to a tracked workspace.

If `Watch All Sessions` is enabled, the scanner may adopt sessions from any workspace.

### 5. Agent adoption

If the session is a root session, Pixel Agents creates an external Codex agent immediately.

If the session is a child session:

- and the parent thread is already mapped to a visible agent tool, attach it as a subagent
- otherwise keep it as best-effort pending state until the parent becomes known, or ignore it if the linkage never becomes valid

### 6. Ongoing updates

After adoption, transcript polling continues to drive:

- activity text
- tool status
- waiting states that can still be inferred from transcript flow
- best-effort subagent changes that occur after attach

On non-Windows platforms, hooks can enrich lifecycle accuracy, but the transcript path remains authoritative for detailed activity.

## Subagent Model

Subagent recovery for externally attached Codex sessions is intentionally best-effort.

### Required behavior

- If transcript metadata clearly indicates a child session and its parent thread is already known, show it as a subagent.
- If the parent is not yet known, do not block root-agent attach waiting for perfect subagent resolution.
- If later transcript activity or hook data makes the relationship resolvable, attach the subagent then.

### Non-goals

- Reconstruct every historical child thread that has already ended.
- Guarantee exact replay order for already-finished nested work.

This keeps the feature useful without taking on a brittle replay engine.

## Runtime Integration

### Provider descriptor

Codex should move to:

- `supportsExternalDiscovery: true`

The provider should also expose a Codex-specific discovery root equivalent to Claude's `getProjectsRoot()`.

### Shared scanner contract

The existing external discovery architecture should remain provider-driven rather than hardcoded for Claude. Codex should plug into the same scanner framework with its own:

- projects root
- transcript file matcher
- metadata extractor
- workspace classification rules

### Dismissal and stale cleanup

Codex external sessions should reuse the same high-level protections already present for Claude:

- dismissal cooldown after UI close
- stale cleanup when the underlying transcript disappears
- protection against duplicate adoption

## Testing Strategy

### Unit tests

Add focused tests for Codex transcript discovery that verify:

- root session metadata extraction
- child-session metadata extraction
- workspace filtering from `cwd`
- dismissal cooldown behavior
- duplicate suppression

### Extension integration tests

Verify that:

- Codex external scanning starts when external discovery is enabled
- Codex and Claude discovery can coexist
- `supportsExternalDiscovery` and provider registration behave correctly

### End-to-end tests

Add e2e coverage for:

- an external root Codex session appearing in the current workspace
- `Watch All Sessions` surfacing a Codex session from another workspace
- closing an external Codex session only detaches it from Pixel Agents
- best-effort subagent appearance from pre-existing transcript metadata

## Risks

### Transcript format drift

This design depends on `session_meta` and current Codex rollout transcript structure. If Codex changes that structure, metadata extraction may need to be updated.

### Best-effort subagent ambiguity

Some child sessions may not be attachable if the parent relationship cannot be resolved from the available data. This is acceptable for v1, but it must fail safely rather than creating incorrect links.

### Cross-provider regression

The new scanner logic must not regress Claude attach behavior or introduce duplicate agents when both providers are active.

## Success Criteria

This feature is complete when all of the following are true:

- opening Pixel Agents while Codex sessions already run in terminals shows those sessions in the office
- the default scope is the current workspace only
- `Watch All Sessions` expands visibility across workspaces
- external Codex close behavior matches Claude detach-only semantics
- best-effort Codex subagent attach works when the transcript exposes a valid parent-child relationship
- Windows works without Codex hooks
- Claude behavior remains unchanged
