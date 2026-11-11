# Privacy policy update, November 2026

What to change on https://www.open-citadel.online/privacy before the release
that carries EAS Observe, and the store forms that must match it. Written
against the policy dated September 17, 2026, and the app as it is on
`t3/samwell-rebuild`. Text in quote blocks is ready to paste.

Not legal advice. Items marked **confirm** are facts only you can check.

---

## 1. Must change (the policy is now wrong)

### Last updated

> Last updated: November 11, 2026

### Section 2, Summary

The sentence "We do not sell data, show ads, or use advertising or analytics
SDKs in the app" is no longer true once Observe ships. Replace with:

> We do not sell data or show ads, and the app has no advertising SDKs. If you
> choose to, you can share how the app performs (Settings, Share app
> performance) to help us make it faster. It is off until you turn it on.

"Cloud features require an account" is also out of date (a plan can be bought
without an account). Replace with:

> Cloud features need a plan. You can buy one with or without an account.

### New section, after Section 5: App performance (opt-in)

> **App performance (off unless you turn it on)**
>
> In Settings, "Share app performance" lets the app send how it performed, so
> slow and broken parts can be found and fixed. It is off until you turn it on,
> and you can turn it off at any time in the same place. Nothing recorded
> while it is off is ever sent.
>
> When it is on, the app sends:
>
> - How long the app takes to open, each screen to be ready, and Samwell to
>   answer, with which AI model answered and whether Samwell runs on your
>   phone or in the cloud.
> - How long other work takes, such as refreshing feeds, opening a post or a
>   book, importing a book, collecting a transcript, and buying a plan, and
>   whether it worked.
> - Errors the app ran into, with web addresses, file names and email
>   addresses removed from their messages, and on Android, the reason the app
>   last closed when the system ended it (for example, to free memory).
> - Your device's model, operating system and version, language, network and
>   battery state, and the app's version and build.
> - Which screens were opened, by their type (for example "a blog's page"),
>   without the book, post, address or search they were opened with.
> - The web address of the slowest network request while the app opens.
> - A random identifier for this installation of the app, and your IP
>   address, from which an approximate country is worked out.
>
> It never includes what you read, highlight, write or say to Samwell, your
> name, your email or your account.
>
> This data is processed for us by Expo (650 Industries, Inc.), the company
> whose app platform Open Citadel is built on, as our service provider. It is
> used only to find and fix problems in the app. It is not combined with data
> from other apps, used for advertising or shared with data brokers. Expo
> deletes it after 90 days, in monthly batches, so a record can last up to 120
> days.

### Section 3, What stays on your device

"Text-to-speech uses your device's built-in speech engine" is out of date.
Replace with:

> Reading aloud uses your phone's own voices, or the Enhanced voices, which
> are downloaded once and run on your phone. Cloud voices are described in
> Section 5.

Add:

> Posts you open from blogs are saved on your phone so you can highlight them
> and ask Samwell about them. A post you only opened is removed 30 days after
> you last read it; ones you queued, favourited, highlighted, noted or chatted
> about stay until you remove them (Remove Saved Copy) or uninstall.

### Section 5, Samwell Cloud & Compass

Add what the current version sends that the September policy does not cover:

> - **What Samwell knows.** A short profile of you that Samwell keeps on your
>   phone, with your recent wins and open commitments, is sent with each cloud
>   message so he can remember you. You can see and change it in Settings,
>   What Samwell knows. His notes about a conversation are written on our
>   server and sent back to your phone; the server keeps no copy.
> - **Web search.** When Samwell searches the web, his search goes through
>   OpenRouter to its search provider (Exa), and our server may fetch a page
>   from those results to read it. Only the search terms leave, not your
>   reading.
> - **Cloud voices.** When you listen in a cloud voice, the text being read is
>   sent through our server and OpenRouter to the voice's provider to be
>   spoken, and is not kept. The audio you have heard is kept on your phone so
>   going back costs nothing.
> - **Podcast transcripts.** When you ask for a transcript, the episode's web
>   address (not the audio) is sent through our server and OpenRouter to
>   ElevenLabs, which fetches the audio from the show and writes it out. The
>   transcript waits on our server until your phone collects it, and is
>   deleted from the server within about a day. It is kept on your phone.

### Section 4, Your account

Add:

> **Buying without an account.** If you buy a plan without signing in, the app
> makes a random identifier and secret for this device and keeps them in its
> secure storage. We keep only that identifier and a hash of the secret, with
> your plan, so the purchase works on this device. We never learn a name or
> email. If you later make an account, the purchase moves to it.

### Section 8, Third-party services

Add these processors:

> - **Expo (650 Industries, Inc.):** delivers app updates and, if you turn on
>   Share app performance, processes the performance data described above.
> - **Hetzner:** hosts our server (Samwell Cloud, accounts and plans).
> - **ElevenLabs:** writes podcast transcripts you ask for, through OpenRouter.
> - **Exa:** web searches Samwell makes, through OpenRouter.

And a short paragraph on publishers, since the app talks to their servers
directly:

> **Blogs and podcasts.** Feeds, posts, artwork and episode audio are fetched
> by your phone directly from each publisher's site, so those sites see your
> IP address, as they would in a browser. A blog's whole post is fetched from
> its site only if you choose to read that blog in the reader.

**Confirm:** whether Logto is self-hosted on your own server (the sign-in
endpoint is on your domain). If so, say "Logto (accounts), run on our own
server".

### Section 9, Data retention & deletion

Add:

> Performance data is kept by Expo for up to 120 days and then deleted. It
> cannot be linked back to you, so it cannot be looked up for deletion; turning
> Share app performance off stops any more being sent.

---

## 2. Store forms

These must match the policy.

### App Store Connect, App Privacy

Expo's recommendation for Observe. All **not linked to the user** and **not
used for tracking**:

| Data type | Purposes |
|---|---|
| Performance Data | App Functionality |
| Crash Data | App Functionality |
| Other Diagnostic Data | App Functionality |
| Device ID | App Functionality, Analytics |
| Coarse Location | Analytics |
| Product Interaction | Analytics |

The opt-in does not remove the need to declare these. The "product
improvement program" exception needs data that is not linked to the device,
and Observe counts each installation by a random id.

### Google Play, Data safety

| Data type | Collected | Shared | Optional | Purpose |
|---|---|---|---|---|
| App info and performance: Diagnostics | Yes | No (Expo is a service provider) | Yes | Analytics |
| App info and performance: Crash logs | Yes | No | Yes | Analytics |
| Device or other IDs | Yes | No | Yes | Analytics |
| Location: Approximate location | Yes | No | Yes | Analytics |
| App activity: App interactions | Yes | No | Yes | Analytics |

- Encrypted in transit: **Yes**.
- Optional: **Yes**. Every user is opted out until they turn it on.
- Users can request deletion: answer **No** for this data, unless you are
  ready to handle requests by hand. Expo's 90-day deletion alone does not
  qualify, and the data cannot be found by a person's details.

**Confirm:** the rest of the form (accounts, purchases, cloud features)
already matches Sections 4 to 6 of the policy.

---

## 3. In the app, already done

- Off by default; turned on only from the sheet that says what is sent, with
  SHARE PERFORMANCE and NOT NOW; off is one tap on the switch.
- The sheet's words match Section "App performance" above
  (`src/features/settings/utils/performance-sharing.ts`).
- Route parameters (book, post and chat ids, feed addresses, titles, reading
  positions, searches) are filtered before sending (`src/lib/observe`).

Sources:
[Expo Observe store privacy declarations](https://docs.expo.dev/eas/observe/reference/store-privacy-declarations/),
[Apple App privacy details](https://developer.apple.com/app-store/app-privacy-details/),
[Apple App Review Guidelines 5.1](https://developer.apple.com/app-store/review/guidelines/),
[Google Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en),
[Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).
