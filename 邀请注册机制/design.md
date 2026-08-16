# 邀请注册机制设计方案

> 版本：2.1.0  |  分支：feature/referral-and-agent-system  |  日期：2026-07-27

## 一、核心目标

通过邀请机制让产品在特定人群（考生群体）中完成自传播：
- 邀请新用户注册，双方各得 20 积分（被邀请人首次成功使用后到账）
- 被邀请用户充值，邀请人获得 20% 提成（现金返现）
- 用户可在官网查看邀请明细、提现申请、打款记录
- 管理后台可查看邀请数据、处理提现、标记已返现（清零）

## 二、奖励规则

### 2.1 注册奖励
- 双方各 20 积分
- **被邀请人首次成功使用 AI 后才到账**（防批量注册薅羊毛）
- 同一设备注册的账号不计入邀请奖励
- 每用户邀请上限 50 人（超过不再发注册奖励）

### 2.2 充值提成
- 统一 20% 提成（暂不阶梯化）
- 以**现金**形式返现（非积分）
- 被邀请人充值成功后，自动生成待结算提成记录
- 邀请人提交提现申请（含支付宝账号），客服打款后标记已返现

## 三、数据模型

### 3.1 accounts 表扩展
```sql
ALTER TABLE accounts ADD COLUMN invite_code text UNIQUE;
ALTER TABLE accounts ADD COLUMN referred_by uuid REFERENCES accounts(account_id);
```

### 3.2 referrals（邀请关系表）
```sql
CREATE TABLE referrals (
  referral_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_account_id uuid NOT NULL REFERENCES accounts(account_id),
  invitee_account_id uuid NOT NULL REFERENCES accounts(account_id),
  invite_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','registered','activated','rewarded','device_blocked')),
  device_id text,
  registered_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

状态流转：
- `pending`：邀请码已生成但未注册
- `registered`：被邀请人已注册（未首次使用）
- `activated`：被邀请人已首次成功使用
- `rewarded`：注册奖励已发放
- `device_blocked`：同一设备注册，不计入奖励

### 3.3 referral_commissions（充值提成记录表）
```sql
CREATE TABLE referral_commissions (
  commission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id uuid REFERENCES referrals(referral_id),
  inviter_account_id uuid NOT NULL REFERENCES accounts(account_id),
  invitee_account_id uuid NOT NULL REFERENCES accounts(account_id),
  order_no text NOT NULL REFERENCES orders(out_trade_no),
  recharge_amount numeric(12,2) NOT NULL,
  commission_rate numeric(5,4) NOT NULL DEFAULT 0.20,
  commission_amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','cleared')),
  cleared_at timestamptz,
  cleared_by text,
  cleared_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 3.4 withdrawal_requests（提现申请表）
```sql
CREATE TABLE withdrawal_requests (
  withdrawal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(account_id),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  alipay_account text NOT NULL,
  alipay_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','paid','rejected')),
  commission_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  paid_trade_no text,
  paid_at timestamptz,
  paid_by text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### 3.5 referral_risk_flags（风险标记表）
```sql
CREATE TABLE referral_risk_flags (
  flag_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(account_id),
  referral_id uuid REFERENCES referrals(referral_id),
  risk_type text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

## 四、API 设计

### 4.1 用户端
| Action | 说明 |
|--------|------|
| `getReferralOverview` | 获取邀请总览（邀请码、统计、待结算金额） |
| `getReferralList` | 获取邀请明细列表（邮箱、状态、充值、提成） |
| `getCommissionRecords` | 获取提成记录列表 |
| `requestWithdrawal` | 提交提现申请（支付宝账号+金额） |
| `getWithdrawalRecords` | 获取提现记录（含打款订单号） |
| `generateInviteCode` | 生成/获取自己的邀请码 |
| `getInviteShareContent` | 获取邀请分享文案和海报数据 |

### 4.2 管理后台
| Action | 说明 |
|--------|------|
| `adminListReferrals` | 查看所有邀请关系 |
| `adminListCommissions` | 查看所有提成记录（含待结算/已结算） |
| `adminListWithdrawals` | 查看提现申请 |
| `adminApproveWithdrawal` | 审核通过提现申请 |
| `adminMarkWithdrawalPaid` | 标记已打款（填入打款订单号） |
| `adminRejectWithdrawal` | 驳回提现申请 |
| `adminClearCommissions` | 批量清零提成（标记已返现） |
| `adminListRiskFlags` | 查看风险标记 |
| `adminReferralSummary` | 邀请推广数据总览 |

## 五、核心流程

### 5.1 邀请注册流程
```
用户A生成邀请码 -> 分享链接/海报
-> 用户B打开链接，注册表单自动带入邀请码
-> 注册成功，创建 referral(status='registered', device_id=xxx)
-> 检查 device_id 是否与邀请人相同 -> 相同则 status='device_blocked'
-> 用户B首次成功调用AI -> referral.status='activated'
-> 双方各加20积分 -> referral.status='rewarded'
```

### 5.2 充值提成流程
```
用户B充值成功 -> settlePaymentCallback 结算积分
-> 检查 userB.referred_by 是否存在
-> 存在且 referral.status='rewarded'：创建 referral_commission(status='pending')
-> 无：跳过
```

### 5.3 提现流程
```
用户A查看待结算金额 -> 输入支付宝账号+姓名 -> 提交提现申请
-> withdrawal_requests(status='pending')，关联的 commissions 锁定
-> 管理员后台查看 -> 审核通过(status='approved')
-> 支付宝打款 -> 填入打款订单号 -> status='paid'
-> 关联的 commissions.status='cleared'
-> 用户A界面看到打款订单号和时间
```

## 六、防刷策略

| 风险 | 措施 |
|------|------|
| 批量注册薅积分 | 首次成功使用才发积分 |
| 同设备多账号 | 同设备注册标记 device_blocked |
| 短时间大量注册 | 同 IP 10分钟内注册>5 次标记风险 |
| 自邀请循环 | 同设备不计入 |
| 刷充值提成 | 自充自亏80%，天然防御 |

## 七、传播形式

- 邀请链接：`https://www.quizmate.vip/#credits?ref=邀请码`
- 文案分享：包含链接的文字
- 海报分享：包含二维码的图片，扫码跳转注册链接

## 八、界面分布

- **官网**：邀请明细面板、提现申请、打款记录（主要展示）
- **客户端**：邀请转发入口（生成链接/海报）+ 跳转官网查看
- **管理后台**：邀请数据、提成记录、提现审核、清零操作
