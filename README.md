# Bollywood DJ Party Mix

A Next.js party player with 67 DJ remix tracks. The planned queue adds up to three hours. It advances automatically when the clip time is reached or a video ends, loops the queue as needed, and stops after three hours of counted playback. The first 25 tracks retain the requested order and approximate timings.

Search accepts any YouTube song. Choosing a search result plays it immediately and then resumes the party queue. Search and playback require an internet connection and depend on YouTube allowing the selected video to play in an embed. YouTube can also insert ads or block autoplay, so the player cannot guarantee gapless audio.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Main-player fade transitions

Use **Crossfade** in the bottom playback bar: Off, 2, 3 (default), 5, or 8 seconds. The current YouTube track fades out over its final seconds, then the next track fades in over its opening seconds. The fade follows the actual clip/video playback position, so pause and buffering do not consume the fade; seeking recalculates the volume. Short clips use a shorter fade. The volume slider remains the maximum listening volume, and Off restores normal volume immediately.

This is a sequential fade-out/fade-in transition in one YouTube player, not overlapping audio. YouTube loading, ads, or embed restrictions may leave a gap. Manual track selection and Next/Previous switch immediately and fade in the selected track. It works on playlist tracks and search requests without local audio uploads or an API key. The separate local-audio mixer and its AI planner have been removed.

## Build

```bash
npm run lint
npm test
npx next build --webpack
```
