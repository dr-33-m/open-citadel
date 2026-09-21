# Waiting on the Android machine

Two jobs that needed a real Android device or an Android build. Both now
have code; the second still needs its device check.

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

**Fixed, 2026-09-21.** `.fingerprintignore` leaves library Android manifests
under `node_modules` out of the hash. Checked by generating the iOS and
Android fingerprints with the manifest stripped and with it restored: same
hash both ways, on both platforms. A library's manifest only changes with its
version or a patch, and both are hashed elsewhere. Adding the ignore changed
the hash once, so the first build after it is a new runtime version.

If a different file ever does the same thing, the old workaround still holds:
`rm -rf node_modules && pnpm install`. `pnpm install --frozen-lockfile` does
NOT repair it, because the file is already present at the right version and
pnpm has no reason to touch it.

**How to check before you burn a build:**

```bash
pnpm exec fingerprint fingerprint:generate --platform ios
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
ID", confirmed in the dashboard), and the `TRANSFER` webhook moves the plan
server-side.

**Correction, 2026-09-21: that webhook had never worked.** It read
`transferred_from_app_user_ids` / `transferred_to_app_user_ids` and an
entitlement; RevenueCat sends `transferred_from` / `transferred_to` and
nothing else. Every transfer was a no-op, so the account kept its plan, the
new guest was granted a fresh month when first read, and signing back in was
refused as "paid twice". Now `transferPlan` in `server/src/billing.ts` moves
the sender's row (plan, period, what is left) and withdraws a grant the
receiver was given for the same period before the webhook landed. Needs a
server deploy. Worth checking one real TRANSFER in the RevenueCat dashboard's
webhook log against the fields above during the device pass.

**Where:**

- `src/services/purchases.ts` — a typed error beside `PurchaseCancelled`,
  since that file is the only one that reads SDK error shapes. Something like
  `AlreadyPurchased`. Match on the RevenueCat error code, and be generous
  about the shape the way `isCancellation` already is: the code has moved
  between string and number across platforms before.
- `src/stores/subscription.ts` — `purchase()` catches it and delegates to
  `get().restore()`, so the reader gets their plan rather than a message.

**Built, 2026-09-21, not yet seen on a device.** `AlreadyPurchased` and
`isAlreadyPurchased` are in `services/purchases.ts`, and `purchase()` in
`stores/subscription.ts` hands off to `restore()`. The match accepts code `"6"`
(the Android bridge rejects with `errorContainer.getCode() + ""`), numeric `6`,
and the readable name on the error or in `userInfo`. That came from reading the
bridge source, not from a device. In dev, Metro logs
`[Purchases] Already purchased: {...}` with the raw error. Read it during the
test below, then drop the log if the shape matched.

**How to test it.** Buy on an Android device, uninstall, reinstall, then tap
Buy rather than Restore. The reader should end up with their plan and no
error.


**The other plan, too.** Play only refuses the *same* product twice. Tapping a
different plan after a reinstall would sell a second subscription beside the
first, since a Play plan change must name the product it replaces and a fresh
guest knows none. So `completeCheckout` asks Play first
(`reclaimStorePurchases`): Android, guests only, once per guest per session,
side by side with the pre-buy server read so a reader who never paid waits
for one round trip, not two. Test: buy plan A, uninstall, reinstall, tap Buy
on plan B. Expect "You already have an active plan", with A restored and no
second subscription in Play. Worth timing the tap-to-sheet gap on a fresh
guest while you are there; the estimate is under a second, all of it
overlapping the read that was already there.
---

## Then: the device pass

Step 6 of `GUEST-ACCESS-PLAN.md`, which wants both platforms anyway.

1. Buy as a guest. Use Samwell. Confirm credits meter.
2. Register. Confirm the plan follows onto the account and the toast says so.
3. Sign in on a second device. Confirm the plan is there.
4. Sign out on the first. Confirm it does not claim the plan back.
5. ~~Does `Purchases.logIn` from `guest:<uuid>` to a Logto sub alias or
   switch?~~ **Settled on iOS, 2026-09-21: it switches.** Worth one glance on
   Android to confirm the same: sign in after buying as a guest, and Metro
   should log `[Purchases] Joined <sub> (new customer: false)` while the
   plan arrives through the server link, not through RevenueCat.

---

## Known, not worth building yet

**A reader who ends up paying twice has no route out.** If somebody buys as a
guest, then signs in to an account that already holds its own plan, the link
is refused and explained - which is the decision in `GUEST-ACCESS-PLAN.md` and
is right, because nobody asked us to do arithmetic on two balances. But the
toast then appears on every launch, since the state stays unresolved and
nothing in the app can resolve it. Rare enough to leave alone; if it ever
shows up in support, the answer is a refund on one of them, not code.
