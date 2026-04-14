import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  listCodexRolloutFiles,
  parseCodexExternalSession,
} from '../src/providers/codex/codexExternalDiscovery.js';

function writeJsonl(filePath: string, lines: unknown[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.map((line) => JSON.stringify(line)).join('\n') + '\n', 'utf8');
}

describe('codexExternalDiscovery', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('lists rollout transcripts recursively under the Codex sessions root', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-codex-discovery-'));
    tempDirs.push(rootDir);

    const nestedRoot = path.join(rootDir, '2026', '04', '14');
    writeJsonl(path.join(nestedRoot, 'rollout-2026-04-14T11-10-50-root.jsonl'), []);
    writeJsonl(path.join(nestedRoot, 'rollout-2026-04-14T11-46-38-child.jsonl'), []);
    writeJsonl(path.join(nestedRoot, 'not-a-rollout.jsonl'), []);

    expect(
      listCodexRolloutFiles(rootDir)
        .map((filePath) => path.basename(filePath))
        .sort(),
    ).toEqual([
      'rollout-2026-04-14T11-10-50-root.jsonl',
      'rollout-2026-04-14T11-46-38-child.jsonl',
    ]);
  });

  it('parses a root rollout transcript', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-codex-discovery-'));
    tempDirs.push(rootDir);

    const transcriptPath = path.join(
      rootDir,
      '2026',
      '04',
      '14',
      'rollout-2026-04-14T11-10-50-019d8b41-fa15-75a3-854a-242a4f58db7f.jsonl',
    );
    writeJsonl(transcriptPath, [
      {
        timestamp: '2026-04-14T09:10:50.000Z',
        type: 'session_meta',
        payload: {
          id: '019d8b41-fa15-75a3-854a-242a4f58db7f',
          cwd: 'C:\\Users\\m.sanchioni\\Developer\\workspaces\\pixel-agents',
          originator: 'codex-tui',
          agent_role: 'default',
        },
      },
    ]);

    expect(parseCodexExternalSession(transcriptPath)).toMatchObject({
      providerId: 'codex',
      kind: 'root',
      sessionId: '019d8b41-fa15-75a3-854a-242a4f58db7f',
      cwd: 'C:\\Users\\m.sanchioni\\Developer\\workspaces\\pixel-agents',
      projectDir: path.dirname(transcriptPath),
      transcriptPath,
    });
  });

  it('parses a child rollout transcript with parent thread metadata', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-codex-discovery-'));
    tempDirs.push(rootDir);

    const transcriptPath = path.join(
      rootDir,
      '2026',
      '04',
      '14',
      'rollout-2026-04-14T11-46-38-019d8b62-c1d4-70f3-ab70-e8eec01c5f65.jsonl',
    );
    writeJsonl(transcriptPath, [
      {
        timestamp: '2026-04-14T09:46:49.696Z',
        type: 'session_meta',
        payload: {
          id: '019d8b62-c1d4-70f3-ab70-e8eec01c5f65',
          cwd: 'C:\\Users\\m.sanchioni\\Developer\\workspaces\\skill-install-plus-plus',
          source: {
            subagent: {
              thread_spawn: {
                parent_thread_id: '019d8b41-fa15-75a3-854a-242a4f58db7f',
                depth: 1,
              },
            },
          },
          agent_nickname: 'Mill',
          agent_role: 'worker',
        },
      },
    ]);

    expect(parseCodexExternalSession(transcriptPath)).toMatchObject({
      providerId: 'codex',
      kind: 'child',
      sessionId: '019d8b62-c1d4-70f3-ab70-e8eec01c5f65',
      parentThreadId: '019d8b41-fa15-75a3-854a-242a4f58db7f',
      label: 'Mill',
      cwd: 'C:\\Users\\m.sanchioni\\Developer\\workspaces\\skill-install-plus-plus',
    });
  });
});
