// Tracks the pathname of the previous location (in navigation order) so
// navigation UI — the "Back to dashboard" button — can tell whether the
// dashboard is the page the user just came from. ScrollManager calls
// recordHistoryEntry on every navigation, which shifts current -> previous.
let previous: string | null = null;
let current: string | null = null;

export function recordHistoryEntry(pathname: string): void {
  // Ignore repeats of the same pathname (e.g. a hash-only change or a StrictMode
  // double-invoke) so they don't clobber the real previous entry.
  if (pathname === current) {
    return;
  }
  previous = current;
  current = pathname;
}

// Pathname of the page the user navigated from, or null if there isn't one
// (first entry / deep link / hard refresh).
export function previousPathname(): string | null {
  return previous;
}
