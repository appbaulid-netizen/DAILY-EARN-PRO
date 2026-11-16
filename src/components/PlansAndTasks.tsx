import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Lock,
  Play,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { apiRequest, formatDateTime, formatPKR } from '../lib/api';
import type {
  AppRoute,
  AuthUser,
  PaymentRecord,
  Plan,
  TaskCompletion,
  TaskItem,
  Wallet,
} from '../types';

interface PlansAndTasksProps {
  mode: 'plans' | 'tasks' | 'watch' | 'rewards';
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onNavigate: (route: AppRoute) => void;
  onUserRefresh: (user: AuthUser) => void;
}

export function PlansAndTasks({
  mode,
  selectedTaskId,
  onSelectTask,
  onNavigate,
  onUserRefresh,
}: PlansAndTasksProps) {
  // Plans state
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<string>('plan_300');
  const [userDepositedPKR, setUserDepositedPKR] = useState(0);
  const [planBusy, setPlanBusy] = useState<string | null>(null);
  const [planMessage, setPlanMessage] = useState<string | null>(null);

  // Tasks state
  const [items, setItems] = useState<TaskItem[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [depositRequired, setDepositRequired] = useState(false);
  const [hasApprovedDeposit, setHasApprovedDeposit] = useState(true);
  const [latestPayment, setLatestPayment] = useState<PaymentRecord | null>(null);
  const [completedTodayCount, setCompletedTodayCount] = useState(0);
  const [dailyTaskLimit, setDailyTaskLimit] = useState(1);
  const [completions, setCompletions] = useState<TaskCompletion[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Watch & Earn active session state
  const [sessionNonce, setSessionNonce] = useState<string | null>(null);
  const [requiredSeconds, setRequiredSeconds] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [challengePrompt, setChallengePrompt] = useState('');
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [watchError, setWatchError] = useState<string | null>(null);
  const [watchSuccess, setWatchSuccess] = useState<string | null>(null);
  const [submittingCallback, setSubmittingCallback] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      if (mode === 'plans') {
        const res = await apiRequest<{
          plans: Plan[];
          currentPlanId: string;
          totalDepositedPKR?: number;
          availableBalancePKR?: number;
        }>('/api/plans');
        setPlans(res.plans);
        setCurrentPlanId(res.currentPlanId);
        setUserDepositedPKR(res.totalDepositedPKR || 0);
      } else if (mode === 'rewards') {
        const res = await apiRequest<{ wallet: Wallet; completions: TaskCompletion[] }>(
          '/api/rewards'
        );
        setWallet(res.wallet);
        setCompletions(res.completions);
      } else {
        const res = await apiRequest<{
          items: TaskItem[];
          activePlan?: Plan | null;
          depositRequired?: boolean;
          hasApprovedDeposit?: boolean;
          latestPayment?: PaymentRecord | null;
          completedTodayCount: number;
          dailyTaskLimit: number;
          completions: TaskCompletion[];
        }>('/api/tasks');
        setItems(res.items);
        setActivePlan(res.activePlan || null);
        setDepositRequired(Boolean(res.depositRequired));
        setHasApprovedDeposit(res.hasApprovedDeposit !== false);
        setLatestPayment(res.latestPayment || null);
        setCompletedTodayCount(res.completedTodayCount);
        setDailyTaskLimit(res.dailyTaskLimit);
        setCompletions(res.completions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load records.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // Reset active watch state when changing route or task
    setSessionNonce(null);
    setWatchError(null);
    setWatchSuccess(null);
    setChallengeAnswer('');
  }, [mode, selectedTaskId]);

  useEffect(() => {
    if (!sessionNonce || secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionNonce, secondsLeft]);

  async function handleSelectPlan(planId: string) {
    setPlanBusy(planId);
    setPlanMessage(null);
    try {
      const res = await apiRequest<{ user: AuthUser; plan: Plan }>('/api/plans/select', {
        method: 'POST',
        body: { planId },
      });
      setCurrentPlanId(res.plan.id);
      onUserRefresh(res.user);
      setPlanMessage(`Active plan updated to ${res.plan.name}.`);
    } catch (err) {
      setPlanMessage(err instanceof Error ? err.message : 'Unable to update plan.');
    } finally {
      setPlanBusy(null);
    }
  }

  async function handleStartWatchSession(taskId: string) {
    setWatchError(null);
    setWatchSuccess(null);
    try {
      const res = await apiRequest<{
        nonce: string;
        requiredSeconds: number;
        challengePrompt: string;
      }>(`/api/tasks/${taskId}/start`, { method: 'POST' });
      setSessionNonce(res.nonce);
      setRequiredSeconds(res.requiredSeconds);
      setSecondsLeft(res.requiredSeconds);
      setChallengePrompt(res.challengePrompt);
    } catch (err) {
      setWatchError(err instanceof Error ? err.message : 'Unable to initialize server session.');
    }
  }

  async function handleCompleteCallback(e: React.FormEvent, taskId: string) {
    e.preventDefault();
    if (!sessionNonce) return;
    setSubmittingCallback(true);
    setWatchError(null);
    try {
      await apiRequest(`/api/tasks/${taskId}/complete`, {
        method: 'POST',
        body: { nonce: sessionNonce, answer: Number(challengeAnswer) },
      });
      setSessionNonce(null);
      setChallengeAnswer('');
      setWatchSuccess(
        'Server callback verified. Your reward has been credited to Pending Balance for admin approval.'
      );
      await loadData();
    } catch (err) {
      setWatchError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setSubmittingCallback(false);
    }
  }

  if (loading) {
    return (
      <div className="h-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-pulse" />
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  // ========================
  // PLANS PAGE (13 INVESTMENT PLANS · 100 DAYS)
  // ========================
  if (mode === 'plans') {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                13 Investment Plans · 100-Day Duration · Deposit First to Unlock
              </p>
              <h1 className="font-display text-2xl font-bold">Honey &amp; Bunny Invest Plans</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
                Choose a 100-day plan from PKR 300 up to PKR 510,000. Receive daily profit based on
                your active investment plan once your Easypaisa or JazzCash deposit is approved.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3 shrink-0 text-xs">
              <p className="text-slate-500">Approved Deposit Total</p>
              <p className="font-mono text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                {formatPKR(userDepositedPKR)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
              <p className="text-slate-500">Register Bonus</p>
              <p className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">
                PKR 35
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
              <p className="text-slate-500">Minimum Deposit</p>
              <p className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400 mt-0.5">
                PKR 300
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
              <p className="text-slate-500">Minimum Withdraw</p>
              <p className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-0.5">
                PKR 50
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
              <p className="text-slate-500">Referral Commission</p>
              <p className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400 mt-0.5">
                L1 10% · L2 2% · L3 2%
              </p>
            </div>
          </div>
        </div>

        {planMessage && (
          <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-sm text-blue-800 dark:text-blue-200">
            {planMessage}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            const isUnlocked = userDepositedPKR >= plan.monthlyPricePKR;
            const dailyProfit = plan.dailyProfitPKR || plan.dailyTaskLimit * (plan.perAdProfitPKR || 0);
            const durationDays = plan.durationDays || 100;
            const totalProfit = plan.totalProfitPKR || dailyProfit * durationDays;

            return (
              <div
                key={plan.id}
                className={`rounded-2xl bg-white dark:bg-slate-900 border p-6 flex flex-col justify-between gap-6 ${
                  isCurrent
                    ? 'border-blue-600 dark:border-blue-500'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {plan.targetAudience}
                      </p>
                      <h2 className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white">
                        {plan.name}
                      </h2>
                    </div>
                    {isCurrent && (
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="pb-4 border-b border-slate-100 dark:border-slate-800 flex items-baseline justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-slate-500">Investment</p>
                      <p className="font-display text-3xl font-bold tabular-nums">
                        {formatPKR(plan.monthlyPricePKR)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[11px] text-slate-500">Daily Profit</p>
                      <p className="font-mono text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatPKR(dailyProfit)} / day
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Profit</span>
                      <span className="font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatPKR(totalProfit)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Plan Duration</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {durationDays} Days
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Minimum Withdraw</span>
                      <span className="font-mono font-semibold tabular-nums">PKR 50</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Payout Queue</span>
                      <span className="font-medium text-right">{plan.payoutPriority}</span>
                    </div>
                  </div>

                  <ul className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                        <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {isUnlocked ? (
                  <button
                    type="button"
                    disabled={isCurrent || planBusy === plan.id}
                    onClick={() => handleSelectPlan(plan.id)}
                    className={`w-full h-11 rounded-xl text-sm font-semibold transition-colors ${
                      isCurrent
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-default'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {isCurrent
                      ? 'Current Active Plan'
                      : planBusy === plan.id
                        ? 'Activating...'
                        : `Activate ${plan.name}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem(
                        'asad_selected_deposit_amount',
                        String(plan.monthlyPricePKR)
                      );
                      sessionStorage.setItem('asad_selected_deposit_plan', plan.name);
                      onNavigate('deposit');
                    }}
                    className="w-full h-11 rounded-xl bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                  >
                    Deposit {formatPKR(plan.monthlyPricePKR)} to Unlock
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ========================
  // MY REWARDS PAGE
  // ========================
  if (mode === 'rewards') {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold">My Rewards &amp; Task History</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Track pending and approved rewards verified through server-side callbacks.
            </p>
          </div>
          {wallet && (
            <div className="flex items-center gap-6 text-sm">
              <div>
                <p className="text-xs text-slate-500">Pending</p>
                <p className="font-mono font-bold tabular-nums text-amber-600 dark:text-amber-400">
                  {formatPKR(wallet.pendingBalancePKR)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Approved Total</p>
                <p className="font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatPKR(wallet.totalEarnedPKR)}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
          {completions.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm text-slate-500">You have not submitted any sponsor tasks yet.</p>
              <button
                type="button"
                onClick={() => onNavigate('tasks')}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white"
              >
                Browse Available Tasks
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                    <th className="py-3.5 px-5 font-medium">Task</th>
                    <th className="py-3.5 px-4 font-medium">Submitted</th>
                    <th className="py-3.5 px-4 font-medium">Verification</th>
                    <th className="py-3.5 px-4 font-medium">Status</th>
                    <th className="py-3.5 px-5 font-medium text-right">Reward</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {completions.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-5 font-medium text-slate-900 dark:text-white">
                        {item.title}
                        {item.rejectionReason && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                            Reason: {item.rejectionReason}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500 whitespace-nowrap">
                        {formatDateTime(item.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                        {item.watchedSeconds}s · {item.verificationNonce.slice(0, 10)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs font-semibold">
                        {item.status === 'approved' && (
                          <span className="text-emerald-600 dark:text-emerald-400">Approved</span>
                        )}
                        {item.status === 'pending' && (
                          <span className="text-amber-600 dark:text-amber-400">Pending Review</span>
                        )}
                        {item.status === 'rejected' && (
                          <span className="text-red-600 dark:text-red-400">Rejected</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                        {formatPKR(item.rewardAmountPKR)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========================
  // DEPOSIT-FIRST LOCK FOR ADS (WATCH & TASKS)
  // ========================
  if ((mode === 'tasks' || mode === 'watch') && depositRequired && !hasApprovedDeposit) {
    return (
      <div className="max-w-2xl mx-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-5">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 flex items-center justify-center shrink-0">
            <Lock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              Deposit Required First · Ads Locked
            </p>
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Complete &amp; Verify Deposit to Open Ads
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Ads and Watch &amp; Earn campaigns are locked until your Easypaisa or JazzCash deposit
              is submitted and approved by the platform owner. First deposit, then ads unlock
              automatically.
            </p>
          </div>
        </div>

        {latestPayment && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Latest Payment Status</span>
              <span
                className={`font-mono font-semibold ${
                  latestPayment.status === 'PENDING'
                    ? 'text-amber-600 dark:text-amber-400'
                    : latestPayment.status === 'REJECTED'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {latestPayment.status}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Amount &amp; TxID</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {formatPKR(latestPayment.amountPKR)} · {latestPayment.transactionId}
              </span>
            </div>
            {latestPayment.status === 'PENDING' && (
              <p className="text-amber-700 dark:text-amber-300 pt-1">
                Your payment request is waiting for owner approval. Ads will open right after
                approval.
              </p>
            )}
            {latestPayment.status === 'REJECTED' && (
              <p className="text-red-600 dark:text-red-400 pt-1">
                Rejected: {latestPayment.rejectionReason || 'Verification criteria not met.'} Please
                submit a valid Easypaisa or JazzCash payment.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => onNavigate('deposit')}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
          >
            Go to Deposit Page
          </button>
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ========================
  // WATCH & EARN INTERACTIVE SESSION
  // ========================
  if (mode === 'watch') {
    const activeItem = items.find((i) => i.task.id === selectedTaskId) || items[0];

    if (!activeItem) {
      return (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No active sponsor campaign is currently selected.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('tasks')}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold"
          >
            Back to Available Tasks
          </button>
        </div>
      );
    }

    const { task, campaign, canComplete } = activeItem;
    const progressPct =
      requiredSeconds > 0
        ? Math.min(100, Math.round(((requiredSeconds - secondsLeft) / requiredSeconds) * 100))
        : 0;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {campaign.sponsorName} · {campaign.providerName}
            </p>
            <h1 className="font-display text-2xl font-bold mt-0.5">{campaign.title}</h1>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('tasks')}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            All Sponsor Tasks
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Sponsor Showcase Viewport */}
          <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="relative aspect-[16/10] bg-slate-900">
              <img
                src={campaign.imageUrl}
                alt={campaign.title}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent flex flex-col justify-end p-6 text-white">
                <p className="text-xs text-blue-300 font-medium">
                  {campaign.category} · {campaign.isDemo ? 'Demo Sponsor Presentation' : 'Sponsor Presentation'}
                </p>
                <p className="text-base font-semibold mt-1">{campaign.description}</p>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>{campaign.complianceNote}</span>
              </div>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                Plan Profit: {formatPKR(activeItem.effectiveRewardPKR || campaign.rewardAmountPKR)}
              </span>
            </div>
          </div>

          {/* Right Server Callback Verification Panel */}
          <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between gap-5">
            <div className="space-y-4">
              <h2 className="font-display text-lg font-bold">Server Callback Verification</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {task.instructions}
              </p>

              {watchError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{watchError}</span>
                </div>
              )}

              {watchSuccess && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{watchSuccess}</span>
                </div>
              )}

              {!sessionNonce ? (
                <div className="pt-2 space-y-3">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Required Duration</span>
                      <span className="font-mono font-semibold">{campaign.durationSeconds}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Your Plan Profit / Ad</span>
                      <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                        {formatPKR(activeItem.effectiveRewardPKR || campaign.rewardAmountPKR)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Daily Ads Quota</span>
                      <span className="font-mono">{completedTodayCount}/{dailyTaskLimit}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!canComplete}
                    onClick={() => handleStartWatchSession(task.id)}
                    className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"
                  >
                    <Play className="h-4 w-4" />
                    {canComplete ? 'Start Verified Watch Session' : 'Daily Limit / Completed Today'}
                  </button>
                </div>
              ) : (
                <form onSubmit={(e) => handleCompleteCallback(e, task.id)} className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-blue-600" />
                        {secondsLeft > 0 ? 'Sponsor timer active' : 'Timer complete'}
                      </span>
                      <span className="font-mono tabular-nums">
                        {secondsLeft > 0 ? `${secondsLeft}s remaining` : 'Ready'}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {challengePrompt}
                    </label>
                    <input
                      type="number"
                      required
                      value={challengeAnswer}
                      onChange={(e) => setChallengeAnswer(e.target.value)}
                      placeholder="Enter answer"
                      className="w-full h-11 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm tabular-nums"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={secondsLeft > 0 || submittingCallback}
                    className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold"
                  >
                    {secondsLeft > 0
                      ? `Wait ${secondsLeft}s to Submit`
                      : submittingCallback
                        ? 'Validating Callback...'
                        : 'Submit Server Callback'}
                  </button>
                </form>
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigate('rewards')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline text-left"
            >
              View my reward completion history →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========================
  // AVAILABLE TASKS PAGE
  // ========================
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">
            {activePlan
              ? `${activePlan.name} · ${formatPKR(activePlan.perAdProfitPKR)}/ad · ${formatPKR(activePlan.dailyProfitPKR)}/day`
              : 'Sponsor-Approved Campaigns · Server Callback Verified'}
          </p>
          <h1 className="font-display text-2xl font-bold mt-1">Available Watch &amp; Earn Tasks</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Each ad credits profit based on your active plan. No Google or YouTube ad clicks.
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right">
            <p className="text-xs text-slate-500">Daily Quota</p>
            <p className="font-mono text-base font-bold tabular-nums">
              {completedTodayCount} / {dailyTaskLimit}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('rewards')}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            My Rewards ({completions.length})
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
          <p className="text-sm text-slate-500">No active sponsor campaigns available right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {items.map(({ task, campaign, effectiveRewardPKR, todaySubmissions, canComplete, remainingBudget }) => (
            <article
              key={task.id}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="aspect-[16/10] bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <img
                    src={campaign.imageUrl}
                    alt={campaign.title}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-5 space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {campaign.sponsorName} · {campaign.durationSeconds}s ·{' '}
                    {campaign.isDemo ? 'Demo Campaign' : campaign.category}
                  </p>
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white leading-snug">
                    {campaign.title}
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3">
                    {campaign.description}
                  </p>
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                    <span>Remaining budget</span>
                    <span className="font-mono tabular-nums font-medium">
                      {formatPKR(remainingBudget)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-5 pb-5 pt-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">Your Plan Profit</p>
                  <p className="font-display text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">
                    {formatPKR(effectiveRewardPKR || campaign.rewardAmountPKR)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSelectTask(task.id);
                    onNavigate('watch');
                  }}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap ${
                    canComplete
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {canComplete ? 'Open Watch & Earn' : `Submitted (${todaySubmissions})`}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
