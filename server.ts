import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  activeChallenges,
  DEPOSIT_RECEIVERS,
  ensureOwnerAccess,
  generateId,
  getDb,
  getOrCreateWallet,
  hashPassword,
  isOwnerEmail,
  MIN_DEPOSIT_PKR,
  PAYMENT_UPLOADS_DIR,
  REFERRAL_LEVEL_RATES,
  REGISTER_BONUS_PKR,
  sanitizeUser,
  saveDb,
  signSessionToken,
  todayDateString,
  verifyPassword,
  verifySessionToken,
} from './server/db.ts';
import type {
  CampaignRecord,
  DepositMethod,
  PaymentRecord,
  PlanRecord,
  TaskCompletionRecord,
  UserRecord,
  WithdrawalMethod,
  WithdrawalStatus,
} from './server/types.ts';

const PORT = Number(process.env.PORT || 3000);
const COOKIE_NAME = 'asad_hub_session';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '8mb' }));

// Simple sliding-window rate limiter per IP + route bucket
const rateBuckets = new Map<string, number[]>();
function rateLimit(bucket: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${bucket}:${ip}`;
    const now = Date.now();
    const history = (rateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (history.length >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
      });
      return;
    }
    history.push(now);
    rateBuckets.set(key, history);
    next();
  };
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    result[key] = val;
  }
  return result;
}

function isHttpsRequest(req: Request): boolean {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return (
    req.secure ||
    forwardedProto.includes('https') ||
    (process.env.APP_URL || '').startsWith('https://')
  );
}

function setSessionCookie(req: Request, res: Response, token: string) {
  const https = isHttpsRequest(req);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: https ? 'none' : 'lax',
    secure: https,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(req: Request, res: Response) {
  const https = isHttpsRequest(req);
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    sameSite: https ? 'none' : 'lax',
    secure: https,
  });
}

interface AuthedRequest extends Request {
  currentUser?: UserRecord;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const cookies = parseCookies(req);
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : undefined;
  const token = cookies[COOKIE_NAME] || bearer;
  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const db = getDb();
  const user = db.users.find((u) => u.id === session.uid);
  if (!user) {
    clearSessionCookie(req, res);
    res.status(401).json({ error: 'Session invalid. Please sign in again.' });
    return;
  }
  if (user.status === 'blocked') {
    clearSessionCookie(req, res);
    res.status(403).json({
      error: 'Your account has been suspended by an administrator. Contact support for review.',
    });
    return;
  }
  req.currentUser = user;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = req.currentUser;
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const db = getDb();
  if (!isOwnerEmail(user.email)) {
    res.status(403).json({ error: 'Access denied. Only the platform owner can approve or reject requests.' });
    return;
  }
  if (ensureOwnerAccess(db, user)) {
    saveDb(db);
  }
  const adminEntry = db.admins.find((a) => a.userId === user.id || a.email === user.email);
  if (user.role !== 'admin' || !adminEntry) {
    res.status(403).json({ error: 'Owner privileges required.' });
    return;
  }
  next();
}

function getUserDepositStatus(db: ReturnType<typeof getDb>, userId: string) {
  const wallet = getOrCreateWallet(db, userId);
  const userPayments = db.payments
    .filter((p) => p.userId === userId)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const approvedPayments = userPayments.filter((p) => p.status === 'APPROVED');
  const hasApprovedDeposit = approvedPayments.length > 0 || (wallet.totalDepositedPKR || 0) > 0;
  return {
    hasApprovedDeposit,
    latestPayment: userPayments[0] || null,
  };
}

function hashIp(ip: string | undefined): string {
  return crypto
    .createHash('sha256')
    .update(ip || 'local-client')
    .digest('hex')
    .slice(0, 16);
}

// Health endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Honey & Bunny Invest' });
});

// ========================
// AUTHENTICATION ENDPOINTS
// ========================

app.post('/api/auth/register', rateLimit('auth_register', 15, 60_000), (req, res) => {
  const { name, email, password, referralCode, humanCheckAnswer, humanCheckExpected } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    referralCode?: string;
    humanCheckAnswer?: number;
    humanCheckExpected?: number;
  };

  if (!name || name.trim().length < 2 || name.trim().length > 80) {
    res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
    return;
  }
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  if (!password || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }
  if (
    typeof humanCheckExpected !== 'number' ||
    typeof humanCheckAnswer !== 'number' ||
    humanCheckAnswer !== humanCheckExpected
  ) {
    res.status(400).json({ error: 'Anti-bot verification failed. Please solve the security prompt.' });
    return;
  }

  const db = getDb();
  if (db.users.some((u) => u.email.trim().toLowerCase() === normalizedEmail)) {
    res.status(409).json({
      code: 'EMAIL_ALREADY_EXISTS',
      error:
        'An account already exists for this email. Only one account is allowed per email — please sign in with your email and password to open your account and balance.',
    });
    return;
  }

  const now = new Date().toISOString();
  const userId = generateId('usr');
  const verificationCode = String(crypto.randomInt(100000, 999999));
  const cleanCodePrefix = name
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 5)
    .padEnd(3, 'X');
  const userReferralCode = `${cleanCodePrefix}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  let referredByUser: UserRecord | undefined;
  if (referralCode && referralCode.trim()) {
    referredByUser = db.users.find(
      (u) => u.referralCode.toUpperCase() === referralCode.trim().toUpperCase()
    );
  }

  const ownerSignup = isOwnerEmail(normalizedEmail);

  const newUser: UserRecord = {
    id: userId,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    authProvider: 'email',
    emailVerified: ownerSignup,
    verificationCode: ownerSignup ? null : verificationCode,
    resetCode: null,
    resetExpiresAt: null,
    role: ownerSignup ? 'admin' : 'user',
    status: 'active',
    planId: ownerSignup ? 'plan_510000' : 'plan_300',
    referralCode: userReferralCode,
    referredBy: referredByUser ? referredByUser.id : null,
    phone: '',
    country: 'Pakistan',
    payoutPreferences: {
      defaultMethod: 'easypaisa',
      accountTitle: name.trim(),
      accountNumber: '',
      bankName: '',
    },
    themePreference: 'light',
    emailAlertsEnabled: true,
    isDemo: false,
    createdAt: now,
    updatedAt: now,
  };

  db.users.push(newUser);
  if (ownerSignup) {
    ensureOwnerAccess(db, newUser);
  }
  const newWallet = getOrCreateWallet(db, userId);
  newWallet.availableBalancePKR += REGISTER_BONUS_PKR;
  newWallet.totalEarnedPKR += REGISTER_BONUS_PKR;
  newWallet.updatedAt = now;

  db.transactions.unshift({
    id: generateId('txn'),
    userId,
    type: 'register_bonus',
    amountPKR: REGISTER_BONUS_PKR,
    status: 'completed',
    description: `Welcome Register Bonus (PKR ${REGISTER_BONUS_PKR})`,
    referenceId: userId,
    createdAt: now,
    isDemo: false,
  });

  db.notifications.unshift({
    id: generateId('ntf'),
    userId,
    title: `Register Bonus Credited (+PKR ${REGISTER_BONUS_PKR})`,
    message: `Welcome to Honey & Bunny Invest! PKR ${REGISTER_BONUS_PKR} signup bonus has been added to your wallet.`,
    category: 'reward',
    read: false,
    createdAt: now,
  });

  // Track referral with anti-fraud duplicate IP check
  if (referredByUser && referredByUser.id !== userId) {
    const clientIpHash = hashIp(req.ip);
    const sameIpCount = db.referrals.filter(
      (r) => r.referrerId === referredByUser.id && r.ipHash === clientIpHash
    ).length;

    const flagged = sameIpCount >= 2;
    const rewardAmount = flagged ? 0 : db.settings.referralBonusPKR;

    const referralId = generateId('ref');
    db.referrals.push({
      id: referralId,
      referrerId: referredByUser.id,
      referredUserId: userId,
      referredUserName: newUser.name,
      referredUserEmail: newUser.email,
      status: flagged ? 'flagged' : 'registered',
      rewardAmountPKR: rewardAmount,
      ipHash: clientIpHash,
      createdAt: now,
      isDemo: false,
    });

    db.notifications.unshift({
      id: generateId('ntf'),
      userId: referredByUser.id,
      title: flagged ? 'Referral Held for Anti-Fraud Review' : 'New Referral Registered',
      message: flagged
        ? `${newUser.name} registered via your invite link and is queued for anti-fraud review.`
        : `${newUser.name} joined using your referral link. Bonus applies upon email verification and first verified task.`,
      category: 'system',
      read: false,
      createdAt: now,
    });
  }

  db.notifications.unshift({
    id: generateId('ntf'),
    userId,
    title: 'Verify Your Email Address',
    message: `Your email verification code is ${verificationCode}. Verify your account in Profile or the verification banner to unlock withdrawals.`,
    category: 'system',
    read: false,
    createdAt: now,
  });

  saveDb(db);

  const token = signSessionToken({
    uid: newUser.id,
    role: newUser.role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  setSessionCookie(req, res, token);

  res.status(201).json({
    user: sanitizeUser(newUser),
    token,
    verificationCodeHint: verificationCode,
  });
});

app.post('/api/auth/login', rateLimit('auth_login', 20, 60_000), (req, res) => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const db = getDb();
  const user = db.users.find((u) => u.email.trim().toLowerCase() === normalizedEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }
  if (user.status === 'blocked') {
    res.status(403).json({
      error: 'Account blocked by administrator. Please contact support.',
    });
    return;
  }
  if (user.role !== 'user' && !isOwnerEmail(user.email)) {
    res.status(403).json({
      error: 'Administrator login is disabled. Only user accounts can sign in.',
    });
    return;
  }

  if (ensureOwnerAccess(db, user)) {
    saveDb(db);
  }

  const token = signSessionToken({
    uid: user.id,
    role: user.role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  setSessionCookie(req, res, token);

  res.json({ user: sanitizeUser(user), token });
});

app.post('/api/auth/google-demo', rateLimit('auth_google', 15, 60_000), (req, res) => {
  const { email, name } = req.body as { email?: string; name?: string };
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    res.status(400).json({ error: 'Please select or enter a valid Google email.' });
    return;
  }

  const db = getDb();
  let user = db.users.find((u) => u.email.trim().toLowerCase() === normalizedEmail);
  const now = new Date().toISOString();

  if (user && user.authProvider === 'email') {
    res.status(403).json({
      error:
        'An account already exists on this email with a password. Please sign in using your email and password to open your balance.',
    });
    return;
  }

  if (!user) {
    const userId = generateId('usr');
    const displayName = (name || normalizedEmail.split('@')[0]).trim();
    const ownerAccount = isOwnerEmail(normalizedEmail);
    user = {
      id: userId,
      name: displayName,
      email: normalizedEmail,
      passwordHash: hashPassword(crypto.randomBytes(24).toString('hex')),
      authProvider: 'google_demo',
      emailVerified: true,
      verificationCode: null,
      resetCode: null,
      resetExpiresAt: null,
      role: ownerAccount ? 'admin' : 'user',
      status: 'active',
      planId: ownerAccount ? 'plan_510000' : 'plan_300',
      referralCode: `GGL-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      referredBy: null,
      phone: '',
      country: 'Pakistan',
      payoutPreferences: {
        defaultMethod: 'easypaisa',
        accountTitle: displayName,
        accountNumber: '',
        bankName: '',
      },
      themePreference: 'light',
      emailAlertsEnabled: true,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
    };
    db.users.push(user);
    if (ownerAccount) {
      ensureOwnerAccess(db, user);
    }
    const gWallet = getOrCreateWallet(db, userId);
    gWallet.availableBalancePKR += REGISTER_BONUS_PKR;
    gWallet.totalEarnedPKR += REGISTER_BONUS_PKR;
    gWallet.updatedAt = now;
    db.transactions.unshift({
      id: generateId('txn'),
      userId,
      type: 'register_bonus',
      amountPKR: REGISTER_BONUS_PKR,
      status: 'completed',
      description: `Welcome Register Bonus (PKR ${REGISTER_BONUS_PKR})`,
      referenceId: userId,
      createdAt: now,
      isDemo: true,
    });
    db.notifications.unshift({
      id: generateId('ntf'),
      userId,
      title: `Welcome to Honey & Bunny Invest (+PKR ${REGISTER_BONUS_PKR} Bonus)`,
      message: `PKR ${REGISTER_BONUS_PKR} register bonus has been added to your wallet.`,
      category: 'system',
      read: false,
      createdAt: now,
    });
    saveDb(db);
  } else if (user.status === 'blocked') {
    res.status(403).json({ error: 'This account has been blocked by an administrator.' });
    return;
  } else if (user.role !== 'user' && !isOwnerEmail(user.email)) {
    res.status(403).json({
      error: 'Administrator login is disabled. Only user accounts can sign in.',
    });
    return;
  } else if (ensureOwnerAccess(db, user)) {
    saveDb(db);
  }

  const token = signSessionToken({
    uid: user.id,
    role: user.role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  setSessionCookie(req, res, token);
  res.json({ user: sanitizeUser(user), token });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.post('/api/auth/verify-email', requireAuth, (req: AuthedRequest, res) => {
  const { code } = req.body as { code?: string };
  const user = req.currentUser!;
  const db = getDb();
  const dbUser = db.users.find((u) => u.id === user.id)!;

  if (dbUser.emailVerified) {
    res.json({ user: sanitizeUser(dbUser), message: 'Email is already verified.' });
    return;
  }
  if (!code || dbUser.verificationCode !== code.trim()) {
    res.status(400).json({ error: 'Invalid verification code.' });
    return;
  }

  const now = new Date().toISOString();
  dbUser.emailVerified = true;
  dbUser.verificationCode = null;
  dbUser.updatedAt = now;

  // Qualify pending referral bonus upon email verification
  if (dbUser.referredBy) {
    const refRecord = db.referrals.find(
      (r) => r.referredUserId === dbUser.id && r.status === 'registered'
    );
    if (refRecord && refRecord.rewardAmountPKR > 0) {
      refRecord.status = 'qualified';
      const refWallet = getOrCreateWallet(db, refRecord.referrerId);
      refWallet.availableBalancePKR += refRecord.rewardAmountPKR;
      refWallet.totalEarnedPKR += refRecord.rewardAmountPKR;
      refWallet.referralEarnedPKR += refRecord.rewardAmountPKR;
      refWallet.updatedAt = now;

      db.transactions.unshift({
        id: generateId('txn'),
        userId: refRecord.referrerId,
        type: 'referral_bonus',
        amountPKR: refRecord.rewardAmountPKR,
        status: 'completed',
        description: `Verified referral bonus for ${dbUser.name}`,
        referenceId: refRecord.id,
        createdAt: now,
        isDemo: false,
      });

      db.notifications.unshift({
        id: generateId('ntf'),
        userId: refRecord.referrerId,
        title: `Referral Bonus Credited (+PKR ${refRecord.rewardAmountPKR})`,
        message: `${dbUser.name} verified their email. Your referral bonus is now available.`,
        category: 'reward',
        read: false,
        createdAt: now,
      });
    }
  }

  saveDb(db);
  res.json({ user: sanitizeUser(dbUser), message: 'Email successfully verified.' });
});

app.post('/api/auth/resend-verification', requireAuth, rateLimit('resend_verify', 5, 60_000), (req: AuthedRequest, res) => {
  const db = getDb();
  const dbUser = db.users.find((u) => u.id === req.currentUser!.id)!;
  if (dbUser.emailVerified) {
    res.json({ message: 'Your email is already verified.' });
    return;
  }
  const code = String(crypto.randomInt(100000, 999999));
  dbUser.verificationCode = code;
  dbUser.updatedAt = new Date().toISOString();
  db.notifications.unshift({
    id: generateId('ntf'),
    userId: dbUser.id,
    title: 'New Email Verification Code',
    message: `Your new verification code is ${code}.`,
    category: 'system',
    read: false,
    createdAt: new Date().toISOString(),
  });
  saveDb(db);
  res.json({
    message: 'A new verification code has been issued.',
    verificationCodeHint: code,
  });
});

app.post('/api/auth/forgot-password', rateLimit('forgot_pw', 10, 60_000), (req, res) => {
  const { email } = req.body as { email?: string };
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    res.status(400).json({ error: 'Please enter your registered email address.' });
    return;
  }
  const db = getDb();
  const user = db.users.find((u) => u.email.trim().toLowerCase() === normalizedEmail);
  if (!user) {
    // Return uniform response to prevent user enumeration
    res.json({
      message: 'If an account matches that email, a 6-digit reset code has been generated.',
    });
    return;
  }
  const resetCode = String(crypto.randomInt(100000, 999999));
  user.resetCode = resetCode;
  user.resetExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  user.updatedAt = new Date().toISOString();
  saveDb(db);

  res.json({
    message: 'Reset code generated. Enter the 6-digit code below to choose a new password.',
    resetCodeHint: resetCode,
  });
});

app.post('/api/auth/reset-password', rateLimit('reset_pw', 10, 60_000), (req, res) => {
  const { email, code, newPassword } = req.body as {
    email?: string;
    code?: string;
    newPassword?: string;
  };
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail || !code || !newPassword || newPassword.length < 8) {
    res.status(400).json({
      error: 'Email, 6-digit code, and a new password (min 8 chars) are required.',
    });
    return;
  }
  const db = getDb();
  const user = db.users.find((u) => u.email.trim().toLowerCase() === normalizedEmail);
  if (
    !user ||
    !user.resetCode ||
    user.resetCode !== code.trim() ||
    !user.resetExpiresAt ||
    Date.now() > Date.parse(user.resetExpiresAt)
  ) {
    res.status(400).json({ error: 'Invalid or expired password reset code.' });
    return;
  }

  user.passwordHash = hashPassword(newPassword);
  user.resetCode = null;
  user.resetExpiresAt = null;
  user.updatedAt = new Date().toISOString();
  saveDb(db);

  res.json({ message: 'Password updated successfully. You can now sign in.' });
});

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const user = req.currentUser!;
  if (ensureOwnerAccess(db, user)) {
    saveDb(db);
  }
  const wallet = getOrCreateWallet(db, user.id);
  const plan = db.plans.find((p) => p.id === user.planId) || db.plans[0];
  const unreadNotifications = db.notifications.filter((n) => n.userId === user.id && !n.read).length;
  const depositStatus = getUserDepositStatus(db, user.id);

  res.json({
    user: sanitizeUser(user),
    wallet,
    plan,
    unreadNotifications,
    hasApprovedDeposit: depositStatus.hasApprovedDeposit,
    latestPayment: depositStatus.latestPayment,
    settings: db.settings,
  });
});

app.post('/api/contact', rateLimit('contact', 10, 60_000), (req, res) => {
  const { name, email, subject, message } = req.body as {
    name?: string;
    email?: string;
    subject?: string;
    message?: string;
  };
  if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
    res.status(400).json({ error: 'All contact fields are required.' });
    return;
  }
  const db = getDb();
  db.contact_messages.unshift({
    id: generateId('msg'),
    name: name.trim().slice(0, 100),
    email: email.trim().slice(0, 120),
    subject: subject.trim().slice(0, 150),
    message: message.trim().slice(0, 2000),
    createdAt: new Date().toISOString(),
  });
  saveDb(db);
  res.status(201).json({ message: 'Your support message has been received.' });
});

// ========================
// PROTECTED MEMBER ROUTES
// ========================

app.get('/api/dashboard', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const user = req.currentUser!;
  const wallet = getOrCreateWallet(db, user.id);
  const plan = db.plans.find((p) => p.id === user.planId) || db.plans[0];
  const userCompletions = db.task_completions.filter((c) => c.userId === user.id);
  const approvedTasksCount = userCompletions.filter((c) => c.status === 'approved').length;
  const pendingTasksCount = userCompletions.filter((c) => c.status === 'pending').length;
  const today = todayDateString();
  const tasksCompletedToday = userCompletions.filter(
    (c) => c.createdAt.slice(0, 10) === today && c.status !== 'rejected'
  ).length;
  const recentTransactions = db.transactions
    .filter((t) => t.userId === user.id)
    .slice(0, 6);
  const recentNotifications = db.notifications
    .filter((n) => n.userId === user.id)
    .slice(0, 5);
  const activeCampaignsCount = db.campaigns.filter((c) => c.status === 'active').length;
  const depositStatus = getUserDepositStatus(db, user.id);

  res.json({
    user: sanitizeUser(user),
    wallet,
    plan,
    hasApprovedDeposit: depositStatus.hasApprovedDeposit,
    latestPayment: depositStatus.latestPayment,
    stats: {
      totalBalancePKR: wallet.availableBalancePKR + wallet.pendingBalancePKR,
      availableBalancePKR: wallet.availableBalancePKR,
      pendingRewardsPKR: wallet.pendingBalancePKR,
      totalTasksCompleted: approvedTasksCount,
      pendingTasksCount,
      tasksCompletedToday,
      dailyTaskLimit: plan.dailyTaskLimit,
      dailyRewardsPKR: wallet.dailyEarnedPKR,
      referralEarningsPKR: wallet.referralEarnedPKR,
      activeCampaignsCount,
    },
    recentTransactions,
    recentNotifications,
    platformNotice: db.settings.platformNotice,
  });
});

app.get('/api/plans', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const user = req.currentUser!;
  const wallet = getOrCreateWallet(db, user.id);
  res.json({
    plans: db.plans.filter((p) => p.active),
    currentPlanId: user.planId,
    totalDepositedPKR: wallet.totalDepositedPKR,
    availableBalancePKR: wallet.availableBalancePKR,
  });
});

app.post('/api/plans/select', requireAuth, (req: AuthedRequest, res) => {
  const { planId } = req.body as { planId?: string };
  const db = getDb();
  const plan = db.plans.find((p) => p.id === planId && p.active);
  if (!plan) {
    res.status(404).json({ error: 'Selected plan not found.' });
    return;
  }
  const dbUser = db.users.find((u) => u.id === req.currentUser!.id)!;
  const wallet = getOrCreateWallet(db, dbUser.id);
  const coveredAmount = wallet.totalDepositedPKR || 0;
  if (!isOwnerEmail(dbUser.email) && coveredAmount < plan.monthlyPricePKR) {
    res.status(403).json({
      error: `Deposit at least PKR ${plan.monthlyPricePKR.toLocaleString()} via Easypaisa or JazzCash and wait for owner approval to activate ${plan.name}.`,
    });
    return;
  }

  dbUser.planId = plan.id;
  dbUser.updatedAt = new Date().toISOString();

  db.notifications.unshift({
    id: generateId('ntf'),
    userId: dbUser.id,
    title: `Plan Activated: ${plan.name}`,
    message: `Your account is now on ${plan.name} (PKR ${plan.perAdProfitPKR}/ad · up to PKR ${plan.dailyProfitPKR.toLocaleString()}/day across ${plan.dailyTaskLimit} ads).`,
    category: 'system',
    read: false,
    createdAt: new Date().toISOString(),
  });

  saveDb(db);
  res.json({ user: sanitizeUser(dbUser), plan });
});

app.get('/api/tasks', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const user = req.currentUser!;
  const today = todayDateString();
  const plan = db.plans.find((p) => p.id === user.planId) || db.plans[0];
  const depositStatus = getUserDepositStatus(db, user.id);
  const canViewAds = depositStatus.hasApprovedDeposit || isOwnerEmail(user.email);

  const userCompletions = db.task_completions.filter((c) => c.userId === user.id);
  const completedTodayCount = userCompletions.filter(
    (c) => c.createdAt.slice(0, 10) === today && c.status !== 'rejected'
  ).length;

  const effectiveRewardPKR = plan.perAdProfitPKR > 0 ? plan.perAdProfitPKR : 50;

  const items = !canViewAds
    ? []
    : db.tasks
        .filter((t) => t.active)
        .map((task) => {
          const campaign = db.campaigns.find((c) => c.id === task.campaignId);
          if (!campaign || campaign.status !== 'active') return null;

          const todaySubmissions = userCompletions.filter(
            (c) =>
              c.taskId === task.id && c.createdAt.slice(0, 10) === today && c.status !== 'rejected'
          ).length;
          const remainingBudget = Math.max(0, campaign.totalBudgetPKR - campaign.spentBudgetPKR);
          const effectiveDailyCap = Math.max(campaign.dailyCap, plan.dailyTaskLimit);
          const canComplete =
            todaySubmissions < effectiveDailyCap &&
            completedTodayCount < plan.dailyTaskLimit &&
            remainingBudget >= effectiveRewardPKR;

          return {
            task,
            campaign,
            effectiveRewardPKR,
            todaySubmissions,
            canComplete,
            remainingBudget,
          };
        })
        .filter(Boolean);

  res.json({
    items,
    activePlan: plan,
    depositRequired: !canViewAds,
    hasApprovedDeposit: depositStatus.hasApprovedDeposit,
    latestPayment: depositStatus.latestPayment,
    completedTodayCount,
    dailyTaskLimit: plan.dailyTaskLimit,
    completions: userCompletions.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  });
});

app.post('/api/tasks/:taskId/start', requireAuth, rateLimit('task_start', 20, 60_000), (req: AuthedRequest, res) => {
  const { taskId } = req.params;
  const db = getDb();
  const user = req.currentUser!;
  const depositStatus = getUserDepositStatus(db, user.id);
  if (!depositStatus.hasApprovedDeposit && !isOwnerEmail(user.email)) {
    res.status(403).json({
      error: 'Deposit required first. Submit your Easypaisa or JazzCash deposit and wait for approval before opening ads.',
    });
    return;
  }
  const task = db.tasks.find((t) => t.id === taskId && t.active);
  if (!task) {
    res.status(404).json({ error: 'Task not found or inactive.' });
    return;
  }
  const campaign = db.campaigns.find((c) => c.id === task.campaignId && c.status === 'active');
  if (!campaign) {
    res.status(400).json({ error: 'Sponsor campaign is currently paused or completed.' });
    return;
  }
  const today = todayDateString();
  const plan = db.plans.find((p) => p.id === user.planId) || db.plans[0];
  const authoritativeReward = plan.perAdProfitPKR > 0 ? plan.perAdProfitPKR : campaign.rewardAmountPKR;

  if (campaign.totalBudgetPKR - campaign.spentBudgetPKR < authoritativeReward) {
    res.status(400).json({ error: 'Campaign reward budget has been exhausted.' });
    return;
  }

  const userCompletions = db.task_completions.filter((c) => c.userId === user.id);
  const completedTodayCount = userCompletions.filter(
    (c) => c.createdAt.slice(0, 10) === today && c.status !== 'rejected'
  ).length;
  if (completedTodayCount >= plan.dailyTaskLimit) {
    res.status(400).json({ error: `Daily task limit (${plan.dailyTaskLimit}) reached for today.` });
    return;
  }
  const taskTodayCount = userCompletions.filter(
    (c) => c.taskId === task.id && c.createdAt.slice(0, 10) === today && c.status !== 'rejected'
  ).length;
  const effectiveDailyCap = Math.max(campaign.dailyCap, plan.dailyTaskLimit);
  if (taskTodayCount >= effectiveDailyCap) {
    res.status(409).json({
      error: 'Daily cap reached for this sponsor campaign today.',
    });
    return;
  }

  const a = crypto.randomInt(2, 12);
  const b = crypto.randomInt(2, 9);
  const nonce = crypto.randomBytes(12).toString('hex');

  activeChallenges.set(nonce, {
    nonce,
    userId: user.id,
    taskId: task.id,
    campaignId: campaign.id,
    requiredSeconds: campaign.durationSeconds,
    challengePrompt: `Verify human completion: What is ${a} + ${b}?`,
    expectedAnswer: a + b,
    issuedAt: Date.now(),
    used: false,
  });

  res.json({
    nonce,
    requiredSeconds: campaign.durationSeconds,
    challengePrompt: `Verify human completion: What is ${a} + ${b}?`,
    rewardAmountPKR: authoritativeReward,
  });
});

app.post('/api/tasks/:taskId/complete', requireAuth, rateLimit('task_complete', 20, 60_000), (req: AuthedRequest, res) => {
  const { taskId } = req.params;
  const { nonce, answer } = req.body as { nonce?: string; answer?: number };
  const user = req.currentUser!;

  if (!nonce || !activeChallenges.has(nonce)) {
    res.status(400).json({ error: 'Invalid or expired server verification session.' });
    return;
  }

  const challenge = activeChallenges.get(nonce)!;
  if (challenge.used || challenge.userId !== user.id || challenge.taskId !== taskId) {
    res.status(403).json({ error: 'Verification token mismatch or already redeemed.' });
    return;
  }

  const elapsedSeconds = Math.floor((Date.now() - challenge.issuedAt) / 1000);
  if (elapsedSeconds < challenge.requiredSeconds) {
    res.status(400).json({
      error: `Sponsor watch duration not met (${elapsedSeconds}s / ${challenge.requiredSeconds}s required).`,
    });
    return;
  }

  if (Number(answer) !== challenge.expectedAnswer) {
    res.status(400).json({ error: 'Anti-bot verification answer was incorrect.' });
    return;
  }

  const db = getDb();
  if (!getUserDepositStatus(db, user.id).hasApprovedDeposit && !isOwnerEmail(user.email)) {
    res.status(403).json({
      error: 'Deposit required first. Submit your Easypaisa or JazzCash deposit and wait for approval before opening ads.',
    });
    return;
  }
  const task = db.tasks.find((t) => t.id === taskId && t.active);
  const campaign = db.campaigns.find((c) => c.id === challenge.campaignId && c.status === 'active');
  if (!task || !campaign) {
    res.status(400).json({ error: 'Task or campaign is no longer active.' });
    return;
  }

  const today = todayDateString();
  const plan = db.plans.find((p) => p.id === user.planId) || db.plans[0];
  const completedTodayCount = db.task_completions.filter(
    (c) => c.userId === user.id && c.createdAt.slice(0, 10) === today && c.status !== 'rejected'
  ).length;
  if (completedTodayCount >= plan.dailyTaskLimit) {
    res.status(409).json({ error: `Daily ad limit (${plan.dailyTaskLimit}) reached for your plan.` });
    return;
  }

  // Mark nonce consumed immediately before mutating balances
  challenge.used = true;
  activeChallenges.delete(nonce);

  // Server computes reward strictly from user's active plan & authoritative campaign record (never browser input)
  const authoritativeReward = plan.perAdProfitPKR > 0 ? plan.perAdProfitPKR : campaign.rewardAmountPKR;
  const now = new Date().toISOString();
  const completionId = generateId('tc');

  const completion: TaskCompletionRecord = {
    id: completionId,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    taskId: task.id,
    campaignId: campaign.id,
    title: task.title,
    rewardAmountPKR: authoritativeReward,
    status: 'pending',
    verificationNonce: nonce,
    watchedSeconds: elapsedSeconds,
    createdAt: now,
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
    isDemo: campaign.isDemo,
  };

  db.task_completions.unshift(completion);
  campaign.spentBudgetPKR += authoritativeReward;

  const wallet = getOrCreateWallet(db, user.id);
  wallet.pendingBalancePKR += authoritativeReward;
  wallet.updatedAt = now;

  db.transactions.unshift({
    id: generateId('txn'),
    userId: user.id,
    type: 'task_reward',
    amountPKR: authoritativeReward,
    status: 'pending',
    description: `Pending verification: ${campaign.title}`,
    referenceId: completionId,
    createdAt: now,
    isDemo: campaign.isDemo,
  });

  db.notifications.unshift({
    id: generateId('ntf'),
    userId: user.id,
    title: `Task Submitted (+PKR ${authoritativeReward} Pending)`,
    message: `Your server callback for "${campaign.title}" passed anti-bot verification and is queued for reward approval.`,
    category: 'reward',
    read: false,
    createdAt: now,
  });

  saveDb(db);
  res.status(201).json({ completion, wallet });
});

app.get('/api/rewards', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const user = req.currentUser!;
  const wallet = getOrCreateWallet(db, user.id);
  const completions = db.task_completions
    .filter((c) => c.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({ wallet, completions });
});

app.get('/api/wallet', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const user = req.currentUser!;
  const wallet = getOrCreateWallet(db, user.id);
  const transactions = db.transactions
    .filter((t) => t.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({ wallet, transactions });
});

app.get('/api/withdrawals', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const user = req.currentUser!;
  const wallet = getOrCreateWallet(db, user.id);
  const withdrawals = db.withdrawals
    .filter((w) => w.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({
    wallet,
    withdrawals,
    minWithdrawalPKR: db.settings.minWithdrawalPKR,
    requireEmailVerificationForWithdraw: db.settings.requireEmailVerificationForWithdraw,
  });
});

app.post('/api/withdrawals', requireAuth, rateLimit('withdraw', 10, 60_000), (req: AuthedRequest, res) => {
  const { method, accountTitle, accountNumber, bankName, amountPKR } = req.body as {
    method?: WithdrawalMethod;
    accountTitle?: string;
    accountNumber?: string;
    bankName?: string;
    amountPKR?: number;
  };

  const db = getDb();
  const user = db.users.find((u) => u.id === req.currentUser!.id)!;

  if (db.settings.requireEmailVerificationForWithdraw && !user.emailVerified) {
    res.status(403).json({
      error: 'Please verify your email address before submitting a withdrawal request.',
    });
    return;
  }

  if (method !== 'easypaisa' && method !== 'jazzcash' && method !== 'bank_transfer') {
    res.status(400).json({ error: 'Select Easypaisa, JazzCash, or Bank Transfer.' });
    return;
  }
  if (!accountTitle || accountTitle.trim().length < 2) {
    res.status(400).json({ error: 'Account holder title is required.' });
    return;
  }
  if (!accountNumber || accountNumber.trim().length < 7) {
    res.status(400).json({ error: 'Valid account number or IBAN is required.' });
    return;
  }
  if (method === 'bank_transfer' && (!bankName || bankName.trim().length < 2)) {
    res.status(400).json({ error: 'Bank name is required for bank transfers.' });
    return;
  }

  const numericAmount = Math.floor(Number(amountPKR));
  if (!Number.isFinite(numericAmount) || numericAmount < db.settings.minWithdrawalPKR) {
    res.status(400).json({
      error: `Minimum withdrawal is PKR ${db.settings.minWithdrawalPKR}.`,
    });
    return;
  }

  const wallet = getOrCreateWallet(db, user.id);
  if (numericAmount > wallet.availableBalancePKR) {
    res.status(400).json({
      error: `Insufficient available balance (PKR ${wallet.availableBalancePKR} available).`,
    });
    return;
  }

  const now = new Date().toISOString();
  const withdrawalId = generateId('wd');

  // Deduct server-side available balance atomically
  wallet.availableBalancePKR -= numericAmount;
  wallet.updatedAt = now;

  const withdrawal = {
    id: withdrawalId,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    method,
    accountTitle: accountTitle.trim().slice(0, 100),
    accountNumber: accountNumber.trim().slice(0, 40),
    bankName: method === 'bank_transfer' ? (bankName || '').trim().slice(0, 80) : '',
    amountPKR: numericAmount,
    status: 'pending' as WithdrawalStatus,
    adminNote: 'Queued for finance verification',
    createdAt: now,
    updatedAt: now,
    isDemo: user.isDemo,
  };

  db.withdrawals.unshift(withdrawal);
  db.transactions.unshift({
    id: generateId('txn'),
    userId: user.id,
    type: 'withdrawal',
    amountPKR: -numericAmount,
    status: 'pending',
    description: `Withdrawal request via ${method.replace('_', ' ')} (${withdrawal.accountNumber})`,
    referenceId: withdrawalId,
    createdAt: now,
    isDemo: user.isDemo,
  });

  db.notifications.unshift({
    id: generateId('ntf'),
    userId: user.id,
    title: `Withdrawal Requested (PKR ${numericAmount})`,
    message: `Your ${method.replace('_', ' ')} withdrawal request is pending administrator approval.`,
    category: 'withdrawal',
    read: false,
    createdAt: now,
  });

  saveDb(db);
  res.status(201).json({ withdrawal, wallet });
});

// ========================
// EASYPAISA & JAZZCASH PAYMENT & SCREENSHOT UPLOAD ROUTES
// ========================

function parseAndValidateScreenshot(dataUrl: string): {
  buffer: Buffer;
  mimeType: string;
  extension: string;
} | null {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl.trim()
  );
  if (!match) return null;
  const rawMime = match[1].toLowerCase();
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, 'base64');

  // Enforce max 4MB binary image size
  if (buffer.length < 64 || buffer.length > 4 * 1024 * 1024) {
    return null;
  }

  // Verify magic bytes so non-image payloads cannot be disguised
  const isPng =
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isWebp =
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  if (rawMime === 'image/png' && isPng) {
    return { buffer, mimeType: 'image/png', extension: 'png' };
  }
  if ((rawMime === 'image/jpeg' || rawMime === 'image/jpg') && isJpeg) {
    return { buffer, mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (rawMime === 'image/webp' && isWebp) {
    return { buffer, mimeType: 'image/webp', extension: 'webp' };
  }
  return null;
}

app.get('/api/payments', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const user = req.currentUser!;
  const wallet = getOrCreateWallet(db, user.id);
  const payments = db.payments
    .filter((p) => p.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({
    receivers: DEPOSIT_RECEIVERS,
    receiver: DEPOSIT_RECEIVERS[0],
    wallet,
    payments,
  });
});

app.post('/api/payments', requireAuth, rateLimit('payment_submit', 10, 60_000), (req: AuthedRequest, res) => {
  const { method, amountPKR, transactionId, screenshotDataUrl, note } = req.body as {
    method?: DepositMethod | string;
    amountPKR?: number;
    transactionId?: string;
    screenshotDataUrl?: string;
    note?: string;
  };

  const normalizedMethodInput = (method || 'Easypaisa').toString().trim().toLowerCase();
  const selectedReceiver = DEPOSIT_RECEIVERS.find(
    (r) => r.method.toLowerCase() === normalizedMethodInput
  );
  if (!selectedReceiver) {
    res.status(400).json({ error: 'Select Easypaisa or JazzCash as your deposit method.' });
    return;
  }

  const numericAmount = Math.floor(Number(amountPKR));
  if (!Number.isFinite(numericAmount) || numericAmount < MIN_DEPOSIT_PKR || numericAmount > 5000000) {
    res.status(400).json({
      error: `Minimum deposit is PKR ${MIN_DEPOSIT_PKR}. Enter an amount between PKR ${MIN_DEPOSIT_PKR} and PKR 5,000,000.`,
    });
    return;
  }

  const cleanTxId = (transactionId || '').trim();
  if (!/^[a-zA-Z0-9_-]{6,40}$/.test(cleanTxId)) {
    res.status(400).json({
      error: `Enter a valid ${selectedReceiver.method} Transaction ID (6 to 40 letters or digits).`,
    });
    return;
  }

  if (!screenshotDataUrl || typeof screenshotDataUrl !== 'string') {
    res.status(400).json({ error: 'Payment screenshot upload is required.' });
    return;
  }

  const parsedImage = parseAndValidateScreenshot(screenshotDataUrl);
  if (!parsedImage) {
    res.status(400).json({
      error: 'Invalid screenshot file. Upload a valid PNG, JPG, or WEBP image under 4MB.',
    });
    return;
  }

  const db = getDb();
  const user = db.users.find((u) => u.id === req.currentUser!.id)!;

  // Prevent duplicate submission of an already pending or approved Transaction ID
  const duplicateTx = db.payments.some(
    (p) => p.transactionId.toLowerCase() === cleanTxId.toLowerCase() && p.status !== 'REJECTED'
  );
  if (duplicateTx) {
    res.status(409).json({
      error: `This ${selectedReceiver.method} Transaction ID has already been submitted.`,
    });
    return;
  }

  if (!fs.existsSync(PAYMENT_UPLOADS_DIR)) {
    fs.mkdirSync(PAYMENT_UPLOADS_DIR, { recursive: true });
  }

  const paymentId = generateId('pay');
  const screenshotFileName = `${paymentId}.${parsedImage.extension}`;
  const filePath = path.join(PAYMENT_UPLOADS_DIR, screenshotFileName);
  fs.writeFileSync(filePath, parsedImage.buffer);

  const now = new Date().toISOString();
  const payment: PaymentRecord = {
    id: paymentId,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    method: selectedReceiver.method,
    receiverAccountNumber: selectedReceiver.accountNumber,
    receiverAccountHolder: selectedReceiver.accountHolderName,
    amountPKR: numericAmount,
    transactionId: cleanTxId,
    screenshotFileName,
    screenshotMimeType: parsedImage.mimeType,
    note: (note || '').trim().slice(0, 200),
    status: 'PENDING',
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
    isDemo: false,
  };

  // Never add wallet balance upon screenshot upload; wait strictly for admin approval
  db.payments.unshift(payment);
  db.notifications.unshift({
    id: generateId('ntf'),
    userId: user.id,
    title: `${selectedReceiver.method} Payment Submitted (PKR ${numericAmount})`,
    message: `Payment TxID ${cleanTxId} is PENDING admin verification. Wallet balance updates only after approval.`,
    category: 'system',
    read: false,
    createdAt: now,
  });

  saveDb(db);
  res.status(201).json({
    payment,
    message: 'Your payment request has been submitted successfully. Please wait for admin verification.',
  });
});

app.get('/api/payments/:id/screenshot', requireAuth, (req: AuthedRequest, res) => {
  const { id } = req.params;
  const db = getDb();
  const payment = db.payments.find((p) => p.id === id);
  if (!payment) {
    res.status(404).json({ error: 'Payment record not found.' });
    return;
  }

  const user = req.currentUser!;
  if (payment.userId !== user.id && user.role !== 'admin') {
    res.status(403).json({ error: 'Unauthorized screenshot access.' });
    return;
  }

  const safeName = path.basename(payment.screenshotFileName);
  const filePath = path.join(PAYMENT_UPLOADS_DIR, safeName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Screenshot file not found on server.' });
    return;
  }

  res.setHeader('Content-Type', payment.screenshotMimeType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(filePath);
});

app.get('/api/referrals', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const user = req.currentUser!;
  const referrals = db.referrals
    .filter((r) => r.referrerId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const wallet = getOrCreateWallet(db, user.id);

  res.json({
    referralCode: user.referralCode,
    referralBonusPKR: db.settings.referralBonusPKR,
    totalReferred: referrals.length,
    qualifiedCount: referrals.filter((r) => r.status === 'qualified').length,
    referralEarnedPKR: wallet.referralEarnedPKR,
    referrals,
  });
});

app.get('/api/notifications', requireAuth, (req: AuthedRequest, res) => {
  const db = getDb();
  const notifications = db.notifications
    .filter((n) => n.userId === req.currentUser!.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ notifications });
});

app.post('/api/notifications/read', requireAuth, (req: AuthedRequest, res) => {
  const { notificationId } = req.body as { notificationId?: string };
  const db = getDb();
  for (const n of db.notifications) {
    if (n.userId === req.currentUser!.id && (!notificationId || n.id === notificationId)) {
      n.read = true;
    }
  }
  saveDb(db);
  res.json({ ok: true });
});

app.patch('/api/profile', requireAuth, (req: AuthedRequest, res) => {
  const {
    name,
    phone,
    country,
    payoutPreferences,
    themePreference,
    emailAlertsEnabled,
    currentPassword,
    newPassword,
  } = req.body as {
    name?: string;
    phone?: string;
    country?: string;
    payoutPreferences?: UserRecord['payoutPreferences'];
    themePreference?: 'light' | 'dark';
    emailAlertsEnabled?: boolean;
    currentPassword?: string;
    newPassword?: string;
  };

  const db = getDb();
  const user = db.users.find((u) => u.id === req.currentUser!.id)!;

  if (name !== undefined) {
    if (name.trim().length < 2) {
      res.status(400).json({ error: 'Name must be at least 2 characters.' });
      return;
    }
    user.name = name.trim().slice(0, 80);
  }
  if (phone !== undefined) user.phone = phone.trim().slice(0, 30);
  if (country !== undefined) user.country = country.trim().slice(0, 60);
  if (themePreference === 'light' || themePreference === 'dark') {
    user.themePreference = themePreference;
  }
  if (typeof emailAlertsEnabled === 'boolean') {
    user.emailAlertsEnabled = emailAlertsEnabled;
  }
  if (payoutPreferences) {
    user.payoutPreferences = {
      defaultMethod: payoutPreferences.defaultMethod || user.payoutPreferences.defaultMethod,
      accountTitle: (payoutPreferences.accountTitle || '').trim().slice(0, 100),
      accountNumber: (payoutPreferences.accountNumber || '').trim().slice(0, 40),
      bankName: (payoutPreferences.bankName || '').trim().slice(0, 80),
    };
  }

  if (newPassword) {
    if (!currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
      res.status(400).json({ error: 'Current password is incorrect.' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }
    user.passwordHash = hashPassword(newPassword);
  }

  user.updatedAt = new Date().toISOString();
  saveDb(db);
  res.json({ user: sanitizeUser(user) });
});

// ========================
// ADMIN RBAC ENDPOINTS
// ========================

app.get('/api/admin/overview', requireAuth, requireAdmin, (_req, res) => {
  const db = getDb();
  const totalBudgetPKR = db.campaigns.reduce((sum, c) => sum + c.totalBudgetPKR, 0);
  const totalSpentPKR = db.campaigns.reduce((sum, c) => sum + c.spentBudgetPKR, 0);
  const totalPaidWithdrawalsPKR = db.withdrawals
    .filter((w) => w.status === 'paid')
    .reduce((sum, w) => sum + w.amountPKR, 0);
  const pendingWithdrawalsCount = db.withdrawals.filter((w) => w.status === 'pending').length;
  const pendingCompletionsCount = db.task_completions.filter((c) => c.status === 'pending').length;
  const pendingPaymentsCount = db.payments.filter((p) => p.status === 'PENDING').length;

  res.json({
    stats: {
      totalUsers: db.users.length,
      activeUsers: db.users.filter((u) => u.status === 'active').length,
      blockedUsers: db.users.filter((u) => u.status === 'blocked').length,
      activeCampaigns: db.campaigns.filter((c) => c.status === 'active').length,
      totalBudgetPKR,
      totalSpentPKR,
      totalPaidWithdrawalsPKR,
      pendingWithdrawalsCount,
      pendingCompletionsCount,
      pendingPaymentsCount,
      totalReferrals: db.referrals.length,
    },
    users: db.users.map((u) => ({
      ...sanitizeUser(u),
      wallet: getOrCreateWallet(db, u.id),
    })),
    plans: db.plans,
    campaigns: db.campaigns,
    tasks: db.tasks,
    completions: db.task_completions,
    withdrawals: db.withdrawals,
    payments: db.payments,
    transactions: db.transactions.slice(0, 100),
    referrals: db.referrals,
    settings: db.settings,
    contactMessages: db.contact_messages,
  });
});

app.patch('/api/admin/users/:userId/status', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
  const { userId } = req.params;
  const { status } = req.body as { status?: 'active' | 'blocked' };
  if (status !== 'active' && status !== 'blocked') {
    res.status(400).json({ error: 'Invalid status.' });
    return;
  }
  if (userId === req.currentUser!.id) {
    res.status(400).json({ error: 'You cannot block your own administrator account.' });
    return;
  }
  const db = getDb();
  const target = db.users.find((u) => u.id === userId);
  if (!target) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  target.status = status;
  target.updatedAt = new Date().toISOString();
  saveDb(db);
  res.json({ user: sanitizeUser(target) });
});

app.post('/api/admin/campaigns', requireAuth, requireAdmin, (req, res) => {
  const {
    title,
    sponsorName,
    category,
    providerName,
    complianceNote,
    description,
    imageUrl,
    rewardAmountPKR,
    totalBudgetPKR,
    dailyCap,
    durationSeconds,
  } = req.body as Partial<CampaignRecord>;

  if (!title?.trim() || !sponsorName?.trim() || !description?.trim()) {
    res.status(400).json({ error: 'Title, sponsor name, and description are required.' });
    return;
  }
  const reward = Math.max(5, Math.floor(Number(rewardAmountPKR || 50)));
  const budget = Math.max(reward, Math.floor(Number(totalBudgetPKR || 10000)));
  const duration = Math.max(5, Math.floor(Number(durationSeconds || 10)));
  const cap = Math.max(1, Math.floor(Number(dailyCap || 1)));
  const now = new Date().toISOString();
  const campaignId = generateId('cmp');
  const taskId = generateId('tsk');

  const db = getDb();
  const campaign: CampaignRecord = {
    id: campaignId,
    title: title.trim(),
    sponsorName: sponsorName.trim(),
    category: (category || 'Direct Sponsor').trim(),
    providerName: (providerName || 'Direct Brand Sponsor (Reward-Permitted)').trim(),
    complianceNote: (
      complianceNote ||
      'Sponsor-permitted direct task. Never uses Google/YouTube ad clicks or artificial views.'
    ).trim(),
    description: description.trim(),
    imageUrl: imageUrl?.trim() || '/src/assets/images/campaign_fintech_app_1794576037534.jpg',
    sponsorVideoUrl: `https://sponsor.asadrewardhub.demo/${campaignId}`,
    rewardAmountPKR: reward,
    totalBudgetPKR: budget,
    spentBudgetPKR: 0,
    dailyCap: cap,
    durationSeconds: duration,
    status: 'active',
    isDemo: false,
    createdAt: now,
  };

  db.campaigns.unshift(campaign);
  db.tasks.unshift({
    id: taskId,
    campaignId,
    title: `${campaign.title}`,
    instructions: `Watch the ${duration}-second sponsor presentation and complete server-side anti-bot verification.`,
    verificationMethod: 'server_callback',
    rewardAmountPKR: reward,
    estimatedSeconds: duration,
    active: true,
    isDemo: false,
  });

  saveDb(db);
  res.status(201).json({ campaign });
});

app.patch('/api/admin/campaigns/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status, rewardAmountPKR, totalBudgetPKR, title } = req.body as Partial<CampaignRecord>;
  const db = getDb();
  const campaign = db.campaigns.find((c) => c.id === id);
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found.' });
    return;
  }
  if (status === 'active' || status === 'paused' || status === 'completed') {
    campaign.status = status;
  }
  if (title?.trim()) campaign.title = title.trim();
  if (rewardAmountPKR !== undefined && Number(rewardAmountPKR) >= 5) {
    campaign.rewardAmountPKR = Math.floor(Number(rewardAmountPKR));
    for (const task of db.tasks) {
      if (task.campaignId === campaign.id) {
        task.rewardAmountPKR = campaign.rewardAmountPKR;
      }
    }
  }
  if (totalBudgetPKR !== undefined && Number(totalBudgetPKR) >= campaign.spentBudgetPKR) {
    campaign.totalBudgetPKR = Math.floor(Number(totalBudgetPKR));
  }
  saveDb(db);
  res.json({ campaign });
});

app.patch('/api/admin/plans/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const {
    monthlyPricePKR,
    dailyTaskLimit,
    perAdProfitPKR,
    durationDays,
    totalProfitPKR,
    payoutPriority,
    features,
    active,
  } = req.body as Partial<PlanRecord>;
  const db = getDb();
  const plan = db.plans.find((p) => p.id === id);
  if (!plan) {
    res.status(404).json({ error: 'Plan not found.' });
    return;
  }
  if (monthlyPricePKR !== undefined && Number(monthlyPricePKR) >= 0) {
    plan.monthlyPricePKR = Math.floor(Number(monthlyPricePKR));
  }
  if (dailyTaskLimit !== undefined && Number(dailyTaskLimit) >= 1) {
    plan.dailyTaskLimit = Math.floor(Number(dailyTaskLimit));
  }
  if (perAdProfitPKR !== undefined && Number(perAdProfitPKR) >= 1) {
    plan.perAdProfitPKR = Math.floor(Number(perAdProfitPKR));
  }
  if (durationDays !== undefined && Number(durationDays) >= 1) {
    plan.durationDays = Math.floor(Number(durationDays));
  }
  plan.dailyProfitPKR = plan.dailyTaskLimit * (plan.perAdProfitPKR || 0);
  if (totalProfitPKR !== undefined && Number(totalProfitPKR) >= 0) {
    plan.totalProfitPKR = Math.floor(Number(totalProfitPKR));
  } else {
    plan.totalProfitPKR = plan.dailyProfitPKR * (plan.durationDays || 100);
  }
  plan.billingLabel = `Daily Profit PKR ${plan.dailyProfitPKR.toLocaleString()} · Total PKR ${plan.totalProfitPKR.toLocaleString()}`;

  if (payoutPriority?.trim()) plan.payoutPriority = payoutPriority.trim();
  if (Array.isArray(features) && features.length > 0) {
    plan.features = features.map((f) => String(f).trim()).filter(Boolean);
  }
  if (typeof active === 'boolean') {
    plan.active = active;
  }
  saveDb(db);
  res.json({ plan });
});

app.patch('/api/admin/completions/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body as {
    status?: 'approved' | 'rejected';
    rejectionReason?: string;
  };
  if (status !== 'approved' && status !== 'rejected') {
    res.status(400).json({ error: 'Status must be approved or rejected.' });
    return;
  }
  const db = getDb();
  const completion = db.task_completions.find((c) => c.id === id);
  if (!completion) {
    res.status(404).json({ error: 'Task completion record not found.' });
    return;
  }
  if (completion.status !== 'pending') {
    res.status(400).json({ error: `Task completion already ${completion.status}.` });
    return;
  }

  const now = new Date().toISOString();
  const wallet = getOrCreateWallet(db, completion.userId);
  const txn = db.transactions.find((t) => t.referenceId === completion.id && t.type === 'task_reward');

  completion.status = status;
  completion.reviewedAt = now;
  completion.reviewedBy = req.currentUser!.id;

  wallet.pendingBalancePKR = Math.max(0, wallet.pendingBalancePKR - completion.rewardAmountPKR);

  if (status === 'approved') {
    wallet.availableBalancePKR += completion.rewardAmountPKR;
    wallet.totalEarnedPKR += completion.rewardAmountPKR;
    if (completion.createdAt.slice(0, 10) === todayDateString()) {
      wallet.dailyEarnedPKR += completion.rewardAmountPKR;
    }
    if (txn) txn.status = 'completed';
    db.notifications.unshift({
      id: generateId('ntf'),
      userId: completion.userId,
      title: `Task Reward Approved (+PKR ${completion.rewardAmountPKR})`,
      message: `Your reward for "${completion.title}" has been verified and credited to your available balance.`,
      category: 'reward',
      read: false,
      createdAt: now,
    });
  } else {
    completion.rejectionReason = (rejectionReason || 'Verification criteria not met').trim();
    const campaign = db.campaigns.find((c) => c.id === completion.campaignId);
    if (campaign) {
      campaign.spentBudgetPKR = Math.max(0, campaign.spentBudgetPKR - completion.rewardAmountPKR);
    }
    if (txn) txn.status = 'rejected';
    db.notifications.unshift({
      id: generateId('ntf'),
      userId: completion.userId,
      title: 'Task Completion Rejected',
      message: `Submission for "${completion.title}" was rejected: ${completion.rejectionReason}`,
      category: 'reward',
      read: false,
      createdAt: now,
    });
  }

  wallet.updatedAt = now;
  saveDb(db);
  res.json({ completion });
});

app.patch('/api/admin/withdrawals/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status, adminNote } = req.body as {
    status?: WithdrawalStatus;
    adminNote?: string;
  };
  if (status !== 'approved' && status !== 'rejected' && status !== 'paid') {
    res.status(400).json({ error: 'Invalid target withdrawal status.' });
    return;
  }

  const db = getDb();
  const withdrawal = db.withdrawals.find((w) => w.id === id);
  if (!withdrawal) {
    res.status(404).json({ error: 'Withdrawal request not found.' });
    return;
  }
  if (withdrawal.status === 'paid' || withdrawal.status === 'rejected') {
    res.status(400).json({ error: `Withdrawal is already finalized as ${withdrawal.status}.` });
    return;
  }

  const now = new Date().toISOString();
  const wallet = getOrCreateWallet(db, withdrawal.userId);
  const txn = db.transactions.find((t) => t.referenceId === withdrawal.id && t.type === 'withdrawal');

  withdrawal.status = status;
  withdrawal.adminNote = (adminNote || withdrawal.adminNote).trim();
  withdrawal.updatedAt = now;

  if (status === 'rejected') {
    wallet.availableBalancePKR += withdrawal.amountPKR;
    wallet.updatedAt = now;
    if (txn) txn.status = 'rejected';
    db.transactions.unshift({
      id: generateId('txn'),
      userId: withdrawal.userId,
      type: 'withdrawal_refund',
      amountPKR: withdrawal.amountPKR,
      status: 'completed',
      description: `Refunded rejected withdrawal (${withdrawal.id})`,
      referenceId: withdrawal.id,
      createdAt: now,
      isDemo: withdrawal.isDemo,
    });
  } else if (status === 'paid') {
    wallet.totalWithdrawnPKR += withdrawal.amountPKR;
    wallet.updatedAt = now;
    if (txn) txn.status = 'completed';
  }

  db.notifications.unshift({
    id: generateId('ntf'),
    userId: withdrawal.userId,
    title: `Withdrawal ${status.toUpperCase()} (PKR ${withdrawal.amountPKR})`,
    message:
      status === 'paid'
        ? `Your withdrawal via ${withdrawal.method.replace('_', ' ')} has been marked Paid.`
        : status === 'approved'
          ? `Your withdrawal request has been approved and scheduled for disbursement.`
          : `Your withdrawal request was rejected and PKR ${withdrawal.amountPKR} was refunded to your available balance.`,
    category: 'withdrawal',
    read: false,
    createdAt: now,
  });

  saveDb(db);
  res.json({ withdrawal });
});

app.patch('/api/admin/payments/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
  const { id } = req.params;
  const { status, rejectionReason } = req.body as {
    status?: 'APPROVED' | 'REJECTED';
    rejectionReason?: string;
  };

  if (status !== 'APPROVED' && status !== 'REJECTED') {
    res.status(400).json({ error: 'Payment decision must be APPROVED or REJECTED.' });
    return;
  }

  const db = getDb();
  const payment = db.payments.find((p) => p.id === id);
  if (!payment) {
    res.status(404).json({ error: 'Payment request not found.' });
    return;
  }
  if (payment.status !== 'PENDING') {
    res.status(400).json({ error: `Payment has already been finalized as ${payment.status}.` });
    return;
  }

  if (status === 'REJECTED' && (!rejectionReason || rejectionReason.trim().length < 3)) {
    res.status(400).json({ error: 'Please provide a clear rejection reason for the user.' });
    return;
  }

  const now = new Date().toISOString();
  payment.status = status;
  payment.reviewedBy = req.currentUser!.id;
  payment.reviewedAt = now;
  payment.updatedAt = now;

  if (status === 'APPROVED') {
    payment.rejectionReason = null;
    const wallet = getOrCreateWallet(db, payment.userId);
    wallet.availableBalancePKR += payment.amountPKR;
    wallet.totalDepositedPKR += payment.amountPKR;
    wallet.updatedAt = now;

    // Auto-unlock highest active plan covered by user's total approved deposit
    const payer = db.users.find((u) => u.id === payment.userId);
    let unlockedPlanName = '';
    if (payer) {
      const eligiblePlans = db.plans
        .filter((p) => p.active && p.monthlyPricePKR <= wallet.totalDepositedPKR)
        .sort((a, b) => b.monthlyPricePKR - a.monthlyPricePKR);
      if (eligiblePlans[0]) {
        payer.planId = eligiblePlans[0].id;
        payer.updatedAt = now;
        unlockedPlanName = eligiblePlans[0].name;
      }

      // 3-Level Referral Commission: Level 1 (10%), Level 2 (2%), Level 3 (2%)
      let currentReferrerId = payer.referredBy;
      const visitedReferrers = new Set<string>([payer.id]);
      for (let level = 0; level < REFERRAL_LEVEL_RATES.length && currentReferrerId; level++) {
        if (visitedReferrers.has(currentReferrerId)) break;
        visitedReferrers.add(currentReferrerId);
        const referrer = db.users.find((u) => u.id === currentReferrerId && u.status === 'active');
        if (!referrer) break;

        const rate = REFERRAL_LEVEL_RATES[level];
        const commissionPKR = Math.floor(payment.amountPKR * rate);
        if (commissionPKR > 0) {
          const refWallet = getOrCreateWallet(db, referrer.id);
          refWallet.availableBalancePKR += commissionPKR;
          refWallet.totalEarnedPKR += commissionPKR;
          refWallet.referralEarnedPKR += commissionPKR;
          refWallet.updatedAt = now;

          db.transactions.unshift({
            id: generateId('txn'),
            userId: referrer.id,
            type: 'referral_bonus',
            amountPKR: commissionPKR,
            status: 'completed',
            description: `Level ${level + 1} Referral Commission (${Math.round(rate * 100)}%) from ${payer.name} deposit`,
            referenceId: payment.id,
            createdAt: now,
            isDemo: false,
          });

          db.notifications.unshift({
            id: generateId('ntf'),
            userId: referrer.id,
            title: `Level ${level + 1} Commission (+PKR ${commissionPKR})`,
            message: `You earned ${Math.round(rate * 100)}% referral commission (PKR ${commissionPKR}) from ${payer.name}'s approved deposit.`,
            category: 'reward',
            read: false,
            createdAt: now,
          });
        }
        currentReferrerId = referrer.referredBy;
      }
    }

    db.transactions.unshift({
      id: generateId('txn'),
      userId: payment.userId,
      type: 'deposit',
      amountPKR: payment.amountPKR,
      status: 'completed',
      description: `Approved ${payment.method} payment (TxID: ${payment.transactionId})`,
      referenceId: payment.id,
      createdAt: now,
      isDemo: false,
    });

    db.notifications.unshift({
      id: generateId('ntf'),
      userId: payment.userId,
      title: `${payment.method} Payment Approved (+PKR ${payment.amountPKR})`,
      message: unlockedPlanName
        ? `Your ${payment.method} payment (TxID: ${payment.transactionId}) was approved, credited to your wallet, and activated ${unlockedPlanName} with ads unlocked.`
        : `Your ${payment.method} payment (TxID: ${payment.transactionId}) has been verified by the owner and credited to your wallet.`,
      category: 'admin',
      read: false,
      createdAt: now,
    });
  } else {
    payment.rejectionReason = rejectionReason!.trim().slice(0, 300);
    db.notifications.unshift({
      id: generateId('ntf'),
      userId: payment.userId,
      title: `${payment.method} Payment Rejected (PKR ${payment.amountPKR})`,
      message: `Payment TxID ${payment.transactionId} was rejected: ${payment.rejectionReason}`,
      category: 'admin',
      read: false,
      createdAt: now,
    });
  }

  saveDb(db);
  res.json({ payment });
});

app.patch('/api/admin/referrals/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body as { status?: 'qualified' | 'flagged' };
  if (status !== 'qualified' && status !== 'flagged') {
    res.status(400).json({ error: 'Invalid referral status.' });
    return;
  }
  const db = getDb();
  const referral = db.referrals.find((r) => r.id === id);
  if (!referral) {
    res.status(404).json({ error: 'Referral record not found.' });
    return;
  }

  const now = new Date().toISOString();
  if (referral.status !== 'qualified' && status === 'qualified') {
    const bonus = referral.rewardAmountPKR || db.settings.referralBonusPKR;
    referral.rewardAmountPKR = bonus;
    const wallet = getOrCreateWallet(db, referral.referrerId);
    wallet.availableBalancePKR += bonus;
    wallet.totalEarnedPKR += bonus;
    wallet.referralEarnedPKR += bonus;
    wallet.updatedAt = now;

    db.transactions.unshift({
      id: generateId('txn'),
      userId: referral.referrerId,
      type: 'referral_bonus',
      amountPKR: bonus,
      status: 'completed',
      description: `Admin-approved referral bonus for ${referral.referredUserName}`,
      referenceId: referral.id,
      createdAt: now,
      isDemo: referral.isDemo,
    });
  }

  referral.status = status;
  saveDb(db);
  res.json({ referral });
});

app.post('/api/admin/notifications', requireAuth, requireAdmin, (req, res) => {
  const { targetUserId, title, message } = req.body as {
    targetUserId?: string;
    title?: string;
    message?: string;
  };
  if (!title?.trim() || !message?.trim()) {
    res.status(400).json({ error: 'Title and message are required.' });
    return;
  }
  const db = getDb();
  const now = new Date().toISOString();
  const targets =
    targetUserId && targetUserId !== 'all'
      ? db.users.filter((u) => u.id === targetUserId)
      : db.users;

  for (const u of targets) {
    db.notifications.unshift({
      id: generateId('ntf'),
      userId: u.id,
      title: title.trim().slice(0, 120),
      message: message.trim().slice(0, 500),
      category: 'admin',
      read: false,
      createdAt: now,
    });
  }
  saveDb(db);
  res.status(201).json({ sentCount: targets.length });
});

app.patch('/api/admin/settings', requireAuth, requireAdmin, (req, res) => {
  const {
    minWithdrawalPKR,
    referralBonusPKR,
    requireEmailVerificationForWithdraw,
    antiBotChallengeEnabled,
    platformNotice,
  } = req.body as Partial<ReturnType<typeof getDb>['settings']>;

  const db = getDb();
  if (minWithdrawalPKR !== undefined && Number(minWithdrawalPKR) >= 50) {
    db.settings.minWithdrawalPKR = Math.floor(Number(minWithdrawalPKR));
  }
  if (referralBonusPKR !== undefined && Number(referralBonusPKR) >= 0) {
    db.settings.referralBonusPKR = Math.floor(Number(referralBonusPKR));
  }
  if (typeof requireEmailVerificationForWithdraw === 'boolean') {
    db.settings.requireEmailVerificationForWithdraw = requireEmailVerificationForWithdraw;
  }
  if (typeof antiBotChallengeEnabled === 'boolean') {
    db.settings.antiBotChallengeEnabled = antiBotChallengeEnabled;
  }
  if (platformNotice !== undefined) {
    db.settings.platformNotice = platformNotice.trim().slice(0, 300);
  }
  saveDb(db);
  res.json({ settings: db.settings });
});

// ========================
// VITE / STATIC SERVING
// ========================

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Honey & Bunny Invest server listening on http://localhost:${PORT}`);
  });
}

startServer();
