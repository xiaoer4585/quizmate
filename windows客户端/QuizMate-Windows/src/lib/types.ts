// 共享类型（主进程与渲染层通用）
export interface UserInfo {
  email: string;
  nickname?: string;
  credits?: number;
  vipLevel?: number;
  [k: string]: unknown;
}
