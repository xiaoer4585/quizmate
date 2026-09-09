import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { describe, expect, it } from 'vitest';
import { createConfigurationActions } from '../src/actions/configuration.js';
import type { Database } from '../src/db.js';
import type { RuntimeSetting, RuntimeSettingsStore } from '../src/services/runtime-settings.js';
import type { ActionDependencies } from '../src/types.js';

const db: Database = {
  async query<T extends QueryResultRow>(): Promise<QueryResult<T>> {
    return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
  },
  async connect(): Promise<PoolClient> { throw new Error('not used'); },
};

function harness(initial: RuntimeSetting = {}) {
  let stored = structuredClone(initial);
  const settings = {
    async get(key: string) {
      expect(key).toBe('input_extension_download');
      return structuredClone(stored);
    },
    async set(key: string, value: RuntimeSetting) {
      expect(key).toBe('input_extension_download');
      stored = structuredClone(value);
    },
  } as unknown as RuntimeSettingsStore;
  const deps = { db, settings, adminSecret: 'admin-test-secret' } as unknown as ActionDependencies;
  const actions = createConfigurationActions(deps);
  const context = { requestId: 'extension-download-test', clientIp: '127.0.0.1', db };
  return {
    get: () => actions.get('getInputExtensionDownload')!({}, context),
    set: (input: RuntimeSetting) => actions.get('adminSetInputExtensionDownload')!({ adminSecret: 'admin-test-secret', ...input }, context),
  };
}

describe('input extension dynamic download', () => {
  it('returns the current safe default without a client-side version constant', async () => {
    await expect(harness().get()).resolves.toMatchObject({
      version: '2026.9.9',
      fileName: 'QuizMate-网申助手-2026.9.9.zip',
      downloadUrl: 'https://www.quizmate.cn/downloads/QuizMate-%E7%BD%91%E7%94%B3%E5%8A%A9%E6%89%8B-2026.9.9.zip',
    });
  });

  it('returns a newly configured version on the next request', async () => {
    const api = harness();
    await api.set({ version: '3.2.0', fileName: 'input-Resume-Autofill-3.2.0.zip', downloadUrl: 'https://quizmate.cn/downloads/input-Resume-Autofill-3.2.0.zip' });
    await expect(api.get()).resolves.toMatchObject({ version: '3.2.0', downloadUrl: 'https://quizmate.cn/downloads/input-Resume-Autofill-3.2.0.zip' });
  });

  it('rejects non-HTTPS, off-domain, and non-ZIP download targets', async () => {
    await expect(harness({ downloadUrl: 'https://example.com/plugin.zip' }).get()).rejects.toMatchObject({ code: 'INVALID_EXTENSION_DOWNLOAD_URL' });
    await expect(harness({ downloadUrl: 'http://quizmate.cn/plugin.zip' }).get()).rejects.toMatchObject({ code: 'INVALID_EXTENSION_DOWNLOAD_URL' });
    await expect(harness({ downloadUrl: 'https://quizmate.cn/download.html' }).get()).rejects.toMatchObject({ code: 'INVALID_EXTENSION_DOWNLOAD_URL' });
  });
});
