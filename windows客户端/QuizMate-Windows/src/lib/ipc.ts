// 渲染层 IPC 桥接 - 封装 window.api 调用与 React Query hooks
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

declare global {
  interface Window {
    api: any;
  }
}

export const api = window.api;

// ===== 客户端版本更新检测 =====
export interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  releaseNotes?: unknown;
  percent?: number;
  transferred?: number;
  total?: number;
  message?: string;
  currentVersion: string;
}

/** 订阅客户端更新状态（主进程主动推送 + 初始拉取） */
export const useUpdateStatus = () => {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  useEffect(() => {
    api.update.getStatus().then(setStatus).catch(() => {});
    const off = api.update.onStatus((s: UpdateStatus) => setStatus(s));
    return off;
  }, []);
  return status;
};

// ===== 认证 hooks =====
export const useProfile = () =>
  useQuery({ queryKey: ['profile'], queryFn: () => api.auth.getProfile() });

export const useLogin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => api.auth.login(email, password),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
};

// ===== 配置 =====
export const useConfig = () => useQuery({ queryKey: ['config'], queryFn: () => api.config.get() });
export const useClientSettings = () => useQuery({ queryKey: ['clientSettings'], queryFn: () => api.config.getClientSettings() });

// ===== 充值弹窗事件 =====
export const onShowRechargeModal = (cb: () => void) => api.system.onShowRechargeModal(cb);
