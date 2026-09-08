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

export interface CompanionState {
  workspace: 'pc' | 'mobile';
  transitioning: boolean;
  connected: boolean;
  listening: boolean;
  capturing: boolean;
  pending: number;
  serviceUrl?: string;
  phoneUrl?: string;
  code?: string;
  qr?: string;
  expiresAt?: number;
  error?: string;
}
