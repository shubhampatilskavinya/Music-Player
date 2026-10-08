# Bollywood DJ Party Mix

A Next.js party player with 67 DJ remix tracks. The planned queue adds up to three hours. It advances automatically, repeats if a video ends early, and stops after three hours of actual playback. The first 25 tracks retain the requested order and approximate timings.

Search accepts any YouTube song. Choosing a search result plays it immediately and then resumes the party queue. Search and playback require an internet connection and depend on YouTube allowing the selected video to play in an embed. YouTube can also insert ads or block autoplay, so the player cannot guarantee gapless audio.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Build

```bash
npm run lint
npx next build --webpack
```
