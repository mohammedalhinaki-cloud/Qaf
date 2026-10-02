/** شعار ماعون: إناء مُبسَّط — إشارة إلى «الماعون» الذي يُستعار ويُنتفع به. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="شعار ماعون"
      className="text-ink-accent"
    >
      <circle cx="16" cy="16" r="15" className="fill-current opacity-[0.10]" />
      <path
        d="M7.5 12.5h17l-1.6 9.2a4 4 0 0 1-3.94 3.3h-5.92a4 4 0 0 1-3.94-3.3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 12.5c0-2.6 2-4.6 4.5-4.6s4.5 2 4.5 4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M13.2 17.2h5.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}
