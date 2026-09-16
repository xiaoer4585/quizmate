export interface CompanionCard {
  id: string;
  kind: 'exam' | 'interview';
  question: string;
  answer: string;
  explanation: string;
  status: 'pending' | 'done' | 'error';
  createdAt: number;
  error?: string;
}

export type CompanionExamTriggerMode = 'shortcut' | 'transparent-click';

export interface TransparentCaptureBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CompanionState {
  workspace: 'pc' | 'mobile';
  transitioning: boolean;
  connected: boolean;
  listening: boolean;
  capturing: boolean;
  pending: number;
  audioMode?: 'demo' | 'formal';
  serviceUrl?: string;
  phoneUrl?: string;
  code?: string;
  qr?: string;
  expiresAt?: number;
  error?: string;
  /** 双机笔试的截图触发方式；旧客户端缺少该字段时按 shortcut 兼容。 */
  captureMode?: CompanionExamTriggerMode;
  transparentCaptureEnabled?: boolean;
  transparentCaptureVisible?: boolean;
  transparentCaptureConfiguring?: boolean;
  transparentCaptureScale?: number;
  transparentCaptureBounds?: TransparentCaptureBounds;
}
