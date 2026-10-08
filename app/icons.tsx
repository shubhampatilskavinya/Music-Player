export function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8 5.14v13.72c0 .74.81 1.2 1.46.81l10.9-6.86a.96.96 0 0 0 0-1.62L9.46 4.33A.96.96 0 0 0 8 5.14Z" />
    </svg>
  );
}

export function PauseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M7 5a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 7 19h1.5A1.5 1.5 0 0 0 10 17.5v-11A1.5 1.5 0 0 0 8.5 5H7Zm9 0a1.5 1.5 0 0 0-1.5 1.5v11A1.5 1.5 0 0 0 16 19h1.5a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 17.5 5H16Z" />
    </svg>
  );
}

export function PrevIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M7 5a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm12.3.46a.96.96 0 0 1 .7.9v11.28a.96.96 0 0 1-1.46.81L8.1 12.62a.96.96 0 0 1 0-1.62l10.44-6.83c.21-.14.47-.2.76-.11Z" />
    </svg>
  );
}

export function NextIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17 5a1 1 0 0 1 1 1v12a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1ZM4.7 5.46a.96.96 0 0 1 .76-.11l10.44 6.83a.96.96 0 0 1 0 1.62L5.46 20.63a.96.96 0 0 1-1.46-.81V8.54a.96.96 0 0 1 .7-.9Z" />
    </svg>
  );
}

export function VolumeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4 9.5A1.5 1.5 0 0 1 5.5 8H8l4.3-3.86a1 1 0 0 1 1.7.73v14.26a1 1 0 0 1-1.7.73L8 16H5.5A1.5 1.5 0 0 1 4 14.5v-5Z" />
      <path d="M16.3 8.7a1 1 0 0 1 1.4 0 6 6 0 0 1 0 8.6 1 1 0 0 1-1.4-1.42 4 4 0 0 0 0-5.76 1 1 0 0 1 0-1.42Z" />
    </svg>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

export function MusicNoteIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 3v10.55A3.5 3.5 0 1 0 14 16.5V7h4V3h-6Z" />
    </svg>
  );
}
