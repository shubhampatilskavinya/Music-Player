"use client";
import { useEffect, useState } from "react";
import { songs, type Song } from "./songs";
import { MusicNoteIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, SearchIcon, VolumeIcon } from "./icons";
import { useSession } from "./music/use-session";
import YouTubePlayer from "./music/YouTubePlayer";
import type { Identity } from "./auth/identity";
function formatTime(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }
type SearchResult = { videoId: string; title: string; channel: string; duration: string };
export default function MusicApp({ tv = false, ipad = false, identity, partyCode = "" }: { tv?: boolean; ipad?: boolean; identity?: Identity; partyCode?: string }) {
  const [screen, setScreen] = useState<'controller' | 'ipad' | 'tv'>(tv ? 'tv' : ipad ? 'ipad' : 'controller');
  const tvView = screen === 'tv';
  const displayView = screen !== 'controller';
  const connection = useSession(tvView);
  useEffect(() => {
    const back = () => setScreen(location.pathname === "/tv" ? "tv" : location.pathname === "/ipad" ? "ipad" : "controller");
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const { state, send, connected } = connection;
  const playlist = state?.queue || songs;
  const currentIndex = state?.index || 0;
  const currentSong = playlist[currentIndex];
  const upcomingSong = playlist[(currentIndex + 1) % playlist.length];
  const isPlaying = state?.playing || false;
  const playerReady = connected && !!state;
  const currentTime = state?.time || 0;
  const duration = state?.duration || 0;
  const volume = state?.volume ?? .8;
  const fadeSeconds = state?.fade ?? 3;
  const [query, setQuery] = useState('');
  const [selectedResult, setSelectedResult] = useState<string | null>(null);
  const [addingRequest, setAddingRequest] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [address, setAddress] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setAddress(location.origin); }, []);
  const upcomingQueue = playlist.slice(currentIndex + 1);
  const requestedUpcoming = upcomingQueue.filter((song) => song.requestedBy);
  const catalogRemaining = upcomingQueue.length - requestedUpcoming.length;
  const catalogSongs = playlist.filter((song) => !song.requestedBy);
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/login'; };
  useEffect(() => {
    const search = query.trim();
    if (search.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(search)}`, { signal: controller.signal });
        const data: { results?: SearchResult[]; error?: string } = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Search failed.");
        setSearchResults(data.results ?? []);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSearchResults([]);
        setSearchError(error instanceof Error ? error.message : "Search failed.");
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const updateQuery = (value: string) => {
    setQuery(value);
    setSelectedResult(null);
    setSearchResults([]);
    setSearchError(null);
    setSearchLoading(value.trim().length >= 2);
  };

  const playSearchResult = async (result: SearchResult, type: 'play-next' | 'append' | 'append-play' | 'add-to-playlist') => {
    if (addingRequest) return;
    setAddingRequest(true);
    if (type === 'append-play') window.dispatchEvent(new Event('mirc-sound'));
    const song: Song = { id: 0, title: result.title, artist: result.channel, movie: 'YouTube request', duration: '', gradient: 'from-fuchsia-500 to-indigo-500', youtubeId: result.videoId };
    try {
      if (await send({ type, song })) {
        setFeedback(type === 'append-play' ? `Playing ${result.title}. Added to your playlist.` : type === 'play-next' ? `${result.title} will play next.` : type === 'add-to-playlist' ? `${result.title} added to the playlist permanently.` : `${result.title} added to the end of your queue.`);
        updateQuery('');
      }
    } finally { setAddingRequest(false); }
  };
  // Always dispatch, even when pausing: on a fresh page load the session can already say
  // "playing" (e.g. the party was already going), so the browser blocks that unrequested
  // autoplay and the very next click here is this screen's first real user gesture - its
  // only chance to unlock sound. Gating this on "only when starting playback" meant a
  // blocked screen's first click (often a pause, since the button already reads "Pause")
  // never unlocked audio at all.
  const togglePlayPause = () => { window.dispatchEvent(new Event('mirc-play')); void send({ type: isPlaying ? 'pause' : 'play' }); };
  const selectSong = (index: number) => { if (index === currentIndex) return togglePlayPause(); window.dispatchEvent(new Event('mirc-sound')); void send({ type: 'select', value: index }); };
  const goPrev = () => void send({ type: 'previous' });
  const goNext = () => void send({ type: 'next' });
  const setVolume = (value: number) => void send({ type: 'volume', value });
  const setFadeSeconds = (value: number) => void send({ type: 'fade', value });
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => void send({ type: 'seek', value: Number(e.target.value) });
  const progressPct = duration > 0 ? currentTime / duration * 100 : 0;
  const fullscreen = async () => { try { const video = document.querySelector<HTMLElement>(".youtube-host"); if (!video?.requestFullscreen) throw new Error("Fullscreen unavailable"); await video.requestFullscreen(); } catch { setFeedback('Tap the fullscreen icon inside the YouTube video. For TV mirroring, rotate your iPad to landscape.'); } };
  const switchScreen = (next: 'controller' | 'ipad' | 'tv') => {
    // Keep the same iframe and its browser audio permission alive.
    if (isPlaying) window.dispatchEvent(new Event('mirc-play'));
    setScreen(next);
    history.pushState(null, '', next === 'controller' ? '/' : `/${next}`);
    if (next === 'tv') void fullscreen();
    else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  return (
    <div className={`music-app ${displayView ? `display-view ${screen}-view` : ""}`}>
      <header className="tv-view-toolbar" hidden={!displayView}><strong>Mirc Beats · {tvView ? "TV" : "iPad"}</strong>{tvView && partyCode && <span className="party-code-badge">Join at <strong>{address || "this address"}/guest</strong> · Code <strong>{partyCode}</strong></span>}<div className="screen-actions"><button data-screen="controller" onClick={() => switchScreen("controller")}>Playlist &amp; Search</button><button data-screen={tvView ? "ipad" : "tv"} onClick={() => switchScreen(tvView ? "ipad" : "tv")}>{tvView ? "iPad screen" : "TV screen"}</button><button onClick={() => void fullscreen()}>Fullscreen</button><button onClick={togglePlayPause}>{isPlaying ? "Pause" : "Play"}</button></div></header>

      <div className="main-shell">
        <header className="topbar">
          <span className="topbar-brand"><span className="brand-mark"><MusicNoteIcon /></span><span>Mirc <span className="brand-second">Beats.</span></span></span>
          <label className="search-box"><SearchIcon /><input type="search" autoCorrect="off" autoCapitalize="none" autoComplete="off" spellCheck={false} enterKeyHint="search" aria-label="Search any song on YouTube" value={query} onChange={(e) => updateQuery(e.target.value)} placeholder="Search songs in Hinglish, Hindi or English…" />{query && <button aria-label="Clear search" onClick={() => updateQuery("")}>×</button>}</label>
          <nav className="screen-actions" aria-label="Choose screen">{partyCode && !displayView && <span className="party-code-chip">Party code: <strong>{partyCode}</strong></span>}<button data-screen="ipad" aria-pressed={screen === "ipad"} onClick={() => switchScreen("ipad")}>iPad screen</button><button data-screen="tv" aria-pressed={tvView} onClick={() => switchScreen("tv")}>TV screen</button>{identity && !displayView && <span className="profile-chip"><span className="profile-badge">{identity.name.charAt(0).toUpperCase()}</span><span>{identity.name}</span><button onClick={() => void logout()}>Log out</button></span>}</nav>
        </header>

        <main id="playlist" className="content">
          {!displayView && <p className="screen-help">For a separate TV, open <strong>{address}/tv</strong> on the same Wi-Fi. <a href="/tv" target="_blank" rel="noreferrer">Open separate TV window ↗</a></p>}

          {query.trim().length >= 2 && (
            <section className="youtube-results" aria-labelledby="youtube-results-title">
              <div className="section-heading"><div><span className="eyebrow">SONG REQUESTS</span><h2 id="youtube-results-title">YouTube search results</h2></div><span className="count-pill">{searchLoading ? "Searching…" : `${searchResults.length} videos`}</span></div>
              {searchError && <p className="search-feedback" role="status">{searchError} <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer">Search on YouTube</a></p>}
              {!searchLoading && !searchError && searchResults.length === 0 && <p className="search-feedback">No videos found. Try a different song name.</p>}
              <div className="youtube-result-list">
                {searchResults.map((result) => (
                  <div key={result.videoId} className="youtube-result-item">
                  <button className="youtube-result" aria-expanded={selectedResult === result.videoId} aria-controls={`request-${result.videoId}`} onClick={() => setSelectedResult(selectedResult === result.videoId ? null : result.videoId)} aria-label={`Choose how to play ${result.title}`}>
                    <span className="track-art bg-gradient-to-br from-fuchsia-500 to-indigo-500"><PlayIcon /></span>
                    <span className="youtube-result-copy"><strong>{result.title}</strong><small>{result.channel}</small></span>
                    <span className="track-duration">Choose ▾</span>
                  </button>
                  <div id={`request-${result.videoId}`} className="request-actions" hidden={selectedResult !== result.videoId} aria-label={`Options for ${result.title}`}>
                    <button disabled={addingRequest} onClick={() => void playSearchResult(result, "play-next")}>Play next</button>
                    <button disabled={addingRequest} onClick={() => void playSearchResult(result, "append")}>Add to queue</button>
                    <button disabled={addingRequest} onClick={() => void playSearchResult(result, "append-play")}>Play now</button>
                    <button disabled={addingRequest} onClick={() => void playSearchResult(result, "add-to-playlist")}>Add to playlist</button>
                  </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="library-layout">
            <section className="track-section" aria-labelledby="tracks-title">
              {!displayView && (
                <>
                  <div className="section-heading"><div><span className="eyebrow">UP NEXT</span><h2 id="tracks-title">Your queue.</h2></div><span className="count-pill">{requestedUpcoming.length} requested</span></div>
                  {feedback && <p className="embed-notice" role="status">{feedback}</p>}{connection.error && <p className="embed-notice" role="alert">{connection.error}</p>}
                  <ul className="queue-list">
                    {requestedUpcoming.map((song) => (
                      <li key={song.id} className="queue-row">
                        <span className={`track-art bg-gradient-to-br ${song.gradient}`}><MusicNoteIcon /></span>
                        <span className="queue-row-info"><strong>{song.title}</strong><small>Added by {song.requestedBy?.name ?? "Mirc"}</small></span>
                        <button aria-label={`Play ${song.title} next`} onClick={() => void send({ type: "promote", value: song.id })}><NextIcon /></button>
                        <button aria-label={`Remove ${song.title}`} onClick={() => void send({ type: "remove", value: song.id })}>×</button>
                      </li>
                    ))}
                    {requestedUpcoming.length === 0 && <li className="empty-state"><p>No requests yet. Search above to add a song.</p></li>}
                  </ul>
                  {catalogRemaining > 0 && <p className="queue-fallback-note">+{catalogRemaining} more from the full playlist</p>}
                  <button className="catalog-toggle" aria-expanded={catalogOpen} onClick={() => setCatalogOpen((open) => !open)}>{catalogOpen ? "Hide full playlist" : "Browse full playlist"}</button>
                  {catalogOpen && (
                    <div className="catalog-panel">
                      <div className="track-table-heading" aria-hidden="true"><span>#</span><span>TRACK / ARTIST</span><span className="movie-column">MOVIE</span><span>TIME</span></div>
                      <ol className="track-list">
                        {catalogSongs.map((song, catalogIndex) => {
                          const liveIndex = playlist.indexOf(song);
                          const isCurrent = liveIndex === currentIndex;
                          return (
                            <li key={song.id} className="catalog-row">
                              <button onClick={() => selectSong(liveIndex)} className={`track-row ${isCurrent ? "current" : ""}`} aria-current={isCurrent ? "true" : undefined} aria-label={`${isCurrent && isPlaying ? "Pause" : "Play"} ${song.title} by ${song.artist}`}>
                                <span className="track-number">{isCurrent && isPlaying ? <span className="equalizer" aria-hidden="true"><i /><i /><i /></span> : String(catalogIndex + 1).padStart(2, "0")}</span>
                                <span className="track-info"><span className={`track-art bg-gradient-to-br ${song.gradient}`}><MusicNoteIcon /><span className="track-art-play">{isCurrent && isPlaying ? <PauseIcon /> : <PlayIcon />}</span></span><span className="track-text"><strong>{song.title}</strong><span>{song.artist}</span></span></span>
                                <span className="movie-column">{song.movie}</span><span className="track-duration">{isCurrent && duration ? formatTime(duration) : "Full"}</span>
                              </button>
                              <button className="catalog-delete" aria-label={`Delete ${song.title} from the playlist`} onClick={() => void send({ type: "remove", value: song.id })}>×</button>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  )}
                </>
              )}
            </section>

            <aside className={`now-playing ${!displayView ? "now-playing--host" : ""}`} aria-labelledby="now-playing-title">
              <div className="now-heading"><span className="eyebrow" id="now-playing-title">NOW PLAYING</span><span className={`playing-status ${isPlaying ? "live" : ""}`}>{isPlaying ? "ON AIR" : "READY"}</span></div>
              <YouTubePlayer connection={connection} />
              <div className="now-song">{feedback && displayView && <p role="status">{feedback}</p>}{connection.error && displayView && <p role="alert">{connection.error}</p>}<h3>{currentSong.title}</h3><p>{currentSong.artist}</p><span className="movie-tag">{currentSong.movie}</span></div>
              {displayView && <div className="up-next"><span className="eyebrow">UP NEXT</span><button onClick={goNext}><span className={`track-art bg-gradient-to-br ${upcomingSong.gradient}`}><MusicNoteIcon /></span><span><strong>{upcomingSong.title}</strong><small>{upcomingSong.artist}</small></span><NextIcon /></button></div>}
              {displayView && <p className="listening-note">Play next and Add to queue keep the current song playing. Play now starts your request immediately.</p>}
            </aside>
          </div>
        </main>
      </div>

      <footer className="player-bar" aria-label="Playback controls">
        <div className="player-song"><span className={`track-art bg-gradient-to-br ${currentSong.gradient}`}><MusicNoteIcon /></span><div><strong>{currentSong.title}</strong><span>{currentSong.artist}</span></div></div>
        <div className="player-center"><div className="transport"><button onClick={goPrev} disabled={!playerReady} aria-label="Previous song"><PrevIcon /></button><button className="play-button" onClick={togglePlayPause} disabled={!playerReady} aria-label={isPlaying ? "Pause" : "Play"}>{isPlaying ? <PauseIcon /> : <PlayIcon />}</button><button onClick={goNext} disabled={!playerReady} aria-label="Next song"><NextIcon /></button></div><div className="seek-control"><span>{formatTime(currentTime)}</span><input aria-label="Seek playback" type="range" min={0} max={duration || 0} step={0.1} value={Math.min(currentTime, duration || 0)} onChange={handleSeek} disabled={!duration} style={{ background: `linear-gradient(to right, #c4b5fd ${progressPct}%, #34313e ${progressPct}%)` }} /><span>{formatTime(duration)}</span></div></div>
        <div className="player-options">
          <label className="fade-control" title="YouTube allows one playing video at a time. Loading may leave a gap.">Transition
            <select aria-label="Transition duration" aria-describedby="fade-description" value={fadeSeconds} onChange={e => setFadeSeconds(Number(e.target.value))}>
              <option value={0}>Off</option><option value={2}>2s</option><option value={3}>3s</option><option value={5}>5s</option><option value={8}>8s</option>
            </select>
          </label>
          <span id="fade-description" className="fade-description">YouTube fade-out / fade-in</span>
          <div className="volume-control"><VolumeIcon /><input aria-label="Volume" type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => setVolume(Number(e.target.value))} style={{ background: `linear-gradient(to right, #c4b5fd ${volume * 100}%, #34313e ${volume * 100}%)` }} /><span>{Math.round(volume * 100)}%</span></div>
        </div>
      </footer>
    </div>
  );
}
