export default function MicBadge({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="46" stroke="#3b82f6" strokeWidth="3" strokeDasharray="1 7" strokeLinecap="round" />
      <circle cx="50" cy="50" r="38" stroke="#ef4444" strokeWidth="2" strokeDasharray="5 4" />
      <circle cx="50" cy="50" r="33" fill="#ffffff" />
      <rect x="41" y="24" width="18" height="30" rx="9" fill="#3a3a3a" />
      <line x1="41" y1="34" x2="59" y2="34" stroke="#ffffff" strokeWidth="1.5" />
      <line x1="41" y1="40" x2="59" y2="40" stroke="#ffffff" strokeWidth="1.5" />
      <line x1="41" y1="46" x2="59" y2="46" stroke="#ffffff" strokeWidth="1.5" />
      <path d="M32 48 a18 18 0 0 0 36 0" stroke="#3a3a3a" strokeWidth="3" strokeLinecap="round" fill="none" />
      <line x1="50" y1="66" x2="50" y2="73" stroke="#3a3a3a" strokeWidth="3" strokeLinecap="round" />
      <line x1="39" y1="73" x2="61" y2="73" stroke="#3a3a3a" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
