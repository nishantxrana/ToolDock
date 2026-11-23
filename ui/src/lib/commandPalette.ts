let opener: (() => void) | null = null;

/** Registered by <CommandPalette /> while mounted. */
export function registerCommandPalette(open: (() => void) | null) {
  opener = open;
}

/** Open the palette from anywhere (e.g. the header search button). */
export function showCommandPalette() {
  opener?.();
}
