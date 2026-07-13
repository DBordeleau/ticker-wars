import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FiSearch, FiUser } from "react-icons/fi";
import { useLocation, useNavigate } from "react-router-dom";
import { searchPublicUsers } from "../../api/siteSearch";
import { buildDiceBearAvatarUrl, avatarOptionsFromSeed } from "../../auth/avatar";
import { useDashboardData } from "../../hooks/useDashboardData";
import { searchableModels } from "../../utils/models";
import { mergeSearchResults, normalizeSearchQuery, searchLocalEntities, type SiteSearchResult } from "../../utils/siteSearch";
import TickerLogoMark from "../tickers/TickerLogoMark";
import SwipeSheet from "../layout/SwipeSheet";

type Props = { mobile?: boolean; opened?: boolean; onClose?: () => void };

export default function SiteSearch({ mobile = false, opened: controlledOpen, onClose }: Props) {
  const dashboard = useDashboardData();
  const navigate = useNavigate();
  const location = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const instanceId = useId().replace(/:/g, "");
  const listboxId = `site-search-results-${instanceId}`;
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<SiteSearchResult[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState(false);
  const [active, setActive] = useState(0);
  const open = mobile ? Boolean(controlledOpen) : internalOpen;
  const local = useMemo(
    () => searchLocalEntities(query, dashboard.tickerAssets, searchableModels),
    [dashboard.tickerAssets, query],
  );
  const results = useMemo(() => mergeSearchResults(local, users), [local, users]);

  const close = () => {
    if (mobile) onClose?.();
    else setInternalOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (mobile) onClose?.();
    else setInternalOpen(false);
    setQuery("");
  }, [location.pathname, mobile, onClose]);

  useEffect(() => {
    const normalized = normalizeSearchQuery(query);
    setActive(0);
    setPeopleError(false);
    if (normalized.replace(/^@/, "").length < 2) {
      setUsers([]);
      setPeopleLoading(false);
      return;
    }
    let current = true;
    setPeopleLoading(true);
    const timer = window.setTimeout(() => {
      searchPublicUsers(normalized)
        .then((value) => current && setUsers(value))
        .catch(() => {
          if (current) { setUsers([]); setPeopleError(true); }
        })
        .finally(() => current && setPeopleLoading(false));
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    if (mobile) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setInternalOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [mobile]);

  useEffect(() => {
    if (mobile) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && !target.isContentEditable) {
        event.preventDefault();
        setInternalOpen(true);
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobile]);

  const select = (result: SiteSearchResult) => {
    close();
    setQuery("");
    navigate(result.route);
  };

  const content = (
    <div className={mobile ? "site-search site-search--mobile" : "site-search"} ref={rootRef}>
      <div className="site-search-input-wrap">
        <FiSearch aria-hidden />
        <input
          ref={inputRef}
          value={query}
          type="search"
          placeholder="Search tickers, models, people…"
          aria-label="Search tickers, models, and people"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={results[active] ? `site-search-option-${instanceId}-${results[active].id}` : undefined}
          onFocus={() => !mobile && setInternalOpen(true)}
          onChange={(event) => { setQuery(event.target.value); if (!mobile) setInternalOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(value + 1, results.length - 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); }
            if (event.key === "Enter" && results[active]) { event.preventDefault(); select(results[active]); }
            if (event.key === "Escape") { event.preventDefault(); close(); }
          }}
        />
        {!mobile ? <kbd>/</kbd> : null}
      </div>
      {open ? (
        <div className="site-search-panel" id={listboxId} role="listbox">
          {!normalizeSearchQuery(query) ? (
            <div className="site-search-message">Try “AAPL”, “Chronos-2”, or a public username.</div>
          ) : results.length ? results.map((result, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === active}
              id={`site-search-option-${instanceId}-${result.id}`}
              key={result.id}
              className={`site-search-result${index === active ? " site-search-result--active" : ""}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => select(result)}
            >
              <ResultIcon result={result} />
              <span className="site-search-result-copy">
                <strong>{result.primary}</strong>
                <span>{result.secondary}</span>
              </span>
              <span className={`site-search-kind site-search-kind--${result.kind}`}>{result.kind}</span>
            </button>
          )) : peopleLoading ? (
            <div className="site-search-message">Searching public profiles…</div>
          ) : (
            <div className="site-search-message">No tickers, models, or public people found.</div>
          )}
          {results.length && peopleLoading ? <div className="site-search-status">Searching public profiles…</div> : null}
          {peopleError ? <div className="site-search-status site-search-status--error">People search is temporarily unavailable.</div> : null}
          <span className="sr-only" aria-live="polite">{results.length} search results</span>
        </div>
      ) : null}
    </div>
  );

  return mobile ? (
    <SwipeSheet opened={open} onClose={close} drawerClassName="site-search-drawer" panelClassName="site-search-sheet" showClose aria-label="Site search">
      <div className="site-search-sheet-heading"><span>Find anything</span><small>Tickers, models, and public profiles</small></div>
      {content}
    </SwipeSheet>
  ) : content;
}

function ResultIcon({ result }: { result: SiteSearchResult }) {
  if (result.kind === "ticker") return <TickerLogoMark ticker={result.primary} logoUrl={result.logoUrl} />;
  if (result.kind === "user" && result.avatarSeed) return (
    <img className="site-search-avatar" src={buildDiceBearAvatarUrl(result.avatarSeed, avatarOptionsFromSeed(result.avatarSeed))} alt="" />
  );
  return <span className={`site-search-entity-icon site-search-entity-icon--${result.kind}`}>{result.kind === "user" ? <FiUser /> : result.primary.slice(0, 1)}</span>;
}
