interface StarLogoProps {
  size?: number;
  color?: string;
}

export default function StarLogo({ size = 28, color = "currentColor" }: StarLogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2 L14.5 9 L22 9.5 L16 14.2 L18 21.5 L12 17.3 L6 21.5 L8 14.2 L2 9.5 L9.5 9 Z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
