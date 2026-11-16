import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  DatabaseSchema,
  PlanRecord,
  TaskSessionChallenge,
  UserRecord,
  WalletRecord,
} from './types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'asad_reward_hub.json');
export const PAYMENT_UPLOADS_DIR = path.join(DATA_DIR, 'uploads', 'payments');

export const DEPOSIT_RECEIVERS = [
  {
    method: 'Easypaisa' as const,
    accountNumber: '03424800275',
    accountHolderName: 'Muhammadanwar',
  },
  {
    method: 'JazzCash' as const,
    accountNumber: '03094987870',
    accountHolderName: 'Shemem Akhtar',
  },
] as const;

export const REGISTER_BONUS_PKR = 35;
export const MIN_DEPOSIT_PKR = 300;
export const REFERRAL_LEVEL_RATES = [0.1, 0.02, 0.02] as const;

export const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'appbaulid@gmail.com').trim().toLowerCase();

export function isOwnerEmail(email: string | undefined | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === OWNER_EMAIL);
}

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update('asad-reward-hub-dev-session-secret-v1').digest('hex');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function signSessionToken(payload: { uid: string; role: string; exp: number }): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifySessionToken(
  token: string | undefined
): { uid: string; role: string; exp: number } | null {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as {
      uid: string;
      role: string;
      exp: number;
    };
    if (!parsed.uid || !parsed.exp || Date.now() > parsed.exp) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function createInitialSeed(): DatabaseSchema {
  const now = new Date().toISOString();
  const today = todayDateString();

  const demoUserId = 'usr_demo_member_01';
  const demoAdminId = 'usr_demo_admin_01';
  const demoReferredId = 'usr_demo_referred_02';

  const users: UserRecord[] = [
    {
      id: demoUserId,
      name: 'Asad Khan (Demo Member)',
      email: 'member.demo@asadrewardhub.com',
      passwordHash: hashPassword('DemoMember@2026'),
      authProvider: 'email',
      emailVerified: true,
      verificationCode: null,
      resetCode: null,
      resetExpiresAt: null,
      role: 'user',
      status: 'active',
      planId: 'plan_300',
      referralCode: 'ASAD-DEMO01',
      referredBy: null,
      phone: '+92 300 0000101',
      country: 'Pakistan',
      payoutPreferences: {
        defaultMethod: 'easypaisa',
        accountTitle: 'Asad Khan (Demo)',
        accountNumber: '03000000101',
        bankName: '',
      },
      themePreference: 'light',
      emailAlertsEnabled: true,
      isDemo: true,
      createdAt: '2026-10-15T08:30:00.000Z',
      updatedAt: now,
    },
    {
      id: demoReferredId,
      name: 'Zainab Tariq (Demo Referral)',
      email: 'zainab.demo@asadrewardhub.com',
      passwordHash: hashPassword('DemoMember@2026'),
      authProvider: 'email',
      emailVerified: true,
      verificationCode: null,
      resetCode: null,
      resetExpiresAt: null,
      role: 'user',
      status: 'active',
      planId: 'plan_300',
      referralCode: 'ZAINAB-02',
      referredBy: demoUserId,
      phone: '+92 321 0000202',
      country: 'Pakistan',
      payoutPreferences: {
        defaultMethod: 'jazzcash',
        accountTitle: 'Zainab Tariq (Demo)',
        accountNumber: '03210000202',
        bankName: '',
      },
      themePreference: 'light',
      emailAlertsEnabled: true,
      isDemo: true,
      createdAt: '2026-10-22T11:15:00.000Z',
      updatedAt: now,
    },
    {
      id: demoAdminId,
      name: 'Platform Administrator (Demo)',
      email: 'admin.demo@asadrewardhub.com',
      passwordHash: hashPassword('DemoAdmin@2026'),
      authProvider: 'email',
      emailVerified: true,
      verificationCode: null,
      resetCode: null,
      resetExpiresAt: null,
      role: 'admin',
      status: 'active',
      planId: 'plan_510000',
      referralCode: 'ADMIN-HUB',
      referredBy: null,
      phone: '+92 300 0000999',
      country: 'Pakistan',
      payoutPreferences: {
        defaultMethod: 'bank_transfer',
        accountTitle: 'Honey & Bunny Invest Ops',
        accountNumber: 'PK00DEMO000000000001',
        bankName: 'Meezan Bank',
      },
      themePreference: 'dark',
      emailAlertsEnabled: true,
      isDemo: true,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: now,
    },
  ];

  const wallets: WalletRecord[] = [
    {
      userId: demoUserId,
      availableBalancePKR: 1250,
      pendingBalancePKR: 180,
      totalEarnedPKR: 1930,
      dailyEarnedPKR: 120,
      dailyEarnedDate: today,
      referralEarnedPKR: 150,
      totalWithdrawnPKR: 500,
      totalDepositedPKR: 0,
      updatedAt: now,
    },
    {
      userId: demoReferredId,
      availableBalancePKR: 320,
      pendingBalancePKR: 0,
      totalEarnedPKR: 320,
      dailyEarnedPKR: 0,
      dailyEarnedDate: today,
      referralEarnedPKR: 0,
      totalWithdrawnPKR: 0,
      totalDepositedPKR: 0,
      updatedAt: now,
    },
    {
      userId: demoAdminId,
      availableBalancePKR: 0,
      pendingBalancePKR: 0,
      totalEarnedPKR: 0,
      dailyEarnedPKR: 0,
      dailyEarnedDate: today,
      referralEarnedPKR: 0,
      totalWithdrawnPKR: 0,
      totalDepositedPKR: 0,
      updatedAt: now,
    },
  ];

  return {
    users,
    wallets,
    admins: [
      {
        id: 'adm_01',
        userId: demoAdminId,
        email: 'admin.demo@asadrewardhub.com',
        permissions: ['manage_users', 'manage_campaigns', 'manage_plans', 'manage_withdrawals', 'manage_settings'],
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ],
    plans: createDefaultPlans(),
    campaigns: [
      {
        id: 'cmp_novapay_01',
        title: 'NovaPay Savings App Product Walkthrough',
        sponsorName: 'NovaPay Financial Ltd.',
        category: 'Fintech Product Demo',
        providerName: 'Direct Brand Sponsor (Reward-Permitted)',
        complianceNote: 'Explicitly permits incentivized product walkthroughs. Never uses Google/YouTube ad clicks.',
        description:
          'Watch the 15-second interactive product showcase for NovaPay digital savings vaults and complete the server-verified comprehension check.',
        imageUrl: '/src/assets/images/campaign_fintech_app_1794576037534.jpg',
        sponsorVideoUrl: 'https://sponsor.asadrewardhub.demo/novapay-walkthrough',
        rewardAmountPKR: 120,
        totalBudgetPKR: 100000000,
        spentBudgetPKR: 14400,
        dailyCap: 1,
        durationSeconds: 15,
        status: 'active',
        isDemo: true,
        createdAt: '2026-10-18T09:00:00.000Z',
      },
      {
        id: 'cmp_vaultkey_02',
        title: 'VaultKey Hardware 2FA Security Briefing',
        sponsorName: 'VaultKey Security Systems',
        category: 'Cybersecurity Awareness',
        providerName: 'OfferWall Direct Partner (Reward-Permitted)',
        complianceNote: 'Verified direct sponsor campaign with server-side callback completion token.',
        description:
          'Review the 12-second hardware security key onboarding guide and verify your completion via anti-bot challenge.',
        imageUrl: '/src/assets/images/campaign_cloud_security_1794576039524.jpg',
        sponsorVideoUrl: 'https://sponsor.asadrewardhub.demo/vaultkey-briefing',
        rewardAmountPKR: 95,
        totalBudgetPKR: 100000000,
        spentBudgetPKR: 9500,
        dailyCap: 1,
        durationSeconds: 12,
        status: 'active',
        isDemo: true,
        createdAt: '2026-10-20T14:00:00.000Z',
      },
      {
        id: 'cmp_ledgerflow_03',
        title: 'LedgerFlow Cloud Accounting Feature Tour',
        sponsorName: 'LedgerFlow Software',
        category: 'B2B SaaS Tour',
        providerName: 'Direct Brand Sponsor (Reward-Permitted)',
        complianceNote: 'Permitted SaaS feature preview. Strictly verified via server timer & nonce.',
        description:
          'Explore the 10-second LedgerFlow expense reporting tour and submit your verified completion callback.',
        imageUrl: '/src/assets/images/campaign_saas_analytics_1794576039141.jpg',
        sponsorVideoUrl: 'https://sponsor.asadrewardhub.demo/ledgerflow-tour',
        rewardAmountPKR: 85,
        totalBudgetPKR: 100000000,
        spentBudgetPKR: 6800,
        dailyCap: 1,
        durationSeconds: 10,
        status: 'active',
        isDemo: true,
        createdAt: '2026-10-25T10:30:00.000Z',
      },
    ],
    tasks: [
      {
        id: 'tsk_novapay_01',
        campaignId: 'cmp_novapay_01',
        title: 'Complete NovaPay Savings Vault Walkthrough (Demo)',
        instructions:
          'Start the verified watch session, wait the full 15 seconds while reviewing the sponsor showcase, and solve the server anti-bot verification prompt.',
        verificationMethod: 'server_callback',
        rewardAmountPKR: 120,
        estimatedSeconds: 15,
        active: true,
        isDemo: true,
      },
      {
        id: 'tsk_vaultkey_02',
        campaignId: 'cmp_vaultkey_02',
        title: 'Complete VaultKey Hardware 2FA Briefing (Demo)',
        instructions:
          'Review the sponsor security briefing for 12 seconds and confirm completion through the server-side callback check.',
        verificationMethod: 'server_callback',
        rewardAmountPKR: 95,
        estimatedSeconds: 12,
        active: true,
        isDemo: true,
      },
      {
        id: 'tsk_ledgerflow_03',
        campaignId: 'cmp_ledgerflow_03',
        title: 'Complete LedgerFlow SaaS Tour (Demo)',
        instructions:
          'Watch the 10-second LedgerFlow sponsor product preview and validate the server-issued completion nonce.',
        verificationMethod: 'server_callback',
        rewardAmountPKR: 85,
        estimatedSeconds: 10,
        active: true,
        isDemo: true,
      },
    ],
    task_completions: [
      {
        id: 'tc_demo_01',
        userId: demoUserId,
        userName: 'Asad Khan (Demo Member)',
        userEmail: 'member.demo@asadrewardhub.com',
        taskId: 'tsk_novapay_01',
        campaignId: 'cmp_novapay_01',
        title: 'Complete NovaPay Savings Vault Walkthrough (Demo)',
        rewardAmountPKR: 120,
        status: 'approved',
        verificationNonce: 'demo_nonce_001',
        watchedSeconds: 15,
        createdAt: '2026-11-12T10:00:00.000Z',
        reviewedAt: '2026-11-12T10:05:00.000Z',
        reviewedBy: demoAdminId,
        rejectionReason: null,
        isDemo: true,
      },
      {
        id: 'tc_demo_02',
        userId: demoUserId,
        userName: 'Asad Khan (Demo Member)',
        userEmail: 'member.demo@asadrewardhub.com',
        taskId: 'tsk_vaultkey_02',
        campaignId: 'cmp_vaultkey_02',
        title: 'Complete VaultKey Hardware 2FA Briefing (Demo)',
        rewardAmountPKR: 95,
        status: 'pending',
        verificationNonce: 'demo_nonce_002',
        watchedSeconds: 12,
        createdAt: '2026-11-13T04:15:00.000Z',
        reviewedAt: null,
        reviewedBy: null,
        rejectionReason: null,
        isDemo: true,
      },
    ],
    transactions: [
      {
        id: 'txn_demo_01',
        userId: demoUserId,
        type: 'task_reward',
        amountPKR: 120,
        status: 'completed',
        description: '[DEMO] Approved reward: NovaPay Savings Vault Walkthrough',
        referenceId: 'tc_demo_01',
        createdAt: '2026-11-12T10:05:00.000Z',
        isDemo: true,
      },
      {
        id: 'txn_demo_02',
        userId: demoUserId,
        type: 'referral_bonus',
        amountPKR: 150,
        status: 'completed',
        description: '[DEMO] Qualified referral reward for Zainab Tariq',
        referenceId: 'ref_demo_01',
        createdAt: '2026-10-22T12:00:00.000Z',
        isDemo: true,
      },
      {
        id: 'txn_demo_03',
        userId: demoUserId,
        type: 'withdrawal',
        amountPKR: -500,
        status: 'completed',
        description: '[DEMO] Paid Easypaisa withdrawal (03000000101)',
        referenceId: 'wd_demo_01',
        createdAt: '2026-11-01T15:30:00.000Z',
        isDemo: true,
      },
      {
        id: 'txn_demo_04',
        userId: demoUserId,
        type: 'task_reward',
        amountPKR: 95,
        status: 'pending',
        description: '[DEMO] Pending review: VaultKey Hardware 2FA Briefing',
        referenceId: 'tc_demo_02',
        createdAt: '2026-11-13T04:15:00.000Z',
        isDemo: true,
      },
    ],
    withdrawals: [
      {
        id: 'wd_demo_01',
        userId: demoUserId,
        userName: 'Asad Khan (Demo Member)',
        userEmail: 'member.demo@asadrewardhub.com',
        method: 'easypaisa',
        accountTitle: 'Asad Khan (Demo)',
        accountNumber: '03000000101',
        bankName: '',
        amountPKR: 500,
        status: 'paid',
        adminNote: 'Demo payout settled for testing ledger display',
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T15:30:00.000Z',
        isDemo: true,
      },
    ],
    payments: [],
    referrals: [
      {
        id: 'ref_demo_01',
        referrerId: demoUserId,
        referredUserId: demoReferredId,
        referredUserName: 'Zainab Tariq (Demo Referral)',
        referredUserEmail: 'zainab.demo@asadrewardhub.com',
        status: 'qualified',
        rewardAmountPKR: 150,
        ipHash: 'demo_hash_01',
        createdAt: '2026-10-22T11:15:00.000Z',
        isDemo: true,
      },
    ],
    notifications: [
      {
        id: 'ntf_demo_01',
        userId: demoUserId,
        title: 'Welcome to Honey & Bunny Invest (Demo)',
        message:
          'You are viewing demo member records. Register Bonus: PKR 35 · Min Deposit: PKR 300 · Min Withdraw: PKR 50.',
        category: 'system',
        read: false,
        createdAt: '2026-11-12T08:00:00.000Z',
      },
      {
        id: 'ntf_demo_02',
        userId: demoUserId,
        title: 'Task Reward Approved (+PKR 120)',
        message: '[DEMO] Your completion for NovaPay Savings Vault Walkthrough was verified and credited.',
        category: 'reward',
        read: false,
        createdAt: '2026-11-12T10:05:00.000Z',
      },
    ],
    settings: {
      minWithdrawalPKR: 50,
      referralBonusPKR: 150,
      requireEmailVerificationForWithdraw: true,
      antiBotChallengeEnabled: true,
      platformNotice:
        'Honey & Bunny Invest: Register Bonus PKR 35 · Min Deposit PKR 300 · Min Withdraw PKR 50 · Referral Commission L1 10% / L2 2% / L3 2%.',
    },
    contact_messages: [],
  };
}

export function createDefaultPlans(): PlanRecord[] {
  const specs: Array<{
    id: string;
    name: string;
    tier: PlanRecord['tier'];
    investment: number;
    dailyProfit: number;
    totalProfit: number;
    durationDays: number;
    payoutPriority: string;
  }> = [
    {
      id: 'plan_300',
      name: 'Investment 300',
      tier: 'starter',
      investment: 300,
      dailyProfit: 27,
      totalProfit: 2727,
      durationDays: 100,
      payoutPriority: 'Standard payout · Min withdraw PKR 50',
    },
    {
      id: 'plan_900',
      name: 'Investment 900',
      tier: 'basic',
      investment: 900,
      dailyProfit: 82,
      totalProfit: 8181,
      durationDays: 100,
      payoutPriority: 'Standard payout · Min withdraw PKR 50',
    },
    {
      id: 'plan_1500',
      name: 'Investment 1,500',
      tier: 'bronze',
      investment: 1500,
      dailyProfit: 136,
      totalProfit: 13635,
      durationDays: 100,
      payoutPriority: 'Priority 24-hour payout review',
    },
    {
      id: 'plan_2700',
      name: 'Investment 2,700',
      tier: 'silver',
      investment: 2700,
      dailyProfit: 245,
      totalProfit: 24543,
      durationDays: 100,
      payoutPriority: 'Priority 24-hour payout review',
    },
    {
      id: 'plan_4500',
      name: 'Investment 4,500',
      tier: 'gold',
      investment: 4500,
      dailyProfit: 409,
      totalProfit: 40905,
      durationDays: 100,
      payoutPriority: 'Fast 12-hour payout queue',
    },
    {
      id: 'plan_9000',
      name: 'Investment 9,000',
      tier: 'platinum',
      investment: 9000,
      dailyProfit: 818,
      totalProfit: 81810,
      durationDays: 100,
      payoutPriority: 'Fast 12-hour payout queue',
    },
    {
      id: 'plan_18000',
      name: 'Investment 18,000',
      tier: 'diamond',
      investment: 18000,
      dailyProfit: 1636,
      totalProfit: 163620,
      durationDays: 100,
      payoutPriority: 'Same-day payout queue',
    },
    {
      id: 'plan_36000',
      name: 'Investment 36,000',
      tier: 'elite',
      investment: 36000,
      dailyProfit: 3272,
      totalProfit: 327240,
      durationDays: 100,
      payoutPriority: 'Same-day payout queue',
    },
    {
      id: 'plan_72000',
      name: 'Investment 72,000',
      tier: 'vip',
      investment: 72000,
      dailyProfit: 6545,
      totalProfit: 654480,
      durationDays: 100,
      payoutPriority: 'Express 6-hour payout queue',
    },
    {
      id: 'plan_144000',
      name: 'Investment 144,000',
      tier: 'royal',
      investment: 144000,
      dailyProfit: 13090,
      totalProfit: 1308960,
      durationDays: 100,
      payoutPriority: 'Express 6-hour payout queue',
    },
    {
      id: 'plan_210000',
      name: 'Investment 210,000',
      tier: 'premium',
      investment: 210000,
      dailyProfit: 19089,
      totalProfit: 1908900,
      durationDays: 100,
      payoutPriority: 'Express VIP payout queue',
    },
    {
      id: 'plan_300000',
      name: 'Investment 300,000',
      tier: 'imperial',
      investment: 300000,
      dailyProfit: 27270,
      totalProfit: 2727000,
      durationDays: 100,
      payoutPriority: 'Instant VIP payout priority',
    },
    {
      id: 'plan_510000',
      name: 'Investment 510,000',
      tier: 'imperial',
      investment: 510000,
      dailyProfit: 46359,
      totalProfit: 4635900,
      durationDays: 100,
      payoutPriority: 'Instant Executive VIP priority',
    },
  ];

  return specs.map((s) => ({
    id: s.id,
    name: s.name,
    tier: s.tier,
    targetAudience: `100-Day Plan · Investment PKR ${s.investment.toLocaleString()}`,
    monthlyPricePKR: s.investment,
    billingLabel: `Daily Profit PKR ${s.dailyProfit.toLocaleString()} · Total PKR ${s.totalProfit.toLocaleString()}`,
    dailyTaskLimit: 1,
    perAdProfitPKR: s.dailyProfit,
    dailyProfitPKR: s.dailyProfit,
    totalProfitPKR: s.totalProfit,
    durationDays: s.durationDays,
    payoutPriority: s.payoutPriority,
    depositRequired: true,
    features: [
      `Daily Profit: PKR ${s.dailyProfit.toLocaleString()}`,
      `Total Profit (${s.durationDays} Days): PKR ${s.totalProfit.toLocaleString()}`,
      `Plan Duration: ${s.durationDays} Days · Minimum Withdraw PKR 50`,
      `3-Level Referral Commission: L1 10% · L2 2% · L3 2%`,
    ],
    active: true,
    isDemo: false,
  }));
}

let cachedDb: DatabaseSchema | null = null;
export const activeChallenges = new Map<string, TaskSessionChallenge>();

export function getDb(): DatabaseSchema {
  if (cachedDb) return cachedDb;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    cachedDb = createInitialSeed();
    saveDb(cachedDb);
    return cachedDb;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    cachedDb = JSON.parse(raw) as DatabaseSchema;
    let migrated = false;
    if (!Array.isArray(cachedDb.payments)) {
      cachedDb.payments = [];
      migrated = true;
    }
    if (
      !Array.isArray(cachedDb.plans) ||
      !cachedDb.plans.some((p) => p.id === 'plan_300') ||
      !cachedDb.plans.some((p) => p.id === 'plan_510000')
    ) {
      cachedDb.plans = createDefaultPlans();
      const legacyMap: Record<string, string> = {
        plan_free: 'plan_300',
        plan_590: 'plan_300',
        plan_790: 'plan_900',
        plan_premium: 'plan_1500',
        plan_1250: 'plan_1500',
        plan_2100: 'plan_2700',
        plan_3100: 'plan_4500',
        plan_5000: 'plan_4500',
        plan_15000: 'plan_18000',
        plan_21000: 'plan_18000',
        plan_vip: 'plan_36000',
        plan_30000: 'plan_36000',
      };
      for (const u of cachedDb.users) {
        if (legacyMap[u.planId]) {
          u.planId = legacyMap[u.planId];
        } else if (!cachedDb.plans.some((p) => p.id === u.planId)) {
          u.planId = 'plan_300';
        }
      }
      for (const c of cachedDb.campaigns) {
        if (c.totalBudgetPKR < 100000000) {
          c.totalBudgetPKR = 100000000;
        }
      }
      if (cachedDb.settings && cachedDb.settings.minWithdrawalPKR === 500) {
        cachedDb.settings.minWithdrawalPKR = 50;
      }
      if (cachedDb.settings) {
        cachedDb.settings.platformNotice =
          'Honey & Bunny Invest: Register Bonus PKR 35 · Min Deposit PKR 300 · Min Withdraw PKR 50 · Referral Commission L1 10% / L2 2% / L3 2%.';
      }
      migrated = true;
    }
    if (migrated) {
      saveDb(cachedDb);
    }
    return cachedDb;
  } catch {
    cachedDb = createInitialSeed();
    saveDb(cachedDb);
    return cachedDb;
  }
}

export function saveDb(db: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpFile, DB_FILE);
  cachedDb = db;
}

export function getOrCreateWallet(db: DatabaseSchema, userId: string): WalletRecord {
  let wallet = db.wallets.find((w) => w.userId === userId);
  const today = todayDateString();
  if (!wallet) {
    wallet = {
      userId,
      availableBalancePKR: 0,
      pendingBalancePKR: 0,
      totalEarnedPKR: 0,
      dailyEarnedPKR: 0,
      dailyEarnedDate: today,
      referralEarnedPKR: 0,
      totalWithdrawnPKR: 0,
      totalDepositedPKR: 0,
      updatedAt: new Date().toISOString(),
    };
    db.wallets.push(wallet);
  }
  if (typeof wallet.totalDepositedPKR !== 'number') {
    wallet.totalDepositedPKR = 0;
  }
  if (wallet.dailyEarnedDate !== today) {
    wallet.dailyEarnedDate = today;
    wallet.dailyEarnedPKR = 0;
  }
  return wallet;
}

export function ensureOwnerAccess(db: DatabaseSchema, user: UserRecord): boolean {
  if (!isOwnerEmail(user.email)) {
    return false;
  }
  let changed = false;
  if (user.role !== 'admin') {
    user.role = 'admin';
    changed = true;
  }
  if (!user.emailVerified) {
    user.emailVerified = true;
    user.verificationCode = null;
    changed = true;
  }
  const existingAdmin = db.admins.find(
    (a) => a.userId === user.id || a.email.trim().toLowerCase() === OWNER_EMAIL
  );
  if (!existingAdmin) {
    db.admins.push({
      id: generateId('adm'),
      userId: user.id,
      email: user.email,
      permissions: [
        'manage_users',
        'manage_campaigns',
        'manage_plans',
        'manage_withdrawals',
        'manage_payments',
        'manage_settings',
      ],
      createdAt: new Date().toISOString(),
    });
    changed = true;
  }
  return changed;
}

export function sanitizeUser(user: UserRecord) {
  const isOwner = isOwnerEmail(user.email);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    authProvider: user.authProvider,
    emailVerified: user.emailVerified,
    role: isOwner ? ('admin' as const) : user.role,
    isOwner,
    status: user.status,
    planId: user.planId,
    referralCode: user.referralCode,
    referredBy: user.referredBy,
    phone: user.phone,
    country: user.country,
    payoutPreferences: user.payoutPreferences,
    themePreference: user.themePreference,
    emailAlertsEnabled: user.emailAlertsEnabled,
    isDemo: user.isDemo,
    createdAt: user.createdAt,
  };
}
