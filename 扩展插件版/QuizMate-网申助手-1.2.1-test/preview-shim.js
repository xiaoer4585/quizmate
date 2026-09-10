// 仅用于直接打开 HTML 做界面预览；扩展环境已有 chrome API 时不会执行。
if (typeof chrome === 'undefined' || !chrome.storage?.local || !chrome.runtime?.sendMessage) {
  const listeners = [];
  const runtimeListeners = [];
  const storage = {
    async get(keys) {
      const all = JSON.parse(localStorage.getItem('qmai-preview-storage') || '{}');
      if (keys == null) return all;
      const list = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.map((key) => [key, all[key]]));
    },
    async set(items) {
      const before = JSON.parse(localStorage.getItem('qmai-preview-storage') || '{}');
      const after = { ...before, ...items };
      localStorage.setItem('qmai-preview-storage', JSON.stringify(after));
      const changes = Object.fromEntries(Object.keys(items).map((key) => [key, { oldValue: before[key], newValue: items[key] }]));
      listeners.forEach((listener) => listener(changes, 'local'));
    }
  };
  globalThis.chrome = {
    storage: { local: storage, onChanged: { addListener(listener) { listeners.push(listener); } } },
    runtime: {
      async sendMessage(message) {
        if (message.type === 'QMAI_SCAN_FORM') return { ok: true, data: { total: 12, platforms: ['界面预览'], fields: [{ label: '姓名', type: 'text' }, { label: '毕业院校', type: 'text' }, { label: '学历', type: 'select' }] } };
        if (message.type === 'QMAI_START_FILL') return { ok: true, data: { detected: 12, filled: 9, unfilled: 3, errors: [] } };
        if (message.type === 'QMAI_TEST_CONNECTION') return { ok: true, data: { mode: '界面预览' } };
        return { ok: true, data: {} };
      },
      onMessage: {
        addListener(listener) { runtimeListeners.push(listener); },
        removeListener(listener) {
          const index = runtimeListeners.indexOf(listener);
          if (index >= 0) runtimeListeners.splice(index, 1);
        }
      }
    }
  };
  globalThis.__qmaiPreviewRuntimeListeners = runtimeListeners;
}
