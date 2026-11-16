# ASAD REWARD HUB — Firebase Setup & Deployment Guide

> **Note:** Because Firebase provisioning was skipped during initial setup, the running application uses a full-stack Node.js + Express server (`server.ts`) with persistent server-side JSON storage (`data/asad_reward_hub.json`), salted `scrypt` password hashing, HMAC-SHA256 HTTP-only session cookies, and server-side balance/task verification. Follow this guide whenever you are ready to migrate persistence and authentication to Firebase.

---

## 1. Firebase Project Initialization

1. Create a project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Authentication** -> Sign-in providers:
   - **Email/Password** (with Email Verification enabled)
   - **Google** (add your production domain and preview origin to Authorized Domains)
3. Enable **Cloud Firestore** in Production Mode.
4. Upgrade to the **Blaze (Pay-as-you-go)** plan if deploying **Cloud Functions for Firebase** for server-side financial callbacks.

---

## 2. Firestore Collection Structure

Create the following root collections matching the application data model:

- `users/{userId}` — User profile, `emailVerified`, `planId`, `referralCode`, `referredBy`, `status` (`active` | `blocked`)
- `admins/{adminUid}` — Authoritative admin allowlist checked by security rules
- `plans/{planId}` — Configurable Free / Premium / VIP plans (`depositRequired: false`)
- `campaigns/{campaignId}` — Sponsor-approved campaigns, budgets, and compliance metadata
- `tasks/{taskId}` — Watch & Earn tasks linked to `campaignId`
- `task_completions/{completionId}` — Server-verified completions (`pending` | `approved` | `rejected`)
- `wallets/{userId}` — Server-managed `availableBalancePKR`, `pendingBalancePKR`, `totalEarnedPKR`
- `transactions/{transactionId}` — Immutable ledger entries (`task_reward`, `referral_bonus`, `withdrawal`, `withdrawal_refund`)
- `withdrawals/{withdrawalId}` — Easypaisa, JazzCash, and Bank Transfer payout requests
- `payments/{paymentId}` — User-submitted Easypaisa payment proofs (`PENDING` | `APPROVED` | `REJECTED`), transaction IDs, and private screenshot references
- `referrals/{referralId}` — Referral tracking with IP hash anti-fraud status
- `notifications/{notificationId}` — User alerts and admin broadcasts
- `settings/platform` — Configurable `minWithdrawalPKR`, `referralBonusPKR`, and platform flags

---

## 3. Recommended Firestore & Storage Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    function isSignedIn() {
      return request.auth != null && request.auth.token.email_verified == true;
    }
    function isOwner(uid) {
      return isSignedIn() && request.auth.uid == uid;
    }
    function isAdmin() {
      return isSignedIn() && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    match /users/{userId} {
      allow get: if isOwner(userId) || isAdmin();
      allow list: if isAdmin();
      allow create: if isSignedIn() && request.auth.uid == userId && request.resource.data.role == 'user';
      allow update: if (isOwner(userId) && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['role', 'status', 'emailVerified'])) || isAdmin();
    }

    match /admins/{adminId} {
      allow read: if isAdmin();
      allow write: if false; // Managed via Firebase Admin SDK / Console only
    }

    match /plans/{planId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }

    match /campaigns/{campaignId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }

    match /tasks/{taskId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }

    match /wallets/{userId} {
      allow get: if isOwner(userId) || isAdmin();
      allow list: if isAdmin();
      allow write: if false; // Strictly updated via Cloud Functions / server Admin SDK
    }

    match /task_completions/{completionId} {
      allow get: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());
      allow list: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());
      allow write: if false; // Submitted & verified exclusively via Cloud Functions
    }

    match /transactions/{transactionId} {
      allow get, list: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());
      allow write: if false; // Ledger is server-authoritative
    }

    match /withdrawals/{withdrawalId} {
      allow get, list: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());
      allow write: if false; // Submitted & settled via Cloud Functions
    }

    match /payments/{paymentId} {
      allow get, list: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());
      allow create: if isSignedIn()
        && request.resource.data.userId == request.auth.uid
        && request.resource.data.status == 'PENDING';
      allow update, delete: if isAdmin(); // Ordinary users cannot approve or change payment status
    }

    match /referrals/{referralId} {
      allow get, list: if isSignedIn() && (resource.data.referrerId == request.auth.uid || isAdmin());
      allow write: if false;
    }

    match /notifications/{notificationId} {
      allow get, list: if isSignedIn() && (resource.data.userId == request.auth.uid || isAdmin());
      allow update: if isSignedIn() && resource.data.userId == request.auth.uid && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']);
      allow create, delete: if isAdmin();
    }
  }
}
```

### Firebase Storage Rules for Payment Screenshots (`storage.rules`)

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /payment_screenshots/{userId}/{fileName} {
      allow read: if request.auth != null && (
        request.auth.uid == userId ||
        firestore.exists(/databases/(default)/documents/admins/$(request.auth.uid))
      );
      allow write: if request.auth != null
        && request.auth.uid == userId
        && request.resource.size < 4 * 1024 * 1024
        && request.resource.contentType.matches('image/(png|jpeg|webp)');
    }
  }
}
```

---

## 4. Cloud Functions Architecture (Server-Side Financial Safety)

Never compute reward amounts or deduct balances on the client. Deploy HTTPS Callable / Express Cloud Functions using `firebase-admin`:

1. `startWatchTask`: Issues a signed, time-stamped nonce in Firestore `task_sessions/{nonce}`.
2. `verifyWatchCallback`: Checks `now - issuedAt >= campaign.durationSeconds`, validates the anti-bot answer, runs a Firestore `runTransaction()` to prevent duplicate submissions, increments `wallets/{uid}.pendingBalancePKR`, and logs `task_completions` + `transactions`.
3. `requestWithdrawal`: Runs a Firestore `runTransaction()` checking `emailVerified == true`, `amount >= minWithdrawalPKR`, and `wallet.availableBalancePKR >= amount` before decrementing available balance and inserting `withdrawals/{id}`.
4. `adminApproveCompletion` & `adminUpdateWithdrawal`: Validates `admins/{callerUid}` existence before crediting `availableBalancePKR` or refunding rejected withdrawals.

---

## 5. Production Deployment Instructions

### Option A: Current Express + Vite Full-Stack Deployment (Cloud Run / Node.js)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set environment variables:
   - `SESSION_SECRET`: strong random 64-char hex string
   - `PORT=3000`
3. Build the React frontend:
   ```bash
   npm run build
   ```
4. Start the production server:
   ```bash
   NODE_ENV=production npm start
   ```

### Option B: Firebase Hosting + Cloud Functions

1. Install Firebase CLI and initialize:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init firestore functions hosting
   ```
2. Deploy security rules, Cloud Functions, and Vite build output (`dist/`):
   ```bash
   npm run build
   firebase deploy --only firestore:rules,functions,hosting
   ```
