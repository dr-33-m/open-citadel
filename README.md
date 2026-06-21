# Open Citadel

A personal knowledge companion for serious readers. Open Citadel helps you collect, organise, and action the insights, highlights, and thoughts that come from the books, blogs, and podcasts you consume — so nothing valuable gets lost.

Built with Expo / React Native. Android-first, iOS coming.

---

## What it does

Most reading apps stop at reading. Open Citadel treats the reader as a starting point, not an end point. Every highlight, bookmark, and stray thought you capture while reading feeds into a unified timeline — your personal knowledge base, organised by date and tagged however you like.

### Core features

**Library**
- Sync your EPUB library from a local folder on your device (Android Storage Access Framework)
- Automatic metadata enrichment — title, author, cover pulled from the book file
- Organise books into collections, mark favourites, archive finished reads
- Queue and reading progress tracked per book

**Reader**
- Full EPUB reader powered by the [Readium](https://readium.org/) toolkit
- Dark, light, and sepia themes; custom font size and margins
- Highlight text with colour-coded highlights
- Bookmark pages
- Table of contents navigation
- Text-to-Speech — listen to any book with a single tap, follows your reading position

**Timeline**
- A chronological feed of everything you capture: highlights, bookmarks, and your own thoughts
- Add freeform thoughts at any time, tag them, link them back to a book
- Filter by date with a calendar picker
- Edit or delete any entry

**Samwell — AI Reading Companion**
- On-device LLM powered by llama.rn (offline & private)
- Samwell persona injected at the system level — he knows he's a reading companion
- Download any GGUF model from Hugging Face directly inside the app (search → repo → file → download)
- Start a chat from any highlight in the reader — context is carried into the conversation
- Attach a book to a chat session for passage-level context
- Model lifecycle controls: Wake Up / Power Down, status indicator in the chat header

**Settings**
- Choose your EPUB library folder
- Reader appearance preferences (theme, font, size, margins)
- Samwell AI section: model picker with HuggingFace search, offline vs cloud mode

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Expo 55 / React Native 0.83 |
| Navigation | Expo Router (file-based) |
| Database | Expo SQLite + Drizzle ORM |
| State | Zustand |
| Reader | `@dr33m/react-native-readium` (Readium fork) |
| TTS | Readium Navigator Media TTS (Android platform TextToSpeech) |
| Sync | Custom SAF-based sync coordinator |

---

## Getting started

### Prerequisites

- Node 20+
- pnpm 10+
- Android: JDK 17, Android SDK with `compileSdkVersion` >= 31
- iOS: Xcode 16.2+, iOS deployment target >= 13.4

### Install

```sh
pnpm install
```

### Start dev server

```sh
npx expo start --tunnel --clear
```

### Local development build

```sh
eas build --platform android --local --profile development
```

### EAS build (cloud)

```sh
# Preview APK
eas build --profile preview --platform android

# Production
eas build --profile production --platform android
```

---

## Project structure

```
src/
  app/              # Expo Router screens
    (tabs)/         # Tab navigator: Timeline, Library, Settings
    reader/[id]     # Full-screen reader
    collection/[id] # Collection detail
    section/[type]  # Library section views (queue, favourites, archived)
  components/
    library/        # Library UI components
    reader/         # Reader UI (header, TTS controls, selection bar, highlights)
    timeline/       # Timeline entries and thought sheet
    ui/             # Shared primitives
  db/               # Drizzle schema and migrations
  services/         # Sync pipeline (SAF scan → metadata → DB)
  stores/           # Zustand stores (books, collections, reader, timeline, settings)
  constants/        # Theme tokens
```

---

## Roadmap

### v1 — Books (complete)
- [x] EPUB library sync from device folder
- [x] Full Readium-powered reader
- [x] Highlights with colour coding
- [x] Bookmarks
- [x] Text-to-Speech
- [x] Thoughts — capture and tag freeform notes linked to books
- [x] Collections and library organisation

### v2 — AI Companion & Sharing (in progress)
- [x] On-device LLM via llama.rn — offline and private
- [x] Samwell persona — system prompt gives him identity as your reading companion
- [x] HuggingFace model search — browse, pick a GGUF, download, all in-app
- [x] Highlight-to-chat — start a conversation from any reader selection with full context
- [x] Book context — attach a book to a session so Samwell can reference it
- [x] Export as image — share highlights and thoughts as styled PNG cards with book cover, notes, and Open Citadel branding (dark & light theme)
- [x] **Tool calling** — let Samwell query your local database to pull in your highlights, thoughts, and notes, and read relevant passages from books in your library, so his answers are grounded in your actual reading

### v3 — Podcasts
- [ ] Add podcast feeds (RSS)
- [ ] In-app player with chapter support
- [ ] Capture timestamped highlights while listening
- [ ] Thoughts and highlights flow into the same timeline

### v4 — Blogs
- [ ] Add articles by URL or RSS feed
- [ ] Distraction-free reader view
- [ ] Highlights and thoughts sync to timeline
- [ ] Archive for offline reading

---

## License

Private — all rights reserved.
