export * from '../../../desktop-core/apiClient';
import { createDesktopApiClient } from '../../../desktop-core/apiClient';

const client = createDesktopApiClient('darwin-desktop');

export const postActionEnvelope = client.postActionEnvelope;
export const postAction = client.postAction;
