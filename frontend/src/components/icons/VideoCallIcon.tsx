export default function VideoCallIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="2" y="5" width="14" height="14" rx="3" />
      <path d="M17 9.2 L22 6.3 V17.7 L17 14.8 Z" />
    </svg>
  );
}
