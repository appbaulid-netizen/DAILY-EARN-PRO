import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  CheckCircle2,
  CreditCard,
  MailCheck,
  PlayCircle,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { apiRequest, formatDateTime, formatPKR } from '../lib/api';
import type {
  AppNotification,
  AppRoute,
  AuthUser,
  PaymentRecord,
  Plan,
  Transaction,
  Wallet,
} from '../types';

interface DashboardResponse {
  user: AuthUser;
  wallet: Wallet;
  plan: Plan;
  hasApprovedDeposit: boolean;
  latestPayment: PaymentRecord | null;
  stats: {
    totalBalancePKR: number;
    availableBalancePKR: number;
    pendingRewardsPKR: number;
    totalTasksCompleted: number;
    pendingTasksCount: number;
    tasksCompletedToday: number;
    dailyTaskLimit: number;
    dailyRewardsPKR: number;
    referralEarningsPKR: number;
    activeCampaignsCount: number;
  };
  recentTransactions: Transaction[];
  recentNotifications: AppNotification[];
  platformNotice: string;
}

interface MemberDashboardProps {
  onNavigate: (route: AppRoute) => void;
  onUserRefresh: (user: AuthUser) => void;
}

export function MemberDashboard({ onNavigate, onUserRefresh }: MemberDashboardProps) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [verifyCode, setVerifyCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [verifyHint, setVerifyHint] = useState<string | null>(() =>
    sessionStorage.getItem('asad_verify_hint')
  );

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<DashboardResponse>('/api/dashboard');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function handleVerifyEmail(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setVerifyMessage(null);
    try {
      const res = await apiRequest<{ user: AuthUser; message: string }>('/api/auth/verify-email', {
        method: 'POST',
        body: { code: verifyCode },
      });
      sessionStorage.removeItem('asad_verify_hint');
      setVerifyHint(null);
      setVerifyMessage(res.message);
      onUserRefresh(res.user);
      await loadDashboard();
    } catch (err) {
      setVerifyMessage(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResendCode() {
    try {
      const res = await apiRequest<{ message: string; verificationCodeHint?: string }>(
        '/api/auth/resend-verification',
        { method: 'POST' }
      );
      if (res.verificationCodeHint) {
        sessionStorage.setItem('asad_verify_hint', res.verificationCodeHint);
        setVerifyHint(res.verificationCodeHint);
      }
      setVerifyMessage(res.message);
    } catch (err) {
      setVerifyMessage(err instanceof Error ? err.message : 'Unable to resend code.');
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-28 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <p className="text-sm text-red-600 dark:text-red-400">{error || 'Unable to load data.'}</p>
        <button
          type="button"
          onClick={loadDashboard}
          className="mt-3 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  const { user, plan, stats, recentTransactions, recentNotifications, platformNotice } = data;

  return (
    <div className="space-y-6">
      {/* Platform Notice */}
      {platformNotice && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/30 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-700 dark:text-slate-300">
          <span>{platformNotice}</span>
          <span className="font-medium text-blue-700 dark:text-blue-400 whitespace-nowrap shrink-0">
            Active Tier: {plan.name}
          </span>
        </div>
      )}

      {/* Email Verification Prompt if Unverified */}
      {!user.emailVerified && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-semibold text-sm">
              <MailCheck className="h-4 w-4 shrink-0" />
              <span>Email verification required to unlock withdrawals</span>
            </div>
            <button
              type="button"
              onClick={handleResendCode}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline text-left sm:text-right"
            >
              Resend verification code
            </button>
          </div>
          {verifyHint && (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Sandbox verification code issued: <strong className="font-mono">{verifyHint}</strong>
            </p>
          )}
          <form onSubmit={handleVerifyEmail} className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              required
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder="Enter 6-digit code"
              className="h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono w-48"
            />
            <button
              type="submit"
              disabled={verifying}
              className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
            >
              {verifying ? 'Verifying...' : 'Verify Email'}
            </button>
            {verifyMessage && (
              <span className="text-xs text-slate-700 dark:text-slate-300">{verifyMessage}</span>
            )}
          </form>
        </div>
      )}

      {/* Hero Greeting + Primary Quick Actions */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Member Overview · {user.isDemo ? 'Demo Account' : 'Verified Member'} · {plan.name}
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back, {user.name}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Daily quota used: <span className="font-mono tabular-nums font-medium">{stats.tasksCompletedToday}/{stats.dailyTaskLimit}</span> tasks today · {stats.activeCampaignsCount} active sponsor campaigns available.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {user.isOwner && user.role === 'admin' && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap"
            >
              <ShieldCheck className="h-4 w-4 text-blue-400" />
              Owner Approvals (Approve / Reject)
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate(data.hasApprovedDeposit || user.isOwner ? 'tasks' : 'deposit')}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap"
          >
            <PlayCircle className="h-4 w-4" />
            {data.hasApprovedDeposit || user.isOwner
              ? 'Watch & Earn Tasks'
              : 'Deposit First to Open Ads'}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('deposit')}
            className="px-4 py-2.5 rounded-xl border border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-sm font-semibold whitespace-nowrap"
          >
            Deposit (Easypaisa / JazzCash)
          </button>
          <button
            type="button"
            onClick={() => onNavigate('withdraw')}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap"
          >
            <CreditCard className="h-4 w-4" />
            Request Withdrawal
          </button>
        </div>
      </div>

      {!data.hasApprovedDeposit && !user.isOwner && (
        <div className="rounded-2xl border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              Deposit Required Before Ads Unlock
            </p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {data.latestPayment?.status === 'PENDING'
                ? `Your ${data.latestPayment.method} deposit (${formatPKR(data.latestPayment.amountPKR)}) is PENDING verification.`
                : data.latestPayment?.status === 'REJECTED'
                  ? `Last deposit was REJECTED (${data.latestPayment.rejectionReason || 'Review failed'}). Submit a genuine payment to unlock ads.`
                  : 'Submit an Easypaisa or JazzCash deposit first. Once approved by the owner, Watch & Earn ads will open.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('deposit')}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap shrink-0"
          >
            Open Deposit Page
          </button>
        </div>
      )}

      {/* 6 Core Financial & Activity Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Balance</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatPKR(stats.totalBalancePKR)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Available + Pending verification
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Available Balance</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatPKR(stats.availableBalancePKR)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Ready for Easypaisa, JazzCash, or Bank
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Pending Rewards</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {formatPKR(stats.pendingRewardsPKR)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {stats.pendingTasksCount} completion(s) awaiting review
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Tasks Completed</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {stats.totalTasksCompleted}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Approved sponsor engagements
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Daily Rewards</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
            {formatPKR(stats.dailyRewardsPKR)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Approved earnings credited today
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Referral Earnings</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatPKR(stats.referralEarningsPKR)}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('referral')}
            className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            Invite code: <span className="font-mono">{user.referralCode}</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Lower Split: Recent Transactions + Profile & Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Transactions */}
        <section className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-bold">Recent Transactions</h2>
            <button
              type="button"
              onClick={() => onNavigate('transactions')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              View full history
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-sm text-slate-500 dark:text-slate-400">No ledger transactions yet.</p>
              <button
                type="button"
                onClick={() => onNavigate('tasks')}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white"
              >
                Explore Sponsor Tasks
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentTransactions.map((txn) => (
                <div key={txn.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {txn.description}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {formatDateTime(txn.createdAt)} · Status:{' '}
                      <span
                        className={
                          txn.status === 'completed'
                            ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                            : txn.status === 'pending'
                              ? 'text-amber-600 dark:text-amber-400 font-medium'
                              : 'text-red-600 dark:text-red-400 font-medium'
                        }
                      >
                        {txn.status}
                      </span>
                    </p>
                  </div>
                  <span
                    className={`font-mono text-sm font-semibold tabular-nums whitespace-nowrap ${
                      txn.amountPKR >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-900 dark:text-slate-200'
                    }`}
                  >
                    {txn.amountPKR >= 0 ? `+${formatPKR(txn.amountPKR)}` : formatPKR(txn.amountPKR)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right Column: Notifications + User Profile Snapshot */}
        <div className="lg:col-span-5 space-y-6">
          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h2 className="font-display text-base font-bold">Notifications</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('notifications')}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                All alerts
              </button>
            </div>
            {recentNotifications.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No recent alerts.</p>
            ) : (
              <div className="space-y-3">
                {recentNotifications.map((n) => (
                  <div
                    key={n.id}
                    className="pb-3 border-b last:border-b-0 last:pb-0 border-slate-100 dark:border-slate-800"
                  >
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {n.title}
                      {!n.read && ' · Unread'}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                      {n.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h2 className="font-display text-base font-bold">Account Snapshot</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Edit profile
              </button>
            </div>
            <div className="text-xs space-y-2 text-slate-600 dark:text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Email</span>
                <span className="font-medium">{user.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Email Status</span>
                <span className="inline-flex items-center gap-1 font-medium">
                  {user.emailVerified ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      Verified
                    </>
                  ) : (
                    'Pending Verification'
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Default Payout</span>
                <span className="font-medium capitalize">
                  {user.payoutPreferences.defaultMethod.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Active Plan</span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
                  {plan.name}
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
