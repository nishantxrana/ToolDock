import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils/cn';

describe('cn', () => {
  it('treats the custom font sizes as sizes, not colours', () => {
    expect(cn('text-primary-foreground', 'text-13')).toBe('text-primary-foreground text-13');
    expect(cn('text-muted-foreground', 'text-2xs')).toBe('text-muted-foreground text-2xs');
    expect(cn('text-sm', 'text-13')).toBe('text-13');
    expect(cn('text-red-500', 'text-foreground')).toBe('text-foreground');
  });
});
