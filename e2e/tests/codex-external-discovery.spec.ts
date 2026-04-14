import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

import { launchVSCode, waitForWorkbench } from '../helpers/launch';
import { getPixelAgentsFrame, openPixelAgentsPanel } from '../helpers/webview';

async function openDebugView(frame: import('@playwright/test').Frame): Promise<void> {
  await frame.getByRole('button', { name: 'Settings' }).click();
  await frame.getByRole('button', { name: 'Debug View' }).click();
  await frame
    .locator('div.fixed')
    .filter({ has: frame.getByText('Settings') })
    .getByRole('button', { name: /^x$/ })
    .click();
  await expect(frame.getByRole('heading', { name: 'Debug View' })).toBeVisible({ timeout: 15_000 });
}

test('external Codex root session appears in the current workspace', async ({}, testInfo) => {
  const session = await launchVSCode(testInfo.title);
  const { window } = session;

  test.setTimeout(120_000);

  try {
    await waitForWorkbench(window);
    await openPixelAgentsPanel(window);

    const frame = await getPixelAgentsFrame(window);
    await openDebugView(frame);

    await expect(frame.getByText(/Agent #\d+/)).toBeVisible({ timeout: 15_000 });
    await expect(frame.getByText(/root-current-session|root-current\.jsonl/)).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await session.cleanup();
  }
});

test('Watch All Sessions reveals an external Codex session from another workspace', async ({}, testInfo) => {
  const session = await launchVSCode(testInfo.title);
  const { window } = session;

  test.setTimeout(120_000);

  try {
    await waitForWorkbench(window);
    await openPixelAgentsPanel(window);

    const frame = await getPixelAgentsFrame(window);
    await openDebugView(frame);
    await expect(frame.getByText(/Agent #\d+/)).toHaveCount(0, { timeout: 5_000 });

    await frame.getByRole('button', { name: 'Settings' }).click();
    await frame.getByRole('button', { name: 'Watch All Sessions' }).click();
    await frame
      .locator('div.fixed')
      .filter({ has: frame.getByText('Settings') })
      .getByRole('button', { name: /^x$/ })
      .click();

    await expect(frame.getByText(/Agent #\d+/)).toBeVisible({ timeout: 15_000 });
    await expect(frame.getByText(/root-global-session|root-global\.jsonl/)).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await session.cleanup();
  }
});

test('closing an external Codex session only detaches it from Pixel Agents', async ({}, testInfo) => {
  const session = await launchVSCode(testInfo.title);
  const { window, tmpHome } = session;

  test.setTimeout(120_000);

  const transcriptPath = path.join(
    tmpHome,
    '.codex',
    'sessions',
    '2026',
    '04',
    '14',
    'rollout-2026-04-14T09-46-49-root-current.jsonl',
  );

  try {
    await waitForWorkbench(window);
    await openPixelAgentsPanel(window);

    const frame = await getPixelAgentsFrame(window);
    await openDebugView(frame);

    const firstCard = frame
      .locator('div.rounded-none')
      .filter({ has: frame.getByText(/Agent #\d+/) })
      .first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.locator('button[title="Close agent"]').click();

    await expect(frame.getByText(/Agent #\d+/)).toHaveCount(0, { timeout: 15_000 });
    expect(fs.existsSync(transcriptPath)).toBe(true);
  } finally {
    await session.cleanup();
  }
});

test('external Codex child session appears as a best-effort subagent', async ({}, testInfo) => {
  const session = await launchVSCode(testInfo.title);
  const { window } = session;

  test.setTimeout(120_000);

  try {
    await waitForWorkbench(window);
    await openPixelAgentsPanel(window);

    const frame = await getPixelAgentsFrame(window);
    await openDebugView(frame);

    await expect(frame.getByText(/Agent #\d+/)).toBeVisible({ timeout: 15_000 });
    await expect(frame.getByText('External subagent')).toBeVisible({ timeout: 15_000 });
    await expect(frame.getByText('Subtask: Mill')).toBeVisible({ timeout: 15_000 });
  } finally {
    await session.cleanup();
  }
});
