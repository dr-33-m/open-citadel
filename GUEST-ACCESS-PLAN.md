# Buying without an account — plan

> Written 2026-09-20, after App Review rejected the build under guideline
> 5.1.1(v). Matching `BILLING-PLAN.md`: the progress log is where things are,
> everything after it is the approved plan and does not change as work lands.

## Progress log

**Steps 1 to 4 are done and green.** App and server typecheck, 521 app tests
pass. The server is deployed: registering a fresh device answers 201 and the
secret exchanges for a one hour token.

**Step 1 and 2, server** (`7b11c52`). `guest_identities` in
`ensureBillingSchema`. `guest-identity.ts`: id and secret shapes, registration,
SHA-256 of the secret and nothing else, token minting and verification.
`identity.ts` dispatches on issuer; `Identity` gained `kind`. `billing.linkGuest`,
one batch, refusing an account that already holds anything of its own.
`syncEntitlement` asks about linked guest ids too - **the reconcile trap is
covered by three tests**, including that one unanswered subject reads as
unknown rather than cancelled. The webhook resolves `guest:` ids through
`linked_account_id`.

**Step 3, the device's identity** (`2243d60`, fixed in `0a5af79`). Mint, store,
register, exchange. `cloudHeaders` falls back to the guest token. The fixes
were worth having: a missing request timeout, a wasted round trip, two
Keychain reads per request, and a generation counter so a link landing
mid-fetch cannot resurrect a deleted identity.

**Step 4, buying without an account.** One notion, `hooks/use-cloud-identity`,
replacing four separate "is there an account" checks: the cloud blocker, the
plan sync, the billing lifecycle and the Cloud panel. `getCloudBlocker` now
asks a reader with nobody for a PLAN rather than an account, and keeps
`needsAccount` only for a build with no RevenueCat key, which can draw the
plans but cannot sell them. `usePlanCheckout` mints a guest identity at the
tap and buys against it; the sheet that used to ask for an account first is
gone, and so is its copy, which said the opposite of what is now true.

**Confirmed, not assumed:** the RevenueCat project is on "Transfer to new App
User ID" with no separate sandbox behaviour, so restore-after-reinstall works
and sandbox testing will behave the same.

**Step 5, linking.** `services/guest-link` proves both identities separately
and `useGuestLink` at the root fires whenever an account and a guest identity
are both present - so it covers registering after buying, a retry after a
failed attempt, and signing in on a phone that bought something long ago,
without three call sites deciding the same thing. The RevenueCat convergence
happens AFTER the server link, never before: the other order moves the
entitlement to the account while the ledger row is still under the guest id,
and the next reconcile finds a paying reader with nothing. The account card
now has copy for the state that reads as a contradiction, signed out with an
active plan, which is just somebody who bought without registering.

**Next:** step 6, the device pass, and the two Android jobs in
`TODO-ANDROID.md`. Still open: whether `logIn` from `guest:<uuid>` to a Logto
sub aliases or switches, which decides whether the app should `logOut` first.
Settle it on a device.

## Why

App Review's position: a subscription may not require registration unless the
purchase is tied to account-specific functionality. We argued the exception,
which is defensible but not certain. This removes the argument instead: a
reader buys a plan with no account at all, and registering becomes optional and
only buys access on a second device. That is word for word what Apple's own
"Next Steps" paragraph suggested.

We do not want their name, their email, or anything else about them. We need
exactly three things: that a device paid, that credits can be metered against
it, and that it can reach our server securely. A device-scoped identity gives
us all three.

## The shape

A guest identity is a random id and a random secret, both minted on the device
and kept in the Keychain. The id becomes the RevenueCat `app_user_id`. The
secret is the credential: the device exchanges it for a short-lived JWT, which
every metered route accepts exactly as it accepts a Logto token today.

Accounts do not go away. They remain for the concierge onboarding, for
multi-device access, and for anyone who wants their plan to outlive the phone.

### What we are NOT doing

Using RevenueCat's own anonymous id (`$RCAnonymousID:…`) as the credential.
Their security guidance is explicit: *"Do not rely on the anonymous id as a
credential. It is a device scoped identifier."* It is not secret and not stored
securely. We mint our own so that the thing we authenticate is a secret we
chose, stored where secrets belong.

## Identity model

| | RevenueCat `app_user_id` | Ledger key | Credential |
|---|---|---|---|
| Guest | `guest:<uuid>` | `guest:<uuid>` | device secret → server-signed JWT |
| Account | `<logto sub>` | `account:<sub>` | Logto access token |

`toAccountId()` in the webhook and the prefix stripping in `syncEntitlement`
are the only two places that translate between the columns. Both already exist
and both take two extra lines: a `guest:` id passes through untouched, a bare
id gets the `account:` prefix as it does today.

## The linking problem, which is the whole design

### The RevenueCat behaviour that decides this

One half is documented and certain:

- **Launch → purchase is free.** The app configures anonymously today. Calling
  `logIn("guest:<uuid>")` at checkout is anonymous → identified, and
  RevenueCat aliases the anonymous customer onto the new id. The purchase
  lands on the guest id with nothing for us to do. Their own guidance is
  explicit that a purchase made while anonymous is not lost this way.

The other half is not certain, and that is the point:

- **Guest → account is identified → identified**, and the sources disagree
  about it. RevenueCat's identity guidance warns that a direct second `logIn`
  "will alias the two IDs together", which is why it tells you to `logOut`
  first when switching accounts. Other readings have it as a plain switch that
  leaves the subscription behind. I could not settle it from the documentation
  available here, and it is not a thing to be wrong about: one reading loses a
  paying reader's plan, the other silently moves it.

**So the design does not depend on the answer.** The server link below is
correct under either behaviour: if RevenueCat aliases, later events arrive
under the account id and land on a ledger row that is already there; if it
does not, they keep arriving under the guest id and the link table redirects
them. Settle the question on a device before step 5 all the same, because it
decides whether the app should `logOut` first.

### Therefore: we own the mapping, not RevenueCat

A `guest_identities` row records which account a guest id has been linked to.
Every webhook resolves through it, so a renewal that arrives eighteen months
later still carries `app_user_id = guest:<uuid>` and still lands on the right
account. This is durable, server-side, and does not depend on the client
finishing anything.

```
POST /account/link
  Authorization: Bearer <logto access token>
  X-Guest-Authorization: Bearer <guest jwt>
```

The server verifies **both** tokens independently, then in one transaction:

1. Refuses if this guest id is already linked to a different account.
2. Moves the `account_credits` row from `guest:<uuid>` to `account:<sub>`,
   carrying the balance and the period end.
3. Writes `linked_account_id` on the guest row.
4. Returns the merged balance.

After that the guest token is refused: the device has an account and must use
it. Idempotent for the same pair, so a retry is safe.

### The reconcile trap

`syncEntitlement(accountId)` asks RevenueCat about a subscriber id derived from
the ledger key. After a link, the ledger says `account:<sub>` while the
RevenueCat customer is still `guest:<uuid>`. Asking RevenueCat about `<sub>`
returns no entitlements, and the current code reads "no entitlements" as
**cancelled** and clears the plan.

So the reconcile must ask about the linked guest id too, and take the best
answer. One extra lookup, and without it a paying reader loses their plan the
first time the cache expires. This is the single most dangerous part of the
change and it gets its own test.

### Belt and braces

On link we also call `Purchases.logIn(<sub>)` and `restorePurchases()`, so
RevenueCat's own view converges with ours and future events carry the account
directly. If it fails, nothing breaks: the link table is already authoritative
and the existing TRANSFER webhook handler covers it if it later succeeds.

## Server changes

**Schema**

```sql
CREATE TABLE guest_identities (
  guest_id           TEXT PRIMARY KEY,   -- 'guest:<uuid>', device-generated
  secret_sha256      TEXT NOT NULL,      -- never the secret itself
  created_at_ms      INTEGER NOT NULL,
  linked_account_id  TEXT,               -- 'account:<sub>' once linked
  linked_at_ms       INTEGER
);
```

No change to `account_credits`: a guest's ledger key is simply `guest:<uuid>`.

**Routes**

- `POST /account/guest` — `{ guestId, secret }`. Stores `sha256(secret)`.
  Rejects a `guestId` already taken. Creates no credits.
- `POST /account/guest/token` — `{ guestId, secret }` → a JWT, one hour,
  signed with our own key. Refused once the guest is linked.
- `POST /account/link` — as above.

**`identity.ts`** gains a second verifier. A Logto token verifies against their
JWKS as today; a guest token verifies against our own signing key. Same
audience, different issuer, so the two can never be confused. Everything
downstream keeps receiving one `Identity { id }` and does not care which it is.

**Webhook** `toAccountId()` resolves through `linked_account_id`.

**Free grant** stays account-only. A guest who never pays has no credits at
all. This is not meanness: it is the hole that killed the old device-id scheme,
where a reinstall was a fresh allowance.

## App changes

- `services/guest-identity.ts` — mint, store, register, exchange for a JWT,
  cache it with its expiry. `expo-secure-store` with
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so it is not carried into a backup or onto
  a restored phone.
- `cloud-identity.ts` — `cloudHeaders()` returns the Logto token when signed
  in, the guest JWT when not, and throws only when there is neither.
- `purchases.ts` — `identifyGuest(guestId)` before a purchase, which is the
  aliasing call described above.
- `usePlanCheckout` — buying no longer asks for an account. `PlanAccountSheet`
  moves after the purchase and changes its job: *your plan is on this device,
  sign in to use it on others.*
- Account card — says plainly which of the two states the device is in, and
  offers the link.
- On sign-in, if a guest identity with a plan exists, call `/account/link`.

## Security invariants

1. The secret leaves the device only to `/account/guest/token`, over TLS, and
   is stored server-side only as a SHA-256 hash. 256 bits of entropy needs no
   slow hash.
2. Guest JWTs are short-lived and signed by us. Nothing else is accepted as a
   guest.
3. A guest id links to at most one account, ever.
4. After linking, guest tokens are refused.
5. Guests never receive the free grant.
6. The server remains the only authority on entitlement. No client claim is
   trusted, which is unchanged and is what RevenueCat's guidance asks for.

## Threats

| Threat | Answer |
|---|---|
| Guest id guessed | Useless without the secret |
| Secret stolen from a compromised device | Bounded to that subscription's credits; `THIS_DEVICE_ONLY` keeps it out of backups; linking to an account is the recovery path |
| Replayed registration | The id is already taken, rejected |
| Shared device | iOS and Android are single-user per profile, and the secret is in per-user secure storage |
| Reinstall | iOS Keychain survives deletion, so usually recovered. Android does not: the reader restores purchases, RevenueCat transfers, and the existing TRANSFER webhook moves the plan |

## Decisions taken

Answered 2026-09-20.

1. **A guest links to an account that already has its own subscription:
   refuse and explain.** No silent merge, no arithmetic on two balances
   nobody asked us to combine. The copy has to be good, because this lands on
   somebody who has paid twice by accident: say which account already holds a
   plan, and that nothing has been taken from either.

2. **RevenueCat transfer behaviour: transfer to the new app user id.** It is
   what makes Restore Purchases work for an Android reader who reinstalls,
   since their guest identity is wiped with the app and the restore therefore
   arrives under a new id. The `TRANSFER` webhook handler already does the
   right thing with it. The cost is that two people sharing one store account
   can bounce the entitlement between them by each restoring; that is an
   annoyance for a shared Apple ID, not a way in for a stranger.

   A dashboard setting, not code. **Confirm what the project is set to before
   step 4**, because it barely matters today (every purchase is keyed to a
   Logto subject, which survives a reinstall) and becomes load-bearing the
   moment a guest identity can be lost.

3. **The concierge stays account-based.** On the house, but it needs an
   account, exactly as today. A guest gets credits only from a purchase. This
   is what stops a reinstall farming the free grant, which is the hole that
   killed the old device-id scheme, and it gives someone a reason to register
   that has nothing to do with paying.

## Build order

Each step is shippable and testable on its own.

1. Server: schema, the three routes, the second verifier in `identity.ts`.
   Tests for token issue, refusal after link, and the reconcile trap.
2. Server: webhook link resolution, with a test that a renewal arriving on a
   linked guest id credits the account.
3. App: guest identity service and `cloudHeaders()`. Nothing user-visible yet.
4. App: purchase without an account. This is the change App Review needs.
5. App: the link flow and the account card copy.
6. Device pass: buy as a guest, use Samwell, register, confirm the plan
   survives, sign in on a second device.

## What does not change

The ledger, the credit model, the webhook's grant logic, the plan catalogue,
the server being authoritative, and every existing signed-in reader, whose path
through the app is untouched.
