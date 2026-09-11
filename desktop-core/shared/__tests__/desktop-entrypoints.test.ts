import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboardSource = readFileSync(new URL('../../src/pages/Dashboard.tsx', import.meta.url), 'utf8');
const mainLayoutSource = readFileSync(new URL('../../src/components/MainLayout.tsx', import.meta.url), 'utf8');
const mainProcessSource = readFileSync(new URL('../../electron/main.ts', import.meta.url), 'utf8');
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

  it('exposes companion entry points and initializes their IPC on both maintained desktop platforms', () => {
    expect(dashboardSource).toContain("{ to: '/companion', title: '双机协作笔面试'");
    expect(mainLayoutSource).toContain("{ to: '/companion', label: '双机协作笔面试'");
    expect(dashboardSource).not.toMatch(/!isMacPlatform\(\)[^\n]*\/companion/);
    expect(mainLayoutSource).not.toMatch(/!isMacPlatform\(\)[^\n]*\/companion/);
    expect(mainProcessSource).toContain('const SUPPORTS_COMPANION = supportsCompanionDesktopPlatform(process.platform)');
    expect(mainProcessSource).toContain('if (SUPPORTS_COMPANION) {');
    expect(mainProcessSource).toContain("ipcMain.handle('companion:workspace'");
    expect(mainProcessSource).not.toContain('此功能目前仅用于 Windows 测试版');
  });
});
