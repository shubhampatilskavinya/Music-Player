# Mirc Beats

The existing Bollywood player with its original collection and design, full-length YouTube playback, an append-only saved playlist, and iPad/TV screens. No karaoke or lyrics features are added.

## Run and connect screens

```bash
npm install
npm run dev -- --hostname 0.0.0.0
```

Open http://localhost:3000 on the server computer. Start a song, then use **TV screen** or **iPad screen**. These buttons switch the current view without opening a new player: video position and existing sound permission are preserved. TV mode requests fullscreen on that click; iPad mode shows a large video with playback controls. Use **Playlist & Search** to return to the controller without restarting the video. Browser Back/Forward restores the selected view. Direct `/tv` and `/ipad` links still work on other devices.

For separate devices, connect the iPad, TV, and server computer to the same network. Open `http://<computer-LAN-IP>:3000/ipad` on the iPad and `http://<computer-LAN-IP>:3000/tv` in the TV browser. The TV screen button changes the current device’s view; it does not cast to a physical TV automatically. Use **Open separate TV window** or open the TV URL on the other device. A TV without a suitable browser can use an HDMI-connected computer. On macOS, find the LAN address in System Settings > Wi-Fi > Details > TCP/IP (or `ipconfig getifaddr en0`). Keep the server running and allow its port through the firewall.

Both screens automatically share one playlist on this server; no room setup is needed. Every screen displays the same video. The TV takes sound priority; the iPad and other screens keep a muted, synchronized video preview. Opening either screen resumes from the shared playback position instead of restarting the song. The old sound output acknowledges muting before the TV takes over (a five-second lease remains as a fallback for disconnected screens). Switching screen modes keeps the exact iframe mounted. Other devices default to a muted synchronized preview; **Sound on here** explicitly enables audio on that device too, and **Mute this screen** turns that preview sound off. One screen reports progress and advances the queue, so the same ending cannot skip multiple songs. Preview drift is corrected when it exceeds two seconds; independent YouTube buffering/ads can temporarily affect synchronization. The iPad keeps search, queue selection, play/pause, next/previous, seeking, and volume controls. The TV automatically retries muted if its browser blocks audible autoplay, so video can continue without a second click. **Sound on here** is only needed to allow audio in that browser. Browser/site settings can also block muted autoplay; in that case the app shows a clear message and a Play option. Press **Fullscreen** on the TV; a local gesture is required. If the browser does not support page fullscreen, use the native video fullscreen control or browser fullscreen.

## Playback and playlist fixes

- Search results have a Play button: the song is appended and starts immediately in one server update, preserving all existing songs and their order. Clicking a playlist entry also plays it immediately.
- Queue/settings are saved atomically in `.mirc-data/music.json`, including concurrent requests. Reloads and server restarts preserve the queue. Restarted playback is paused.
- Catalog clip times no longer stop videos. Actual YouTube duration and its ended event determine playback length; the old three-hour cutoff is removed.
- The iframe loader handles remounts/retries, native video controls remain available, and the app sends its origin and a compatible referrer policy. Unavailable/private/embed-disabled videos show an explanation and Skip/Open YouTube options.
- Direct YouTube links/IDs work in search even when text search is unavailable. Text search still uses the existing key-free integration and depends on YouTube's response format.

## Transitions

The bottom **Transition** selector provides Off, 2, 3, 5, or 8 seconds. Volume fades out before the current video's actual end and fades in as the next video starts. Pause/buffering do not consume the fade, and seeking recalculates it.

This is **sequential fading, not overlapping crossfade**. YouTube prohibits multiple automatically playing players on the same page/screen: https://developers.google.com/youtube/terms/required-minimum-functionality#autoplay-and-scripted-playbacks. Starting the next YouTube stream early is therefore not implemented. Loading, ads, and device autoplay rules can leave a gap. Real overlapping audio would require a separate non-YouTube source, such as licensed local audio; this change does not introduce an upload/mixer feature.

## Verification

```bash
npm run lint
npm test
npx tsc --noEmit
npx next build --webpack
```

Integration/browser tests should use an **isolated test server**, since they add fixture songs and change playback:

```bash
MIRC_DATA_DIR=/private/tmp/mirc-beats-test-data npm run start -- --port 3101
APP_URL=http://localhost:3101 npm run test:integration
# Start a separate Chrome with --remote-debugging-port=9222 and a temporary user-data-dir.
APP_URL=http://localhost:3101 npm run test:browser
```

Browser checks exercise real YouTube duration, seeking beyond the old cutoff, actual ended advancement, TV sound ownership, simultaneous muted iPad video, joining at the current playback position, iPad layout, remote pause, fullscreen, reload, and runtime exceptions. YouTube availability and a network connection are required. On physical iPad/TV hardware, repeat those checks, verify audible volume/fades, add two search results, and confirm both remain after refresh.

Run one persistent Node process for this local venue setup. This shared session has no user accounts or authentication; it is intended for a trusted local network, not a public multi-tenant/serverless deployment. Browser/region/owner restrictions on individual YouTube videos still apply.
