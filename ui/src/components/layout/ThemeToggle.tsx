import { Monitor, Moon, Sun } from 'lucide-react';
import { Segmented } from '@/components/ui/segmented';
import { useTheme, type ThemePreference } from '@/lib/utils/theme';

const OPTIONS = [
  { value: 'light', label: <Sun />, ariaLabel: 'Light theme' },
  { value: 'dark', label: <Moon />, ariaLabel: 'Dark theme' },
  { value: 'system', label: <Monitor />, ariaLabel: 'Match system theme' },
] as const satisfies readonly {
  value: ThemePreference;
  label: React.ReactNode;
  ariaLabel: string;
}[];

/** Three-way theme switch: light, dark, or follow the operating system. Persists locally. */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <Segmented
      label="Theme"
      size="xs"
      options={OPTIONS}
      value={preference}
      onChange={setPreference}
    />
  );
}
