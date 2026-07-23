import {
  fetchDashboardData,
  fetchDashboardVersion,
  type DashboardData,
} from "./dashboardData";
import {
  clearDashboardPersistentCache,
  readDashboardDataCache,
  writeDashboardDataCache,
} from "./dashboardPersistentCache";
import { isSupabaseConfigured } from "./supabaseClient";

// Shared, subscribable cache for the heavy dashboard payload (leaderboards,
// predictions, ticker assets, metadata). Every page mounts useDashboardData,
// which previously refetched the whole payload on each navigation. This store
// fetches it once per session and broadcasts updates. IndexedDB extends that
// cache across browser sessions; a tiny version read decides whether the full
// payload has changed. An explicit refresh still re-fetches and notifies all
// consumers.

type DashboardStoreState = {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
};

let state: DashboardStoreState = { data: null, loading: true, error: null };
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(next: Partial<DashboardStoreState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function subscribeDashboard(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDashboardState(): DashboardStoreState {
  return state;
}

export function resetDashboardCache() {
  inFlight = null;
  void clearDashboardPersistentCache();
  setState({ data: null, loading: false, error: null });
}

// Force a fresh fetch and broadcast the result to every mounted consumer.
export function refreshDashboard(): Promise<void> {
  if (inFlight) {
    return inFlight;
  }
  setState({ loading: true, error: null });
  inFlight = fetchAndStoreDashboard()
    .catch((caught) => setDashboardError(caught))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

// Fetch only if we have not already loaded (or are not already loading), so
// navigations reuse the cached payload.
export function ensureDashboard(): Promise<void> {
  if (state.data || inFlight) {
    return inFlight ?? Promise.resolve();
  }
  setState({ loading: true, error: null });
  inFlight = hydrateDashboard().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function hydrateDashboard(): Promise<void> {
  const cached = await readDashboardDataCache();
  if (!cached) {
    try {
      await fetchAndStoreDashboard();
    } catch (caught) {
      setDashboardError(caught);
    }
    return;
  }

  const hydrated = { ...cached, hasSupabaseConfig: isSupabaseConfigured };
  setState({ data: hydrated, loading: false, error: null });

  try {
    const latestVersion = await fetchDashboardVersion();
    if (
      !latestVersion ||
      dashboardVersionsMatch(latestVersion, hydrated.metadata?.generated_at ?? null)
    ) {
      return;
    }
    await fetchAndStoreDashboard();
  } catch {
    // The persistent result remains usable when an offline version check or
    // background refresh fails.
  }
}

async function fetchAndStoreDashboard(): Promise<void> {
  const data = await fetchDashboardData();
  setState({ data, loading: false, error: null });
  await writeDashboardDataCache(data);
}

function setDashboardError(caught: unknown) {
  setState({
    loading: false,
    error: caught instanceof Error ? caught.message : "Unable to load dashboard data.",
  });
}

function dashboardVersionsMatch(left: string, right: string | null): boolean {
  if (!right) {
    return false;
  }
  const leftTimestamp = Date.parse(left);
  const rightTimestamp = Date.parse(right);
  if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp)) {
    return leftTimestamp === rightTimestamp;
  }
  return left === right;
}
