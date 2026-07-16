import { useEffect, useState } from "react";

/**
 * A numeric input that doesn't depend on the browser's locale settings.
 * Native <input type="number"> renders and expects a decimal separator
 * based on the OS locale (comma in many non-US locales), which looks like
 * a bug ("0,2" instead of "0.2") and can silently reject typed input.
 * This always displays and accepts a period, while still parsing a comma
 * if one's typed, so it works the same for everyone regardless of locale.
 */
export function NumberField({
  value,
  onChange,
  step = 0.1,
  min,
  max,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit(raw: string) {
    const normalized = raw.replace(",", ".");
    const parsed = parseFloat(normalized);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
      onChange(clamped);
      setDraft(String(clamped));
    } else {
      setDraft(String(value));
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
      }}
      step={step}
    />
  );
}
