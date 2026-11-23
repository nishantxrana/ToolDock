import { Segmented } from '@/components/ui/segmented';

interface FormatToggleProps<T extends string> {
  formats: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}

/** Output format picker (CSV / JSON / TXT / XLSX). */
export function FormatToggle<T extends string>({ formats, value, onChange }: FormatToggleProps<T>) {
  return (
    <Segmented
      label="File format"
      options={formats.map((f) => ({ value: f.id, label: f.label }))}
      value={value}
      onChange={onChange}
    />
  );
}
