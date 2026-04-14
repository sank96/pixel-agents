import * as fs from 'fs';
import * as path from 'path';

import type { ExternalSessionDescriptor } from '../../../../src/providers/providerAdapter.js';

function isRolloutTranscript(filePath: string): boolean {
  return path.basename(filePath).startsWith('rollout-') && filePath.endsWith('.jsonl');
}

function walkRolloutFiles(rootDir: string, results: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkRolloutFiles(fullPath, results);
      continue;
    }
    if (entry.isFile() && isRolloutTranscript(fullPath)) {
      results.push(fullPath);
    }
  }
}

export function listCodexRolloutFiles(rootDir: string): string[] {
  const results: string[] = [];
  walkRolloutFiles(rootDir, results);
  return results;
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(line) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

export function parseCodexExternalSession(
  transcriptPath: string,
): ExternalSessionDescriptor | null {
  let contents: string;
  try {
    contents = fs.readFileSync(transcriptPath, 'utf8');
  } catch {
    return null;
  }

  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const record = parseJsonLine(line);
    if (!record || record.type !== 'session_meta') continue;

    const payload =
      record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
        ? (record.payload as Record<string, unknown>)
        : undefined;
    if (!payload) return null;

    const sessionId = getString(payload, 'id');
    if (!sessionId) return null;

    const cwd = getString(payload, 'cwd');
    const source =
      payload.source && typeof payload.source === 'object' && !Array.isArray(payload.source)
        ? (payload.source as Record<string, unknown>)
        : undefined;
    const subagent =
      source?.subagent && typeof source.subagent === 'object' && !Array.isArray(source.subagent)
        ? (source.subagent as Record<string, unknown>)
        : undefined;
    const threadSpawn =
      subagent?.thread_spawn &&
      typeof subagent.thread_spawn === 'object' &&
      !Array.isArray(subagent.thread_spawn)
        ? (subagent.thread_spawn as Record<string, unknown>)
        : undefined;
    const parentThreadId = getString(threadSpawn ?? {}, 'parent_thread_id');
    const label =
      getString(payload, 'agent_nickname') ||
      getString(payload, 'agent_role') ||
      (parentThreadId ? 'Subagent' : undefined);

    return {
      providerId: 'codex',
      sessionId,
      transcriptPath,
      projectDir: path.dirname(transcriptPath),
      cwd,
      kind: parentThreadId ? 'child' : 'root',
      parentThreadId,
      label,
    };
  }

  return null;
}
