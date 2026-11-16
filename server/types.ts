export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'blocked';
export type PlanTier =
  | 'free'
  | 'premium'
  | 'vip'
  | 'starter'
  | 'basic'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond'
  | 'elite'
  | 'royal'
  | 'imperial';
export type CampaignStatus = 'active' | 'paused' | 'completed';
export type CompletionStatus = 'pending' | 'approved' | 'rejected';
export type WithdrawalMethod = 'easypaisa' | 'jazzcash' | 'bank_transfer';
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'paid';
export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type TransactionType =
  | 'task_reward'
  | 'referral_bonus'
  | 'register_bonus'
  | 'withdrawal'
  | 'withdrawal_refund'
  | 'plan_upgrade'
  | 'deposit';
export type TransactionStatus = 'pending' | 'completed' | 'rejected';
export type ReferralStatus = 'registered' | 'qualified' | 'flagged';
export type NotificationCategory = 'reward' | 'withdrawal' | 'system' | 'admin';

export interface PayoutPreferences {
  defaultMethod: WithdrawalMethod;
  accountTitle: string;
  accountNumber: string;
  bankName: string;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  authProvider: 'email' | 'google_demo';
  emailVerified: boolean;
  verificationCode: string | null;
  resetCode: string | null;
  resetExpiresAt: string | null;
  role: UserRole;
  status: UserStatus;
  planId: string;
  referralCode: string;
  referredBy: string | null;
  phone: string;
  country: string;
  payoutPreferences: PayoutPreferences;
  themePreference: 'light' | 'dark';
  emailAlertsEnabled: boolean;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminRecord {
  id: string;
  userId: string;
  email: string;
  permissions: string[];
  createdAt: string;
}

export interface PlanRecord {
  id: string;
  name: string;
  tier: PlanTier;
  targetAudience: string;
  monthlyPricePKR: number;
  billingLabel: string;
  dailyTaskLimit: number;
  perAdProfitPKR: number;
  dailyProfitPKR: number;
  totalProfitPKR: number;
  durationDays: number;
  payoutPriority: string;
  depositRequired: boolean;
  features: string[];
  active: boolean;
  isDemo: boolean;
}

export interface CampaignRecord {
  id: string;
  title: string;
  sponsorName: string;
  category: string;
  providerName: string;
  complianceNote: string;
  description: string;
  imageUrl: string;
  sponsorVideoUrl: string;
  rewardAmountPKR: number;
  totalBudgetPKR: number;
  spentBudgetPKR: number;
  dailyCap: number;
  durationSeconds: number;
  status: CampaignStatus;
  isDemo: boolean;
  createdAt: string;
}

export interface TaskRecord {
  id: string;
  campaignId: string;
  title: string;
  instructions: string;
  verificationMethod: 'server_callback';
  rewardAmountPKR: number;
  estimatedSeconds: number;
  active: boolean;
  isDemo: boolean;
}

export interface TaskCompletionRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  taskId: string;
  campaignId: string;
  title: string;
  rewardAmountPKR: number;
  status: CompletionStatus;
  verificationNonce: string;
  watchedSeconds: number;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  isDemo: boolean;
}

export interface WalletRecord {
  userId: string;
  availableBalancePKR: number;
  pendingBalancePKR: number;
  totalEarnedPKR: number;
  dailyEarnedPKR: number;
  dailyEarnedDate: string;
  referralEarnedPKR: number;
  totalWithdrawnPKR: number;
  totalDepositedPKR: number;
  updatedAt: string;
}

export type DepositMethod = 'Easypaisa' | 'JazzCash';

export interface DepositReceiver {
  method: DepositMethod;
  accountNumber: string;
  accountHolderName: string;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  method: DepositMethod;
  receiverAccountNumber: string;
  receiverAccountHolder: string;
  amountPKR: number;
  transactionId: string;
  screenshotFileName: string;
  screenshotMimeType: string;
  note: string;
  status: PaymentStatus;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
}

export interface TransactionRecord {
  id: string;
  userId: string;
  type: TransactionType;
  amountPKR: number;
  status: TransactionStatus;
  description: string;
  referenceId: string;
  createdAt: string;
  isDemo: boolean;
}

export interface WithdrawalRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  method: WithdrawalMethod;
  accountTitle: string;
  accountNumber: string;
  bankName: string;
  amountPKR: number;
  status: WithdrawalStatus;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
}

export interface ReferralRecord {
  id: string;
  referrerId: string;
  referredUserId: string;
  referredUserName: string;
  referredUserEmail: string;
  status: ReferralStatus;
  rewardAmountPKR: number;
  ipHash: string;
  createdAt: string;
  isDemo: boolean;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  category: NotificationCategory;
  read: boolean;
  createdAt: string;
}

export interface PlatformSettings {
  minWithdrawalPKR: number;
  referralBonusPKR: number;
  requireEmailVerificationForWithdraw: boolean;
  antiBotChallengeEnabled: boolean;
  platformNotice: string;
}

export interface ContactMessageRecord {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
}

export interface TaskSessionChallenge {
  nonce: string;
  userId: string;
  taskId: string;
  campaignId: string;
  requiredSeconds: number;
  challengePrompt: string;
  expectedAnswer: number;
  issuedAt: number;
  used: boolean;
}

export interface DatabaseSchema {
  users: UserRecord[];
  admins: AdminRecord[];
  plans: PlanRecord[];
  campaigns: CampaignRecord[];
  tasks: TaskRecord[];
  task_completions: TaskCompletionRecord[];
  wallets: WalletRecord[];
  transactions: TransactionRecord[];
  withdrawals: WithdrawalRecord[];
  payments: PaymentRecord[];
  referrals: ReferralRecord[];
  notifications: NotificationRecord[];
  settings: PlatformSettings;
  contact_messages: ContactMessageRecord[];
}
