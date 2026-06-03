interface SpinnerProps {
  large?: boolean;
  label?: string;
}

export default function Spinner({ large, label }: SpinnerProps) {
  return (
    <span
      className={large ? "spinner spinner--lg" : "spinner"}
      role="status"
      aria-label={label ?? "Loading"}
    />
  );
}
