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

**Settings**
- Choose your EPUB library folder
- Reader appearance preferences (theme, font, size, margins)

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

### Development build

```sh
# Android
pnpm android

# iOS
pnpm ios
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

### v2 — AI Companion (next)
- [ ] Chat with your own highlights and thoughts
- [ ] Surfaces connections between ideas across books
- [ ] Suggests related passages from your library
- [ ] On-device first, privacy preserving

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
