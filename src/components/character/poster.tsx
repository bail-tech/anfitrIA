/** Static Anfi (login page, reduced motion, no WebGL). */
export function CharacterPoster({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 220" className={className} role="img" aria-label="Anfi, el conserje de AnfitrIA">
      <ellipse cx="100" cy="206" rx="52" ry="8" fill="#000" opacity="0.18" />
      <path d="M40 92 100 40l60 52z" fill="#d0693f" />
      <rect x="46" y="86" width="108" height="104" rx="22" fill="#f7f3ec" />
      <rect x="62" y="102" width="76" height="62" rx="14" fill="#1f2a2e" />
      <circle cx="86" cy="128" r="6" fill="#9fe3c2" />
      <circle cx="114" cy="128" r="6" fill="#9fe3c2" />
      <path d="M88 146q12 9 24 0" stroke="#9fe3c2" strokeWidth="4" fill="none" strokeLinecap="round" />
      <rect x="30" y="122" width="16" height="34" rx="8" fill="#ece5d8" />
      <rect x="154" y="122" width="16" height="34" rx="8" fill="#ece5d8" />
      <circle cx="100" cy="176" r="5" fill="#c79a3c" />
      <rect x="92" y="32" width="16" height="16" rx="3" fill="#c79a3c" />
    </svg>
  );
}
