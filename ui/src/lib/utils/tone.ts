export type Tone = 'success' | 'warning' | 'destructive' | 'info' | 'neutral' | 'primary';

/** Dot / bar colour per tone - used for status markers in tables, legends and chips. */
export const TONE_MARK: Record<Tone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  info: 'bg-info',
  primary: 'bg-primary',
  neutral: 'bg-border-strong',
};
