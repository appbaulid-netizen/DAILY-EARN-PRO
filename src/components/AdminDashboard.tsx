import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  Plus,
  Send,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  apiRequest,
  fetchAuthorizedImageBlobUrl,
  formatDateTime,
  formatPKR,
} from '../lib/api';
import type {
  AuthUser,
  Campaign,
  PaymentRecord,
  Plan,
  PlatformSettings,
  Referral,
  TaskCompletion,
  Transaction,
  Wallet,
  Withdrawal,
} from '../types';

interface AdminOverviewData {
  stats: {
    totalUsers: number;
    activeUsers: number;
    blockedUsers: number;
    activeCampaigns: number;
    totalBudgetPKR: number;
    totalSpentPKR: number;
    totalPaidWithdrawalsPKR: number;
    pendingWithdrawalsCount: number;
    pendingCompletionsCount: number;
    pendingPaymentsCount: number;
    totalReferrals: number;
  };
  users: Array<AuthUser & { wallet: Wallet }>;
  plans: Plan[];
  campaigns: Campaign[];
  completions: TaskCompletion[];
  withdrawals: Withdrawal[];
  payments: PaymentRecord[];
  transactions: Transaction[];
  referrals: Referral[];
  settings: PlatformSettings;
  contactMessages: Array<{
    id: string;
    name: string;
    email: string;
    subject: string;
    message: string;
    createdAt: string;
  }>;
}

type AdminTab =
  | 'overview'
  | 'payments'
  | 'users'
  | 'completions'
  | 'withdrawals'
  | 'campaigns'
  | 'plans'
  | 'referrals'
  | 'settings';

export function AdminDashboard() {
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [tab, setTab] = useState<AdminTab>('payments');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Payment screenshot viewer & rejection modal state
  const [previewPayment, setPreviewPayment] = useState<PaymentRecord | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PaymentRecord | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [paymentBusyId, setPaymentBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    if (!previewPayment) {
      setPreviewBlobUrl(null);
      return;
    }
    fetchAuthorizedImageBlobUrl(`/api/payments/${previewPayment.id}/screenshot`)
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setPreviewBlobUrl(url);
      })
      .catch(() => {
        if (active) setPreviewBlobUrl(null);
      });
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [previewPayment]);

  // New Campaign form state
  const [cmpTitle, setCmpTitle] = useState('');
  const [cmpSponsor, setCmpSponsor] = useState('');
  const [cmpCategory, setCmpCategory] = useState('Direct Brand Sponsor');
  const [cmpDescription, setCmpDescription] = useState('');
  const [cmpReward, setCmpReward] = useState('100');
  const [cmpBudget, setCmpBudget] = useState('25000');
  const [cmpDuration, setCmpDuration] = useState('12');

  // Broadcast notification state
  const [ntfTarget, setNtfTarget] = useState('all');
  const [ntfTitle, setNtfTitle] = useState('');
  const [ntfMessage, setNtfMessage] = useState('');

  // Editable settings state
  const [minWithdraw, setMinWithdraw] = useState('50');
  const [refBonus, setRefBonus] = useState('150');
  const [requireVerify, setRequireVerify] = useState(true);
  const [antiBot, setAntiBot] = useState(true);
  const [notice, setNotice] = useState('');

  async function loadAdminData() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<AdminOverviewData>('/api/admin/overview');
      setData(res);
      setMinWithdraw(String(res.settings.minWithdrawalPKR));
      setRefBonus(String(res.settings.referralBonusPKR));
      setRequireVerify(res.settings.requireEmailVerificationForWithdraw);
      setAntiBot(res.settings.antiBotChallengeEnabled);
      setNotice(res.settings.platformNotice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin console.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAdminData();
  }, []);

  function notifyToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  async function handleToggleUserStatus(userId: string, current: 'active' | 'blocked') {
    const next = current === 'active' ? 'blocked' : 'active';
    await apiRequest(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: { status: next },
    });
    notifyToast(`User status updated to ${next}.`);
    await loadAdminData();
  }

  async function handleReviewCompletion(id: string, status: 'approved' | 'rejected') {
    await apiRequest(`/api/admin/completions/${id}`, {
      method: 'PATCH',
      body: {
        status,
        ...(status === 'rejected' ? { rejectionReason: 'Rejected during admin verification review' } : {}),
      },
    });
    notifyToast(`Task completion marked ${status}.`);
    await loadAdminData();
  }

  async function handleWithdrawalAction(id: string, status: 'approved' | 'rejected' | 'paid') {
    await apiRequest(`/api/admin/withdrawals/${id}`, {
      method: 'PATCH',
      body: {
        status,
        adminNote:
          status === 'paid'
            ? 'Disbursed and settled by finance admin'
            : status === 'approved'
              ? 'Approved for payout batch'
              : 'Rejected by admin; funds refunded to available balance',
      },
    });
    notifyToast(`Withdrawal updated to ${status}.`);
    await loadAdminData();
  }

  async function handleApprovePayment(paymentId: string) {
    setPaymentBusyId(paymentId);
    try {
      await apiRequest(`/api/admin/payments/${paymentId}`, {
        method: 'PATCH',
        body: { status: 'APPROVED' },
      });
      notifyToast('Payment approved and user wallet balance credited.');
      await loadAdminData();
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : 'Unable to approve payment.');
    } finally {
      setPaymentBusyId(null);
    }
  }

  async function handleRejectPaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectTarget) return;
    setPaymentBusyId(rejectTarget.id);
    try {
      await apiRequest(`/api/admin/payments/${rejectTarget.id}`, {
        method: 'PATCH',
        body: { status: 'REJECTED', rejectionReason: rejectReason },
      });
      setRejectTarget(null);
      setRejectReason('');
      notifyToast('Payment rejected and user notified.');
      await loadAdminData();
    } catch (err) {
      notifyToast(err instanceof Error ? err.message : 'Unable to reject payment.');
    } finally {
      setPaymentBusyId(null);
    }
  }

  async function handleCreateCampaign(e: React.FormEvent) {
    e.preventDefault();
    await apiRequest('/api/admin/campaigns', {
      method: 'POST',
      body: {
        title: cmpTitle,
        sponsorName: cmpSponsor,
        category: cmpCategory,
        description: cmpDescription,
        rewardAmountPKR: Number(cmpReward),
        totalBudgetPKR: Number(cmpBudget),
        durationSeconds: Number(cmpDuration),
      },
    });
    setCmpTitle('');
    setCmpSponsor('');
    setCmpDescription('');
    notifyToast('Sponsor campaign and linked task created.');
    await loadAdminData();
  }

  async function handleUpdateCampaign(c: Campaign, patch: Partial<Campaign>) {
    await apiRequest(`/api/admin/campaigns/${c.id}`, {
      method: 'PATCH',
      body: patch,
    });
    notifyToast(`Updated campaign "${c.title}".`);
    await loadAdminData();
  }

  async function handleUpdatePlan(
    p: Plan,
    price: number,
    dailyTaskLimit: number,
    perAdProfitPKR: number,
    durationDays: number,
    totalProfitPKR: number
  ) {
    await apiRequest(`/api/admin/plans/${p.id}`, {
      method: 'PATCH',
      body: { monthlyPricePKR: price, dailyTaskLimit, perAdProfitPKR, durationDays, totalProfitPKR },
    });
    notifyToast(`Plan "${p.name}" updated.`);
    await loadAdminData();
  }

  async function handleReferralStatus(id: string, status: 'qualified' | 'flagged') {
    await apiRequest(`/api/admin/referrals/${id}`, {
      method: 'PATCH',
      body: { status },
    });
    notifyToast(`Referral marked ${status}.`);
    await loadAdminData();
  }

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    const res = await apiRequest<{ sentCount: number }>('/api/admin/notifications', {
      method: 'POST',
      body: { targetUserId: ntfTarget, title: ntfTitle, message: ntfMessage },
    });
    setNtfTitle('');
    setNtfMessage('');
    notifyToast(`Notification sent to ${res.sentCount} user(s).`);
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    await apiRequest('/api/admin/settings', {
      method: 'PATCH',
      body: {
        minWithdrawalPKR: Number(minWithdraw),
        referralBonusPKR: Number(refBonus),
        requireEmailVerificationForWithdraw: requireVerify,
        antiBotChallengeEnabled: antiBot,
        platformNotice: notice,
      },
    });
    notifyToast('Platform settings saved.');
    await loadAdminData();
  }

  if (loading) {
    return (
      <div className="h-72 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2 text-red-600">
        <ShieldAlert className="h-5 w-5" />
        <span className="text-sm">{error || 'Administrator access required.'}</span>
      </div>
    );
  }

  const tabs: Array<[AdminTab, string]> = [
    ['payments', `Deposit Approvals (${data.stats.pendingPaymentsCount})`],
    ['overview', 'Overview'],
    ['users', `Users (${data.users.length})`],
    ['completions', `Task Reviews (${data.stats.pendingCompletionsCount})`],
    ['withdrawals', `Withdrawals (${data.stats.pendingWithdrawalsCount})`],
    ['campaigns', 'Campaigns'],
    ['plans', 'Plans'],
    ['referrals', 'Referrals & Alerts'],
    ['settings', 'Settings'],
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-slate-900 text-white border border-slate-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-blue-400">
            Exclusive Owner Console · Protected Access
          </p>
          <h1 className="font-display text-2xl font-bold mt-1">Owner Approvals &amp; Control Center</h1>
          <p className="text-sm text-slate-300 mt-1">
            Approve or reject Easypaisa &amp; JazzCash deposits, task rewards, withdrawals, and
            campaigns. Only the verified owner account has access to these controls.
          </p>
        </div>
        {toast && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{toast}</span>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 p-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-x-auto">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              tab === id
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <p className="text-xs text-slate-500">Registered Users</p>
              <p className="mt-2 font-display text-2xl font-bold tabular-nums">{data.stats.totalUsers}</p>
              <p className="mt-1 text-xs text-slate-500">
                {data.stats.activeUsers} active · {data.stats.blockedUsers} blocked
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <p className="text-xs text-slate-500">Campaign Budget / Spent</p>
              <p className="mt-2 font-display text-xl font-bold tabular-nums">
                {formatPKR(data.stats.totalSpentPKR)} / {formatPKR(data.stats.totalBudgetPKR)}
              </p>
              <p className="mt-1 text-xs text-slate-500">{data.stats.activeCampaigns} active campaigns</p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <p className="text-xs text-slate-500">Pending Queues</p>
              <p className="mt-2 font-display text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {data.stats.pendingCompletionsCount + data.stats.pendingWithdrawalsCount}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {data.stats.pendingCompletionsCount} tasks · {data.stats.pendingWithdrawalsCount} withdrawals
              </p>
            </div>
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5">
              <p className="text-xs text-slate-500">Total Settled Payouts</p>
              <p className="mt-2 font-display text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatPKR(data.stats.totalPaidWithdrawalsPKR)}
              </p>
              <p className="mt-1 text-xs text-slate-500">{data.stats.totalReferrals} tracked referrals</p>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-800">
              <h2 className="font-display text-base font-bold">Platform Transaction Ledger</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                    <th className="py-3 px-5 font-medium">Transaction</th>
                    <th className="py-3 px-4 font-medium">User ID</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-5 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.transactions.slice(0, 12).map((t) => (
                    <tr key={t.id}>
                      <td className="py-3 px-5">
                        <p className="font-medium text-slate-900 dark:text-white">{t.description}</p>
                        <p className="text-xs font-mono text-slate-500">{formatDateTime(t.createdAt)}</p>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">{t.userId}</td>
                      <td className="py-3 px-4 text-xs capitalize font-medium">{t.status}</td>
                      <td className="py-3 px-5 text-right font-mono font-semibold tabular-nums">
                        {formatPKR(t.amountPKR)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USERS */}
      {tab === 'users' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                  <th className="py-3.5 px-5 font-medium">User</th>
                  <th className="py-3.5 px-4 font-medium">Role &amp; Plan</th>
                  <th className="py-3.5 px-4 font-medium">Available / Pending</th>
                  <th className="py-3.5 px-4 font-medium">Status</th>
                  <th className="py-3.5 px-5 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3.5 px-5">
                      <p className="font-medium text-slate-900 dark:text-white">
                        {u.name}
                        {u.isDemo ? ' · Demo' : ''}
                      </p>
                      <p className="text-xs text-slate-500">
                        {u.email} · {u.emailVerified ? 'Verified' : 'Unverified'}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 text-xs capitalize">
                      {u.role} · {u.planId.replace('plan_', '')}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs tabular-nums">
                      {formatPKR(u.wallet.availableBalancePKR)} / {formatPKR(u.wallet.pendingBalancePKR)}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold capitalize">
                      <span className={u.status === 'active' ? 'text-emerald-600' : 'text-red-600'}>
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      {u.role !== 'admin' && (
                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(u.id, u.status)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                            u.status === 'active'
                              ? 'border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700'
                          }`}
                        >
                          {u.status === 'active' ? 'Block Account' : 'Unblock'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: TASK COMPLETIONS */}
      {tab === 'completions' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                  <th className="py-3.5 px-5 font-medium">Member &amp; Task</th>
                  <th className="py-3.5 px-4 font-medium">Watch Time / Nonce</th>
                  <th className="py-3.5 px-4 font-medium">Reward</th>
                  <th className="py-3.5 px-4 font-medium">Status</th>
                  <th className="py-3.5 px-5 font-medium text-right">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.completions.map((c) => (
                  <tr key={c.id}>
                    <td className="py-3.5 px-5">
                      <p className="font-medium">{c.title}</p>
                      <p className="text-xs text-slate-500">
                        {c.userName} ({c.userEmail})
                      </p>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                      {c.watchedSeconds}s · {c.verificationNonce.slice(0, 10)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-semibold tabular-nums">
                      {formatPKR(c.rewardAmountPKR)}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold capitalize">{c.status}</td>
                    <td className="py-3.5 px-5 text-right space-x-2 whitespace-nowrap">
                      {c.status === 'pending' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleReviewCompletion(c.id, 'approved')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewCompletion(c.id, 'rejected')}
                            className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 text-xs font-semibold"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">Reviewed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: EASYPAISA PAYMENTS MANAGEMENT */}
      {tab === 'payments' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold">
                Easypaisa &amp; JazzCash Deposit Verification Queue
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Inspect submitted receipts, verify Transaction IDs, and approve or reject requests.
                Wallet credits execute only upon approval.
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500">
              {data.payments.length} total · {data.stats.pendingPaymentsCount} pending
            </span>
          </div>

          {data.payments.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              No Easypaisa or JazzCash payment submissions yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                    <th className="py-3.5 px-5 font-medium">User Details</th>
                    <th className="py-3.5 px-4 font-medium">Method, TxID &amp; Date</th>
                    <th className="py-3.5 px-4 font-medium">Amount</th>
                    <th className="py-3.5 px-4 font-medium">Screenshot</th>
                    <th className="py-3.5 px-4 font-medium">Status</th>
                    <th className="py-3.5 px-5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.payments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-5">
                        <p className="font-medium text-slate-900 dark:text-white">{p.userName}</p>
                        <p className="text-xs text-slate-500">{p.userEmail}</p>
                        <p className="text-[11px] font-mono text-slate-400">{p.userId}</p>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-mono font-semibold text-slate-900 dark:text-white">
                          {p.method} · {p.transactionId}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          To {p.receiverAccountNumber} ({p.receiverAccountHolder})
                        </p>
                        <p className="text-xs text-slate-500 whitespace-nowrap">
                          {formatDateTime(p.createdAt)}
                        </p>
                        {p.note && (
                          <p className="text-xs text-slate-500 mt-0.5 max-w-xs truncate">
                            Note: {p.note}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold tabular-nums whitespace-nowrap">
                        {formatPKR(p.amountPKR)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setPreviewPayment(p)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-blue-600 text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <Eye className="h-3.5 w-3.5 text-blue-600" />
                          Open Screenshot
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <span
                          className={`font-mono font-semibold ${
                            p.status === 'APPROVED'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : p.status === 'PENDING'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {p.status}
                        </span>
                        {p.rejectionReason && (
                          <p className="text-red-600 dark:text-red-400 mt-0.5 max-w-xs">
                            {p.rejectionReason}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right space-x-2 whitespace-nowrap">
                        {p.status === 'PENDING' ? (
                          <>
                            <button
                              type="button"
                              disabled={paymentBusyId === p.id}
                              onClick={() => handleApprovePayment(p.id)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold"
                            >
                              Approve Payment
                            </button>
                            <button
                              type="button"
                              disabled={paymentBusyId === p.id}
                              onClick={() => {
                                setRejectTarget(p);
                                setRejectReason('');
                              }}
                              className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-semibold"
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {p.reviewedAt ? formatDateTime(p.reviewedAt) : 'Finalized'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: WITHDRAWALS */}
      {tab === 'withdrawals' && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                  <th className="py-3.5 px-5 font-medium">Member &amp; Account</th>
                  <th className="py-3.5 px-4 font-medium">Method</th>
                  <th className="py-3.5 px-4 font-medium">Amount</th>
                  <th className="py-3.5 px-4 font-medium">Status</th>
                  <th className="py-3.5 px-5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td className="py-3.5 px-5">
                      <p className="font-medium">{w.userName}</p>
                      <p className="text-xs font-mono text-slate-500">
                        {w.accountTitle} · {w.accountNumber} {w.bankName ? `(${w.bankName})` : ''}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 text-xs capitalize">{w.method.replace('_', ' ')}</td>
                    <td className="py-3.5 px-4 font-mono font-semibold tabular-nums">
                      {formatPKR(w.amountPKR)}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold capitalize">{w.status}</td>
                    <td className="py-3.5 px-5 text-right space-x-2 whitespace-nowrap">
                      {w.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleWithdrawalAction(w.id, 'approved')}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleWithdrawalAction(w.id, 'paid')}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                          >
                            Mark Paid
                          </button>
                          <button
                            type="button"
                            onClick={() => handleWithdrawalAction(w.id, 'rejected')}
                            className="px-2.5 py-1.5 rounded-lg border border-red-300 text-red-600 text-xs font-semibold"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {w.status === 'approved' && (
                        <button
                          type="button"
                          onClick={() => handleWithdrawalAction(w.id, 'paid')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                        >
                          Mark Paid
                        </button>
                      )}
                      {(w.status === 'paid' || w.status === 'rejected') && (
                        <span className="text-xs text-slate-400">Finalized</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: CAMPAIGNS */}
      {tab === 'campaigns' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleCreateCampaign}
            className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <h2 className="font-display text-lg font-bold flex items-center gap-2">
              <Plus className="h-4 w-4 text-blue-600" />
              Create Sponsor Campaign
            </h2>
            <input
              type="text"
              required
              value={cmpTitle}
              onChange={(e) => setCmpTitle(e.target.value)}
              placeholder="Campaign title"
              className="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
            <input
              type="text"
              required
              value={cmpSponsor}
              onChange={(e) => setCmpSponsor(e.target.value)}
              placeholder="Sponsor company name"
              className="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
            <input
              type="text"
              value={cmpCategory}
              onChange={(e) => setCmpCategory(e.target.value)}
              placeholder="Category"
              className="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
            <textarea
              required
              rows={3}
              value={cmpDescription}
              onChange={(e) => setCmpDescription(e.target.value)}
              placeholder="Task description & sponsor disclosure"
              className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Reward (PKR)</label>
                <input
                  type="number"
                  min={5}
                  value={cmpReward}
                  onChange={(e) => setCmpReward(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Budget (PKR)</label>
                <input
                  type="number"
                  min={500}
                  value={cmpBudget}
                  onChange={(e) => setCmpBudget(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Seconds</label>
                <input
                  type="number"
                  min={5}
                  value={cmpDuration}
                  onChange={(e) => setCmpDuration(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
            >
              Publish Campaign &amp; Task
            </button>
          </form>

          <div className="lg:col-span-7 space-y-4">
            {data.campaigns.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <p className="text-xs text-slate-500">
                    {c.sponsorName} · {c.status.toUpperCase()}
                  </p>
                  <h3 className="font-display font-bold text-base">{c.title}</h3>
                  <p className="text-xs font-mono text-slate-500 tabular-nums">
                    Reward: {formatPKR(c.rewardAmountPKR)} · Spent: {formatPKR(c.spentBudgetPKR)} /{' '}
                    {formatPKR(c.totalBudgetPKR)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateCampaign(c, {
                        rewardAmountPKR: c.rewardAmountPKR + 10,
                      })
                    }
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold"
                  >
                    +PKR 10 Reward
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateCampaign(c, {
                        status: c.status === 'active' ? 'paused' : 'active',
                      })
                    }
                    className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold"
                  >
                    {c.status === 'active' ? 'Pause' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: PLANS */}
      {tab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {data.plans.map((p) => (
            <PlanEditorCard key={p.id} plan={p} onSave={handleUpdatePlan} />
          ))}
        </div>
      )}

      {/* TAB 7: REFERRALS, BROADCAST NOTIFICATIONS & SUPPORT MESSAGES */}
      {tab === 'referrals' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800">
                <h2 className="font-display text-base font-bold">Referral Anti-Fraud Queue</h2>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.referrals.map((r) => (
                  <div key={r.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{r.referredUserName}</p>
                      <p className="text-xs text-slate-500">
                        {r.referredUserEmail} · Status: {r.status} · IP Hash: {r.ipHash}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleReferralStatus(r.id, 'qualified')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                      >
                        Qualify
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReferralStatus(r.id, 'flagged')}
                        className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 text-xs font-semibold"
                      >
                        Flag
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <h2 className="font-display text-base font-bold">Contact Us Inbox</h2>
              {data.contactMessages.length === 0 ? (
                <p className="text-xs text-slate-500">No support messages submitted yet.</p>
              ) : (
                <div className="space-y-3">
                  {data.contactMessages.map((m) => (
                    <div key={m.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                      <p className="font-semibold">
                        {m.subject} — {m.name} ({m.email})
                      </p>
                      <p className="text-slate-600 dark:text-slate-400">{m.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <form
            onSubmit={handleBroadcast}
            className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 h-fit"
          >
            <h2 className="font-display text-lg font-bold flex items-center gap-2">
              <Send className="h-4 w-4 text-blue-600" />
              Send User Notification
            </h2>
            <select
              value={ntfTarget}
              onChange={(e) => setNtfTarget(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            >
              <option value="all">All Registered Users</option>
              {data.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
            <input
              type="text"
              required
              value={ntfTitle}
              onChange={(e) => setNtfTitle(e.target.value)}
              placeholder="Notification title"
              className="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
            <textarea
              required
              rows={4}
              value={ntfMessage}
              onChange={(e) => setNtfMessage(e.target.value)}
              placeholder="Write announcement or payout notice..."
              className="w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
            <button
              type="submit"
              className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
            >
              Send Notification
            </button>
          </form>
        </div>
      )}

      {/* TAB 8: PLATFORM SETTINGS */}
      {tab === 'settings' && (
        <form
          onSubmit={handleSaveSettings}
          className="max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
        >
          <h2 className="font-display text-lg font-bold">Platform Rules &amp; Thresholds</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Minimum Withdrawal (PKR)
              </label>
              <input
                type="number"
                min={50}
                value={minWithdraw}
                onChange={(e) => setMinWithdraw(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Referral Bonus (PKR)
              </label>
              <input
                type="number"
                min={0}
                value={refBonus}
                onChange={(e) => setRefBonus(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
              />
            </div>
          </div>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={requireVerify}
              onChange={(e) => setRequireVerify(e.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
            Require verified email before withdrawal requests
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={antiBot}
              onChange={(e) => setAntiBot(e.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
            Enable server-side anti-bot verification challenge
          </label>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Dashboard Platform Notice
            </label>
            <textarea
              rows={2}
              value={notice}
              onChange={(e) => setNotice(e.target.value)}
              className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
          >
            Save Configuration
          </button>
        </form>
      )}

      {/* Screenshot Preview Modal */}
      {previewPayment && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold">
                  {previewPayment.method} Receipt · {previewPayment.transactionId}
                </h3>
                <p className="text-xs text-slate-500">
                  {previewPayment.userName} · {formatPKR(previewPayment.amountPKR)} ·{' '}
                  {formatDateTime(previewPayment.createdAt)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close screenshot viewer"
                onClick={() => setPreviewPayment(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 bg-slate-100 dark:bg-slate-950 flex items-center justify-center max-h-[70vh] overflow-auto">
              {previewBlobUrl ? (
                <img
                  src={previewBlobUrl}
                  alt={`Payment screenshot for ${previewPayment.transactionId}`}
                  className="max-h-[60vh] w-auto rounded-lg border border-slate-200 dark:border-slate-800 object-contain"
                />
              ) : (
                <p className="text-xs text-slate-500 py-8">Loading screenshot...</p>
              )}
            </div>
            {previewPayment.status === 'PENDING' && (
              <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = previewPayment;
                    setPreviewPayment(null);
                    setRejectTarget(target);
                    setRejectReason('');
                  }}
                  className="px-3.5 py-2 rounded-lg border border-red-300 text-red-600 text-xs font-semibold"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = previewPayment.id;
                    setPreviewPayment(null);
                    handleApprovePayment(id);
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  Approve Payment
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rejection Reason Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4">
          <form
            onSubmit={handleRejectPaymentSubmit}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">
                Reject {rejectTarget.method} Payment
              </h3>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setRejectTarget(null)}
                className="p-1.5 rounded-lg text-slate-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              TxID <span className="font-mono font-semibold">{rejectTarget.transactionId}</span> (
              {formatPKR(rejectTarget.amountPKR)}) from {rejectTarget.userName}
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Rejection Reason (visible to user)
              </label>
              <textarea
                required
                minLength={3}
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Transaction ID not found in Easypaisa / JazzCash statement or screenshot unreadable."
                className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={paymentBusyId === rejectTarget.id}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                Confirm Rejection
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function PlanEditorCard({
  plan,
  onSave,
}: {
  plan: Plan;
  onSave: (
    plan: Plan,
    price: number,
    dailyTaskLimit: number,
    perAdProfitPKR: number,
    durationDays: number,
    totalProfitPKR: number
  ) => void;
}) {
  const [price, setPrice] = useState(String(plan.monthlyPricePKR));
  const [limit, setLimit] = useState(String(plan.dailyTaskLimit));
  const [perAdProfit, setPerAdProfit] = useState(String(plan.perAdProfitPKR || plan.dailyProfitPKR || 27));
  const [durationDays, setDurationDays] = useState(String(plan.durationDays || 100));
  const [totalProfit, setTotalProfit] = useState(
    String(plan.totalProfitPKR || (plan.dailyProfitPKR || 0) * (plan.durationDays || 100))
  );

  const dailyProfitPreview = Math.max(0, Number(limit || 0) * Number(perAdProfit || 0));

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-slate-500 capitalize">{plan.tier} tier</p>
          <h3 className="font-display text-lg font-bold">{plan.name}</h3>
        </div>
        <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          {formatPKR(dailyProfitPreview)}/day
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Investment (PKR)</label>
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Duration (Days)</label>
          <input
            type="number"
            min={1}
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            className="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Ads / Day</label>
          <input
            type="number"
            min={1}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="w-full h-10 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Daily Profit</label>
          <input
            type="number"
            min={1}
            value={perAdProfit}
            onChange={(e) => setPerAdProfit(e.target.value)}
            className="w-full h-10 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Total Profit</label>
          <input
            type="number"
            min={0}
            value={totalProfit}
            onChange={(e) => setTotalProfit(e.target.value)}
            className="w-full h-10 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() =>
          onSave(
            plan,
            Number(price),
            Number(limit),
            Number(perAdProfit),
            Number(durationDays),
            Number(totalProfit)
          )
        }
        className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
      >
        Save Plan Config
      </button>
    </div>
  );
}
