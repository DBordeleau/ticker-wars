import { fetchDashboardData, type DashboardData } from "./dashboardData";

// Shared, subscribable cache for the heavy dashboard payload (leaderboards,
// predictions, ticker assets, metadata). Every page mounts useDashboardData,
// which previously refetched the whole payload on each navigation. This store
// fetches it once per session and broadcasts updates, so page transitions are
// instant and Supabase is queried far less. An explicit refresh (Retry, or
// after a prediction is saved) still re-fetches and notifies all consumers.

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

// Force a fresh fetch and broadcast the result to every mounted consumer.
export function refreshDashboard(): Promise<void> {
  if (inFlight) {
    return inFlight;
  }
  setState({ loading: true, error: null });
  inFlight = fetchDashboardData()
    .then((data) => {
      setState({ data, loading: false, error: null });
    })
    .catch((caught) => {
      setState({
        loading: false,
        error: caught instanceof Error ? caught.message : "Unable to load dashboard data.",
      });
    })
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
  return refreshDashboard();
}
