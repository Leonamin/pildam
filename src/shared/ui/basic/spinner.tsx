export type SpinnerProps = {
  variant?: "ring" | "orbit";
  size?: "small" | "medium" | "large";
  tone?: "accent" | "muted" | "inherit";
  label?: string;
  isDecorative?: boolean;
};

export function Spinner({
  variant = "ring",
  size = "medium",
  tone = "accent",
  label = "불러오는 중",
  isDecorative = false,
}: SpinnerProps) {
  return (
    <span
      className={`gc-spinner gc-spinner-${variant} gc-spinner-${size} gc-spinner-tone-${tone}`}
      role={isDecorative ? undefined : "status"}
      aria-label={isDecorative ? undefined : label}
      aria-atomic={isDecorative ? undefined : true}
      aria-hidden={isDecorative || undefined}
    >
      {variant === "ring" ? (
        <svg
          className="gc-spinner-ring-art"
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <circle className="gc-spinner-track" cx="16" cy="16" r="12" />
          <circle
            className="gc-spinner-arc"
            cx="16"
            cy="16"
            r="12"
            pathLength="100"
            strokeDasharray="72 28"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <span className="gc-spinner-orbit-art" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <span className="gc-spinner-orbiter" key={index} />
          ))}
        </span>
      )}
      {!isDecorative && <span className="gc-sr-only">{label}</span>}
    </span>
  );
}
