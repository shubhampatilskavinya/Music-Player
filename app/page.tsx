"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { songs, type Song } from "./songs";
import { playbackGain } from "./playback-fade";
import {
  MusicNoteIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  SearchIcon,
  VolumeIcon,
} from "./icons";

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  loadVideoById: (videoId: string) => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
};

type YTEvent = { target: YTPlayer; data: number };

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        options: {
          videoId: string;
          playerVars: Record<string, number>;
          events: {
            onReady: (e: YTEvent) => void;
            onStateChange: (e: YTEvent) => void;
            onError: (e: YTEvent) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        UNSTARTED: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function clipLength(duration: string) {
  const [minutes, seconds] = duration.split(":").map(Number);
  return minutes * 60 + seconds;
}

function formatSession(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${remainingSeconds}`;
}

type SearchResult = {
  videoId: string;
  title: string;
  channel: string;
  duration: string;
};

const PARTY_SECONDS = 3 * 60 * 60;

export default function Home() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [needsUserStart, setNeedsUserStart] = useState(false);
  const [embedNotice, setEmbedNotice] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(clipLength(songs[0].duration));
  const [volume, setVolume] = useState(0.8);
  const [fadeSeconds, setFadeSeconds] = useState(3);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [customSong, setCustomSong] = useState<Song | null>(null);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [partyFinished, setPartyFinished] = useState(false);

  const playerRef = useRef<YTPlayer | null>(null);
  const audioSettingsRef = useRef({ volume: 0.8, fadeSeconds: 3 });
  const gainRef = useRef(0);
  const loadedVideoIdRef = useRef(songs[0].youtubeId);
  const customSongRef = useRef<Song | null>(null);
  const advancingRef = useRef(false);
  const partyFinishedRef = useRef(false);
  const sessionSecondsRef = useRef(0);
  const errorStreakRef = useRef(0);

  const currentSong = customSong ?? songs[currentIndex];
  const upcomingSong = customSong ? songs[currentIndex] : songs[(currentIndex + 1) % songs.length];

  const visibleSongs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs.map((song, index) => ({ song, index }));
    return songs
      .map((song, index) => ({ song, index }))
      .filter(
        ({ song }) =>
          song.title.toLowerCase().includes(q) ||
          song.artist.toLowerCase().includes(q) ||
          song.movie.toLowerCase().includes(q)
      );
  }, [query]);

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
    setSearchResults([]);
    setSearchError(null);
    setSearchLoading(value.trim().length >= 2);
  };

  const advanceTrack = () => {
    if (advancingRef.current || partyFinishedRef.current) return;
    advancingRef.current = true;
    if (customSongRef.current) {
      customSongRef.current = null;
      setCustomSong(null);
    } else {
      setCurrentIndex((previous) => (previous + 1) % songs.length);
    }
  };

  const resetFinishedSession = () => {
    if (!partyFinishedRef.current) return;
    partyFinishedRef.current = false;
    sessionSecondsRef.current = 0;
    setPartyFinished(false);
    setSessionSeconds(0);
  };

  const playSearchResult = (result: SearchResult) => {
    resetFinishedSession();
    const selected: Song = {
      id: -1,
      title: result.title,
      artist: result.channel || "YouTube",
      movie: "YouTube request",
      duration: result.duration.match(/^\d+:\d{2}$/) ? result.duration : "5:00",
      gradient: "from-fuchsia-500 to-indigo-500",
      youtubeId: result.videoId,
      external: true,
    };
    customSongRef.current = selected;
    setCustomSong(selected);
    updateQuery("");
  };

  const attemptPlay = (player: YTPlayer) => {
    player.playVideo();
    setTimeout(() => {
      const YT = window.YT;
      const state = player.getPlayerState();
      if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) {
        setNeedsUserStart(true);
      }
    }, 1200);
  };

  // Load the YouTube IFrame API once and create a single player instance.
  useEffect(() => {
    const createPlayer = () => {
      playerRef.current = new window.YT.Player("yt-player", {
        videoId: songs[0].youtubeId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          fs: 0,
          disablekb: 1,
          playsinline: 1,
        },
        events: {
          onReady: (e: YTEvent) => {
            setPlayerReady(true);
            e.target.setVolume(audioSettingsRef.current.fadeSeconds ? 0 : audioSettingsRef.current.volume * 100);
            attemptPlay(e.target);
          },
          onStateChange: (e: YTEvent) => {
            const YT = window.YT;
            if (e.data === YT.PlayerState.ENDED) {
              advanceTrack();
            } else if (e.data === YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              errorStreakRef.current = 0;
              setNeedsUserStart(false);
              setEmbedNotice(null);
            } else if (e.data === YT.PlayerState.PAUSED) {
              setIsPlaying(false);
            }
          },
          onError: (e: YTEvent) => {
            errorStreakRef.current += 1;
            if (errorStreakRef.current >= 5) {
              setEmbedNotice("Several videos could not play here. Try another song or open YouTube directly.");
              e.target.pauseVideo();
            } else {
              setEmbedNotice("That video can't be played here — skipping to the next song.");
              advanceTrack();
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
      window.onYouTubeIframeAPIReady = createPlayer;
    }

    return () => {
      playerRef.current?.destroy?.();
    };
  }, []);

  // The opening video is already loaded when the player is created.
  useEffect(() => {
    const player = playerRef.current;
    if (!playerReady || !player) return;
    if (loadedVideoIdRef.current === currentSong.youtubeId && !advancingRef.current) return;
    loadedVideoIdRef.current = currentSong.youtubeId;
    advancingRef.current = false;
    setCurrentTime(0);
    setDuration(clipLength(currentSong.duration));
    gainRef.current = audioSettingsRef.current.fadeSeconds ? 0 : 1;
    player.setVolume(gainRef.current * audioSettingsRef.current.volume * 100);
    player.loadVideoById(currentSong.youtubeId);
    attemptPlay(player);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, customSong, playerReady]);

  // Poll playback progress — the IFrame API has no timeupdate event.
  useEffect(() => {
    if (!playerReady) return;
    const id = setInterval(() => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== "function") return;
      const clipDuration = clipLength(currentSong.duration);
      const videoDuration = player.getDuration() || 0;
      const effectiveDuration = currentSong.external
        ? videoDuration || clipDuration
        : videoDuration > 0 ? Math.min(clipDuration, videoDuration) : clipDuration;
      const elapsed = player.getCurrentTime() || 0;
      setCurrentTime(Math.min(elapsed, effectiveDuration));
      setDuration(effectiveDuration);
      if (player.getPlayerState() === window.YT.PlayerState.PLAYING) {
        const settings = audioSettingsRef.current;
        gainRef.current = playbackGain(elapsed, effectiveDuration, settings.fadeSeconds);
        player.setVolume(settings.volume * 100 * gainRef.current);
      }
      if (elapsed >= effectiveDuration && player.getPlayerState() === window.YT.PlayerState.PLAYING) {
        advanceTrack();
      }
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerReady, currentIndex, customSong]);

  useEffect(() => {
    if (!playerReady) return;
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player || partyFinishedRef.current || player.getPlayerState() !== window.YT.PlayerState.PLAYING) return;
      sessionSecondsRef.current = Math.min(PARTY_SECONDS, sessionSecondsRef.current + 1);
      setSessionSeconds(sessionSecondsRef.current);
      if (sessionSecondsRef.current >= PARTY_SECONDS) {
        partyFinishedRef.current = true;
        setPartyFinished(true);
        player.pauseVideo();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [playerReady]);

  useEffect(() => {
    audioSettingsRef.current = { volume, fadeSeconds };
    if (!fadeSeconds) gainRef.current = 1;
    playerRef.current?.setVolume?.(volume * 100 * gainRef.current);
  }, [volume, fadeSeconds]);

  const handleStart = () => {
    const player = playerRef.current;
    if (!player) return;
    player.playVideo();
    setNeedsUserStart(false);
  };

  const togglePlayPause = () => {
    const player = playerRef.current;
    if (!player) return;
    if (partyFinishedRef.current) {
      partyFinishedRef.current = false;
      sessionSecondsRef.current = 0;
      setPartyFinished(false);
      setSessionSeconds(0);
      setCurrentIndex(0);
      customSongRef.current = null;
      setCustomSong(null);
      loadedVideoIdRef.current = songs[0].youtubeId;
      gainRef.current = audioSettingsRef.current.fadeSeconds ? 0 : 1;
      player.setVolume(gainRef.current * audioSettingsRef.current.volume * 100);
      player.loadVideoById(songs[0].youtubeId);
      attemptPlay(player);
      return;
    }
    if (needsUserStart) return handleStart();
    if (isPlaying) player.pauseVideo();
    else player.playVideo();
  };

  const selectSong = (index: number) => {
    resetFinishedSession();
    if (customSongRef.current) {
      customSongRef.current = null;
      setCustomSong(null);
      if (index === currentIndex) return;
    }
    if (index === currentIndex) {
      togglePlayPause();
      return;
    }
    setCurrentIndex(index);
  };

  const goPrev = () => {
    resetFinishedSession();
    customSongRef.current = null;
    setCustomSong(null);
    setCurrentIndex((previous) => (previous - 1 + songs.length) % songs.length);
  };
  const goNext = () => {
    resetFinishedSession();
    customSongRef.current = null;
    setCustomSong(null);
    setCurrentIndex((previous) => (previous + 1) % songs.length);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    gainRef.current = playbackGain(value, duration, fadeSeconds);
    playerRef.current?.setVolume?.(volume * 100 * gainRef.current);
    playerRef.current?.seekTo?.(value, true);
    setCurrentTime(value);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const totalMinutes = Math.round(songs.reduce((total, song) => total + clipLength(song.duration), 0) / 60);

  return (
    <div className="music-app">
      <aside className="sidebar">
        <a className="brand" href="#"><span className="brand-mark"><MusicNoteIcon /></span><span>Bollywood<span className="brand-second">beats.</span></span></a>
        <p className="eyebrow sidebar-label">YOUR COLLECTION</p>
        <a className="nav-item active" href="#playlist"><MusicNoteIcon /> DJ party mix <span>{songs.length}</span></a>
        <div className="sidebar-note"><span className="mini-record" aria-hidden="true" /><h3>Turn it up.<br />Keep the party going.</h3><p>Three hours of Bollywood DJ remixes. Search YouTube to play a request any time.</p><span className="small-label">CURATED WITH LOVE</span></div>
        <div className="sidebar-bottom"><span className="status-dot" /> Music brings us together</div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <span className="topbar-title">Your 3-hour party soundtrack</span>
          <label className="search-box"><SearchIcon /><input aria-label="Search any song on YouTube" value={query} onChange={(e) => updateQuery(e.target.value)} placeholder="Search any song on YouTube…" />{query && <button aria-label="Clear search" onClick={() => updateQuery("")}>×</button>}</label>
          <span className="profile-badge" aria-label="Bollywood Beats">BB</span>
        </header>

        <main id="playlist" className="content">
          <section className="playlist-hero" aria-labelledby="playlist-title">
            <div className="playlist-art" aria-hidden="true"><span className="art-caption">THE 3-HOUR DJ PARTY</span><div className="vinyl"><div className="vinyl-label"><MusicNoteIcon /></div></div><span className="art-title">bollywood<br /><i>forever.</i></span><span className="art-edition">VOL. 01 / {songs.length} REMIXES</span></div>
            <div className="hero-copy"><span className="eyebrow"><span className="status-dot" /> YOUR PARTY STARTS HERE</span><h1 id="playlist-title">Bollywood<br /><span>DJ Party Mix.</span></h1><p>{songs.length} DJ remixes for a 3-hour session. Songs advance automatically, and requests from search play before the playlist resumes.</p><div className="playlist-meta"><span className="curator-mark"><MusicNoteIcon /></span><strong>Bollywood Beats</strong><span>·</span><span>{songs.length} remixes</span><span>·</span><span>{totalMinutes} min planned</span></div><p className="session-timer" aria-live="off">Party time: {formatSession(sessionSeconds)} / 3:00:00</p><button className="primary-button" onClick={togglePlayPause} disabled={!playerReady}>{partyFinished ? <PlayIcon /> : isPlaying ? <PauseIcon /> : <PlayIcon />}{partyFinished ? "Start another 3 hours" : isPlaying ? "Pause playlist" : "Play playlist"}</button></div>
          </section>

          {query.trim().length >= 2 && (
            <section className="youtube-results" aria-labelledby="youtube-results-title">
              <div className="section-heading"><div><span className="eyebrow">SONG REQUESTS</span><h2 id="youtube-results-title">YouTube search results</h2></div><span className="count-pill">{searchLoading ? "Searching…" : `${searchResults.length} videos`}</span></div>
              {searchError && <p className="search-feedback" role="status">{searchError} <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer">Search on YouTube</a></p>}
              {!searchLoading && !searchError && searchResults.length === 0 && <p className="search-feedback">No videos found. Try a different song name.</p>}
              <div className="youtube-result-list">
                {searchResults.map((result) => (
                  <button key={result.videoId} className="youtube-result" onClick={() => playSearchResult(result)} aria-label={`Play ${result.title} by ${result.channel}`}>
                    <span className="track-art bg-gradient-to-br from-fuchsia-500 to-indigo-500"><PlayIcon /></span>
                    <span className="youtube-result-copy"><strong>{result.title}</strong><small>{result.channel}</small></span>
                    <span className="track-duration">{result.duration}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="library-layout">
            <section className="track-section" aria-labelledby="tracks-title">
              <div className="section-heading"><div><span className="eyebrow">THE PLAYLIST</span><h2 id="tracks-title">Made for your repeat button.</h2></div><span className="count-pill">{visibleSongs.length} tracks</span></div>
              {embedNotice && <p className="embed-notice" role="status">{embedNotice}</p>}
              <div className="track-table-heading" aria-hidden="true"><span>#</span><span>TRACK / ARTIST</span><span className="movie-column">MOVIE</span><span>TIME</span></div>
              <ol className="track-list">
                {visibleSongs.map(({ song, index }) => {
                  const isCurrent = index === currentIndex;
                  return (
                    <li key={song.id}>
                      <button onClick={() => selectSong(index)} className={`track-row ${isCurrent ? "current" : ""}`} aria-current={isCurrent ? "true" : undefined} aria-label={`${isCurrent && isPlaying ? "Pause" : "Play"} ${song.title} by ${song.artist}`}>
                        <span className="track-number">{isCurrent && isPlaying ? <span className="equalizer" aria-hidden="true"><i /><i /><i /></span> : String(index + 1).padStart(2, "0")}</span>
                        <span className="track-info"><span className={`track-art bg-gradient-to-br ${song.gradient}`}><MusicNoteIcon /><span className="track-art-play">{isCurrent && isPlaying ? <PauseIcon /> : <PlayIcon />}</span></span><span className="track-text"><strong>{song.title}</strong><span>{song.artist}</span></span></span>
                        <span className="movie-column">{song.movie}</span><span className="track-duration">~{song.durationLabel ?? song.duration}</span>
                      </button>
                    </li>
                  );
                })}
                {visibleSongs.length === 0 && <li className="empty-state"><SearchIcon /><h3>No tracks found</h3><p>Try another song, artist, or movie.</p><button onClick={() => setQuery("")}>Show all songs</button></li>}
              </ol>
              <p className="playlist-end">Three hours of party music, ready to roll. <MusicNoteIcon /></p>
            </section>

            <aside className="now-playing" aria-labelledby="now-playing-title">
              <div className="now-heading"><span className="eyebrow" id="now-playing-title">NOW PLAYING</span><span className={`playing-status ${isPlaying ? "live" : ""}`}>{isPlaying ? "ON AIR" : "READY"}</span></div>
              <div className={`video-frame bg-gradient-to-br ${currentSong.gradient}`}>
                <div id="yt-player" />
                {!playerReady && <div className="video-loading"><MusicNoteIcon /><span>Getting your music ready…</span></div>}
                {needsUserStart && <button onClick={handleStart} className="start-overlay"><span><PlayIcon /></span>Tap to start listening</button>}
              </div>
              <div className="now-song"><h3>{currentSong.title}</h3><p>{currentSong.artist}</p><span className="movie-tag">{currentSong.movie}</span></div>
              <div className="up-next"><span className="eyebrow">UP NEXT</span><button onClick={goNext}><span className={`track-art bg-gradient-to-br ${upcomingSong.gradient}`}><MusicNoteIcon /></span><span><strong>{upcomingSong.title}</strong><small>{upcomingSong.artist}</small></span><NextIcon /></button></div>
              <p className="listening-note">Requests play now, then the party queue resumes.</p>
            </aside>
          </div>
        </main>
      </div>

      <footer className="player-bar" aria-label="Playback controls">
        <div className="player-song"><span className={`track-art bg-gradient-to-br ${currentSong.gradient}`}><MusicNoteIcon /></span><div><strong>{currentSong.title}</strong><span>{currentSong.artist}</span></div></div>
        <div className="player-center"><div className="transport"><button onClick={goPrev} disabled={!playerReady} aria-label="Previous song"><PrevIcon /></button><button className="play-button" onClick={togglePlayPause} disabled={!playerReady} aria-label={isPlaying ? "Pause" : "Play"}>{isPlaying ? <PauseIcon /> : <PlayIcon />}</button><button onClick={goNext} disabled={!playerReady} aria-label="Next song"><NextIcon /></button></div><div className="seek-control"><span>{formatTime(currentTime)}</span><input aria-label="Seek playback" type="range" min={0} max={duration || 0} step={0.1} value={Math.min(currentTime, duration || 0)} onChange={handleSeek} disabled={!duration} style={{ background: `linear-gradient(to right, #c4b5fd ${progressPct}%, #34313e ${progressPct}%)` }} /><span>{formatTime(duration)}</span></div></div>
        <div className="player-options">
          <label className="fade-control" title="Fade out, then fade in. YouTube loading may leave a gap.">Crossfade
            <select aria-label="Crossfade duration" aria-describedby="fade-description" value={fadeSeconds} onChange={e => setFadeSeconds(Number(e.target.value))}>
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
