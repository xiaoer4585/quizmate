// 桌面端共享 API 客户端 - 按运行平台注入客户端标识
export * from '../apiClient';
import { createDesktopApiClient } from '../apiClient';

const clientPlatform = process.platform === 'darwin' ? 'darwin-desktop' : 'win32-desktop';

const client = createDesktopApiClient(clientPlatform);

export const postActionEnvelope = client.postActionEnvelope;
export const postAction = client.postAction;
