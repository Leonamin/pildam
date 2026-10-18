export function Switch({
  label,
  isChecked,
  isDisabled = false,
  onCheckedChange,
}: {
  label: string;
  isChecked: boolean;
  isDisabled?: boolean;
  onCheckedChange: (isChecked: boolean) => void;
}) {
  return (
    <label className="gc-choice">
      <input
        className="gc-switch"
        role="switch"
        type="checkbox"
        checked={isChecked}
        disabled={isDisabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
