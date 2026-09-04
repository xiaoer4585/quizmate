import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboardSource = readFileSync(new URL('../../src/pages/Dashboard.tsx', import.meta.url), 'utf8');
const extensionSource = readFileSync(new URL('../../src/pages/Extension.tsx', import.meta.url), 'utf8');
const ipcSource = readFileSync(new URL('../../electron/ipcHandlers.ts', import.meta.url), 'utf8');
const preloadSource = readFileSync(new URL('../../electron/preload.ts', import.meta.url), 'utf8');

describe('desktop entry points', () => {
  it('opens the same in-client recharge modal from the dashboard and header', () => {
    expect(dashboardSource).toContain("window.dispatchEvent(new CustomEvent('quizmate:open-recharge'))");
    expect(dashboardSource).not.toContain('api.system.openRecharge()');
  });

  it('opens the official website download section instead of downloading an extension in the client', () => {
    expect(extensionSource).toContain("api.system.openExternal('https://www.quizmate.cn/download.html#ai-career-tools')");
    expect(extensionSource).not.toContain('api.extension.downloadLatest');
    expect(extensionSource).not.toMatch(/input-Resume-Autofill[^'\"]*\.zip/i);
    expect(ipcSource).not.toContain("ipcMain.handle('extension:downloadLatest'");
    expect(preloadSource).not.toContain('downloadLatest');
  });
});
