/** Geometric mark: two Adultos whose arms meet as a roof over a small house. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="48"
      height="42"
      viewBox="0 0 72 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      {/* Left Adulto (sage/olive) */}
      <circle cx="22" cy="14" r="6" fill="var(--color-sage-500, #9AA078)" />
      <path
        d="M12 36c0-7.5 4.5-12 10-12s10 4.5 10 12"
        stroke="var(--color-olive-800, #4E5D32)"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Right Adulto (terracotta) */}
      <circle cx="50" cy="14" r="6" fill="var(--color-terracotta-500, #D88B63)" />
      <path
        d="M40 36c0-7.5 4.5-12 10-12s10 4.5 10 12"
        stroke="var(--color-terracotta-500, #D88B63)"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Meeting roof / joined arms */}
      <path
        d="M26 28 L36 20 L46 28"
        stroke="var(--color-olive-900, #3F4D2A)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* House body */}
      <rect
        x="28"
        y="36"
        width="16"
        height="14"
        rx="2"
        fill="var(--color-cream-200, #EEE6DB)"
        stroke="var(--color-olive-800, #4E5D32)"
        strokeWidth="2"
      />
      {/* Four windows */}
      <rect x="31" y="39" width="3.5" height="3.5" rx="0.5" fill="var(--color-olive-800, #4E5D32)" />
      <rect x="37.5" y="39" width="3.5" height="3.5" rx="0.5" fill="var(--color-olive-800, #4E5D32)" />
      <rect x="31" y="44.5" width="3.5" height="3.5" rx="0.5" fill="var(--color-olive-800, #4E5D32)" />
      <rect x="37.5" y="44.5" width="3.5" height="3.5" rx="0.5" fill="var(--color-olive-800, #4E5D32)" />
    </svg>
  );
}
