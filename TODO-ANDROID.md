# Waiting on the Android machine

Two jobs that need a real Android device or an Android build, which is why
they are not done. Both are written so you can pick them up cold.

---

## 1. Local Android builds break the next local iOS build

**Symptom.** `eas build --local --platform ios` fails with a runtime version
mismatch: the fingerprint it computes does not match the one the build made.

```
Runtime version mismatch: local 91d8c2ad, build 32bb3bed
```

**Cause, proven not guessed.** The local Android build runs Gradle, and
Gradle rewrites manifests inside `node_modules`. The one that bit us was

```
node_modules/@react-native-masked-view/masked-view/android/src/main/AndroidManifest.xml
```

Gradle strips `package="org.reactnative.maskedview"` out of it. That file is
one of the 148 hashed inputs to the fingerprint runtime version policy
(`app.json` has `"runtimeVersion": { "policy": "fingerprint" }`), so the moment
it changes, this checkout's fingerprint stops matching anything built before
it. It was diagnosed by cloning the repo to /tmp, installing fresh,
reproducing the build's hash exactly, then diffing the two fingerprint source
lists down to that single entry.

**The fix, and the trap in it.**

```bash
rm -rf node_modules && pnpm install
```

`pnpm install --frozen-lockfile` does NOT repair it. The file is already
present and the right version, so pnpm has no reason to touch it; only a full
removal makes it rewrite the file from the tarball.

**How to check before you burn a build:**

```bash
pnpm exec expo-updates fingerprint:generate --platform ios
# compare against the build you are trying to match
pnpm exec eas fingerprint:compare
```

**Also worth knowing, same class of problem.** An EAS environment that does
not mirror `.env` produces the same mismatch for a completely different
reason: `app.config.js` reads env vars into `extra`, `extra` is a fingerprint
input, and an empty environment ships a build with no accounts and no
purchases in it. Push before building:

```bash
eas env:push development --path .env
eas env:exec development -- pnpm exec expo-updates fingerprint:generate --platform ios
```

The second command should print the same hash as the first command in the
previous block. If it does not, the environment is the problem, not
`node_modules`.

---

## 2. `ProductAlreadyPurchasedError` has no branch

**Why it matters more than it used to.** Before guest purchases, the account
carried the entitlement across a reinstall, so this was rare. It is not rare
now. On Android a reinstall wipes the Keychain, so the device becomes nobody:
it has no guest identity, the plan carousel draws, and the obvious thing to
tap is **Buy**. Play then answers `ITEM_ALREADY_OWNED`, RevenueCat maps it to
`ProductAlreadyPurchasedError`, and `stores/subscription.ts` surfaces the raw
SDK message. The reader has paid, owns the subscription, and is being told
something that sounds like a failure with no way forward.

iOS does not have this problem the same way: the Keychain survives app
deletion, so the guest identity is usually still there.

**What to build.** Catch that error code and fall back to a restore, which is
what the reader meant. Restoring mints a fresh guest identity, RevenueCat
transfers the entitlement to it (the project is on "Transfer to new App User
ID", confirmed in the dashboard), and the existing `TRANSFER` webhook moves
the plan server-side. Every piece of that already exists and is tested; the
only new thing is the branch.

**Where:**

- `src/services/purchases.ts` — a typed error beside `PurchaseCancelled`,
  since that file is the only one that reads SDK error shapes. Something like
  `AlreadyPurchased`. Match on the RevenueCat error code, and be generous
  about the shape the way `isCancellation` already is: the code has moved
  between string and number across platforms before.
- `src/stores/subscription.ts` — `purchase()` catches it and delegates to
  `get().restore()`, so the reader gets their plan rather than a message.

**Why it is not done.** The exact error shape needs reading off a real device.
Do not guess it from the docs; `isCancellation` in that same file exists
because the documented shape and the shipped shape disagreed.

**How to test it.** Buy on an Android device, uninstall, reinstall, then tap
Buy rather than Restore. The reader should end up with their plan and no
error.

---

## Then: the device pass

Step 6 of `GUEST-ACCESS-PLAN.md`, which wants both platforms anyway.

1. Buy as a guest. Use Samwell. Confirm credits meter.
2. Register. Confirm the plan follows onto the account and the toast says so.
3. Sign in on a second device. Confirm the plan is there.
4. Sign out on the first. Confirm it does not claim the plan back.
5. The one question the plan leaves open: does `Purchases.logIn` from
   `guest:<uuid>` to a Logto sub **alias** the two or **switch** between them?
   The sources disagree and the server link is correct either way, but the
   answer decides whether the app should `logOut` first. Settle it by watching
   what the RevenueCat dashboard does to the guest customer during step 2.
