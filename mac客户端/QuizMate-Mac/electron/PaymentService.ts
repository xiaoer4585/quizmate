import { postAction } from './apiClient';

export interface CreditOrder {
  outTradeNo: string;
  status: string;
  viewStatus?: 'pending' | 'paid' | 'expired' | 'closed';
  payUrl?: string;
  qrCode?: string;
  qrDataUrl?: string;
  expiresAt?: string;
  packageName?: string;
  totalCredits?: number;
}

export interface CreditOrderResult {
  order: CreditOrder;
  account?: { credits?: number };
  creditedCredits?: number;
  message?: string;
}

export async function createCreditOrder(
  apiEndpoint: string,
  accountToken: string,
  packageId: string,
  method: 'alipay' | 'wechat'
): Promise<CreditOrder> {
  return postAction<CreditOrder>(
    apiEndpoint,
    'createCreditOrder',
    { accountToken, packageId, method, device: 'mac' },
    { timeoutMs: 90000 }
  );
}

export async function queryCreditOrder(
  apiEndpoint: string,
  accountToken: string,
  outTradeNo: string
): Promise<CreditOrderResult> {
  return postAction<CreditOrderResult>(
    apiEndpoint,
    'queryCreditOrder',
    { accountToken, outTradeNo },
    { timeoutMs: 30000 }
  );
}
