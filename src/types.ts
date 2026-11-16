export type AppRoute =
  | 'login'
  | 'register'
  | 'forgot-password'
  | 'dashboard'
  | 'plans'
  | 'tasks'
  | 'watch'
  | 'rewards'
  | 'wallet'
  | 'deposit'
  | 'transactions'
  | 'withdraw'
  | 'referral'
  | 'notifications'
  | 'profile'
  | 'settings'
  | 'about'
  | 'contact'
  | 'privacy'
  | 'terms'
  | 'admin';

export type WithdrawalMethod = 'easypaisa' | 'jazzcash' | 'bank_transfer';

export interface PayoutPreferences {
  defaultMethod: WithdrawalMethod;
  accountTitle: string;
  accountNumber: string;
  bankName: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  authProvider: 'email' | 'google_demo';
  emailVerified: boolean;
  role: 'user' | 'admin';
  isOwner?: boolean;
  status: 'active' | 'blocked';
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
}

export interface Wallet {
  userId: string;
  availableBalancePKR: number;
  pendingBalancePKR: number;
  totalEarnedPKR: number;
  dailyEarnedPKR: number;
  dailyEarnedDate: string;
  referralEarnedPKR: number;
  totalWithdrawnPKR: number;
  totalDepositedPKR?: number;
  updatedAt: string;
}

export interface Plan {
  id: string;
  name: string;
  tier:
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

export interface Campaign {
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
  status: 'active' | 'paused' | 'completed';
  isDemo: boolean;
  createdAt: string;
}

export interface Task {
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

export interface TaskItem {
  task: Task;
  campaign: Campaign;
  effectiveRewardPKR: number;
  todaySubmissions: number;
  canComplete: boolean;
  remainingBudget: number;
}

export interface TaskCompletion {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  taskId: string;
  campaignId: string;
  title: string;
  rewardAmountPKR: number;
  status: 'pending' | 'approved' | 'rejected';
  verificationNonce: string;
  watchedSeconds: number;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  isDemo: boolean;
}

export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
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

export interface Transaction {
  id: string;
  userId: string;
  type:
    | 'task_reward'
    | 'referral_bonus'
    | 'register_bonus'
    | 'withdrawal'
    | 'withdrawal_refund'
    | 'plan_upgrade'
    | 'deposit';
  amountPKR: number;
  status: 'pending' | 'completed' | 'rejected';
  description: string;
  referenceId: string;
  createdAt: string;
  isDemo: boolean;
}

export interface Withdrawal {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  method: 'easypaisa' | 'jazzcash' | 'bank_transfer';
  accountTitle: string;
  accountNumber: string;
  bankName: string;
  amountPKR: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  adminNote: string;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
}

export interface Referral {
  id: string;
  referrerId: string;
  referredUserId: string;
  referredUserName: string;
  referredUserEmail: string;
  status: 'registered' | 'qualified' | 'flagged';
  rewardAmountPKR: number;
  ipHash: string;
  createdAt: string;
  isDemo: boolean;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  category: 'reward' | 'withdrawal' | 'system' | 'admin';
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
