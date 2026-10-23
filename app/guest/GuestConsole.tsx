'use client';
import { useEffect, useState } from 'react';
import { useGuestSession } from '../music/use-guest-session';
import { MusicNoteIcon, SearchIcon } from '../icons';
import type { Song } from '../songs';

type SearchResult = { videoId: string; title: string; channel: string; duration: string };

export default function GuestConsole({ name, id }: { name: string; id: string }) {
  const { state, send, error } = useGuestSession();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  const updateQuery = (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) { setSearchResults([]); setSearchError(null); }
  };

  useEffect(() => {
    const search = query.trim();
    if (search.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchLoading(true); setSearchError(null);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(search)}`, { signal: controller.signal });
        const data: { results?: SearchResult[]; error?: string } = await response.json();
        if (!response.ok) throw new Error(data.error ?? 'Search failed.');
        setSearchResults(data.results ?? []);
      } catch (e) {
        if (controller.signal.aborted) return;
        setSearchResults([]);
        setSearchError(e instanceof Error ? e.message : 'Search failed.');
      } finally { if (!controller.signal.aborted) setSearchLoading(false); }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  if (!state) return <p className="embed-notice">Connecting to the party…</p>;

  const current = state.queue[state.index];
  const upcoming = state.queue.slice(state.index + 1);
  const requested = upcoming.filter(s => s.requestedBy);
  const catalogRemaining = upcoming.length - requested.length;

  const addSong = async (result: SearchResult, type: 'play-next' | 'append') => {
    if (busy) return;
    setBusy(true);
    const song: Song = { id: 0, title: result.title, artist: result.channel, movie: 'YouTube request', duration: '', gradient: 'from-fuchsia-500 to-indigo-500', youtubeId: result.videoId };
    try {
      if (await send({ type, song })) {
        setFeedback(type === 'play-next' ? `${result.title} will play next.` : `${result.title} added to the queue.`);
        updateQuery('');
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="guest-screen">
      <header className="guest-header">
        <strong>Mirc Beats</strong>
        <span>Hi, {name}</span>
      </header>

      <section className="now-playing guest-now-playing">
        <span className="eyebrow">NOW PLAYING</span>
        <div className="now-song"><h3>{current.title}</h3><p>{current.artist}</p><span className="movie-tag">{current.movie}</span></div>
      </section>

      <label className="search-box"><SearchIcon /><input type="search" autoCorrect="off" autoCapitalize="none" autoComplete="off" spellCheck={false} enterKeyHint="search" aria-label="Search any song on YouTube" value={query} onChange={e => updateQuery(e.target.value)} placeholder="Search a song to add…" />{query && <button aria-label="Clear search" onClick={() => updateQuery('')}>×</button>}</label>

      {feedback && <p className="embed-notice" role="status">{feedback}</p>}
      {error && <p className="embed-notice" role="alert">{error}</p>}

      {query.trim().length >= 2 && (
        <section className="youtube-results">
          {searchError && <p className="search-feedback">{searchError}</p>}
          {!searchLoading && !searchError && searchResults.length === 0 && <p className="search-feedback">No videos found.</p>}
          <div className="youtube-result-list">
            {searchResults.map(result => (
              <div key={result.videoId} className="youtube-result-item">
                <div className="youtube-result"><span className="track-art bg-gradient-to-br from-fuchsia-500 to-indigo-500"><MusicNoteIcon /></span><span className="youtube-result-copy"><strong>{result.title}</strong><small>{result.channel}</small></span></div>
                <div className="request-actions">
                  <button disabled={busy} onClick={() => void addSong(result, 'play-next')}>Play next</button>
                  <button disabled={busy} onClick={() => void addSong(result, 'append')}>Add to queue</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="queue-panel">
        <span className="eyebrow">UP NEXT</span>
        <ul className="queue-list">
          {requested.map(song => (
            <li key={song.id} className="queue-row">
              <span className={`track-art bg-gradient-to-br ${song.gradient}`}><MusicNoteIcon /></span>
              <span className="queue-row-info"><strong>{song.title}</strong><small>Added by {song.requestedBy?.name}</small></span>
              {song.requestedBy?.id === id && <button aria-label={`Remove ${song.title}`} onClick={() => void send({ type: 'remove', value: song.id })}>×</button>}
            </li>
          ))}
          {requested.length === 0 && <li className="empty-state"><p>No requests yet. Add a song!</p></li>}
        </ul>
        {catalogRemaining > 0 && <p className="queue-fallback-note">+{catalogRemaining} more from the full playlist</p>}
      </section>
    </div>
  );
}
