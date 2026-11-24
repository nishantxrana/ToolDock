import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge only knows Tailwind's built-in font sizes. Without this, the
 * custom `text-13` and `text-2xs` sizes (tailwind.config.ts) are read as text
 * colours and silently remove a colour class like `text-primary-foreground`,
 * which left small primary buttons with unreadable text.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['13', '2xs'] }],
    },
  },
});

/** Merge Tailwind class names, resolving conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
