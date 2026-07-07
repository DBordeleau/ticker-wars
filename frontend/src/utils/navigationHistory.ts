// Tracks the pathname of the previous location (in navigation order) so
// navigation UI can tell whether this tab has moved within the app at least
// once. ScrollManager calls recordHistoryEntry on every navigation, which
// shifts current -> previous.
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

export function hasPreviousBrowserEntry(): boolean {
  const historyIndex = window.history.state?.idx;
  if (typeof historyIndex === "number") {
    return historyIndex > 0;
  }

  return previous !== null;
}
