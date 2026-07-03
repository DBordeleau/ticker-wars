from __future__ import annotations

import json
import os
import platform
import sys
import time
import tracemalloc
from collections.abc import Callable
from dataclasses import asdict, dataclass, replace
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from pipeline.config import Settings
from pipeline.features.build_features import build_feature_rows
from pipeline.forecasting.horizons import FORECAST_HORIZONS
from pipeline.ingestion.ticker_universe import MVP_TICKERS
from pipeline.models.chronos_model import (
    ChronosDependencyError,
    ChronosModelLoader,
    ChronosPredictionAdapter,
)
from pipeline.models.timesfm_model import (
    TimesFMDependencyError,
    TimesFMModelLoader,
    TimesFMPredictionAdapter,
)
from pipeline.models.training import train_and_predict

DEFAULT_RUNTIME_BENCHMARK_PATH = "data_exports/runtime_benchmark.json"
DEFAULT_PRICE_DAYS = 760
DEFAULT_SIMPLE_TICKERS = 25
DEFAULT_ADAPTER_TICKERS = 3
MARKET_TICKERS: tuple[str, ...] = ()


@dataclass(frozen=True)
class BenchmarkRun:
    name: str
    status: str
    ticker_count: int
    horizon_count: int
    prediction_count: int
    cold_seconds: float | None = None
    warm_seconds: float | None = None
    package_import_seconds: float | None = None
    package_install_seconds: float | None = None
    model_download_bytes: int | None = None
    peak_python_allocated_mb: float | None = None
    rss_delta_mb: float | None = None
    rss_after_mb: float | None = None
    error: str | None = None
    notes: list[str] | None = None


def run_runtime_benchmark(
    *,
    settings: Settings,
    simple_ticker_count: int = DEFAULT_SIMPLE_TICKERS,
    adapter_ticker_count: int = DEFAULT_ADAPTER_TICKERS,
    price_days: int = DEFAULT_PRICE_DAYS,
    include_timesfm: bool = False,
    include_chronos: bool = False,
    timesfm_model_loader: TimesFMModelLoader | None = None,
    chronos_model_loader: ChronosModelLoader | None = None,
) -> dict[str, Any]:
    """Benchmark local prediction runtime without requiring Supabase."""

    simple_tickers = _selected_tickers(simple_ticker_count)
    adapter_tickers = _selected_tickers(adapter_ticker_count)
    price_rows = generate_synthetic_price_rows(
        tickers=tuple(dict.fromkeys((*simple_tickers, *MARKET_TICKERS))),
        days=price_days,
    )

    runs: list[BenchmarkRun] = [
        _benchmark_simple_models(
            price_rows=price_rows,
            ticker_count=len(simple_tickers),
        )
    ]
    runs.append(
        _benchmark_timesfm(
            settings=settings,
            tickers=adapter_tickers,
            price_days=price_days,
            include=include_timesfm,
            model_loader=timesfm_model_loader,
        )
    )
    runs.append(
        _benchmark_chronos(
            settings=settings,
            tickers=adapter_tickers,
            price_days=price_days,
            include=include_chronos,
            model_loader=chronos_model_loader,
        )
    )

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "environment": {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "machine": platform.machine(),
        },
        "config": {
            "simple_ticker_count": len(simple_tickers),
            "adapter_ticker_count": len(adapter_tickers),
            "price_days": price_days,
            "horizons": list(FORECAST_HORIZONS),
            "include_timesfm": include_timesfm,
            "include_chronos": include_chronos,
        },
        "benchmarks": [asdict(run) for run in runs],
        "automation_recommendation": _automation_recommendation(runs),
        "notes": [
            "package_install_seconds is not measured automatically; record it manually if "
            "benchmarking a fresh environment.",
            "model_download_bytes is estimated from the Hugging Face cache when present.",
            "Synthetic OHLCV rows are used so benchmark results are repeatable and do not "
            "depend on Supabase or yfinance availability.",
        ],
    }


def write_runtime_benchmark(report: dict[str, Any], output_path: str | Path) -> Path:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return path


def generate_synthetic_price_rows(
    *,
    tickers: tuple[str, ...],
    days: int,
    start_date: date = date(2022, 1, 3),
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    trading_day = start_date
    day_index = 0
    while day_index < days:
        if trading_day.weekday() >= 5:
            trading_day += timedelta(days=1)
            continue

        for ticker_index, ticker in enumerate(tickers):
            base = 80.0 + ticker_index * 11.0
            trend = day_index * (0.035 + ticker_index * 0.0007)
            cycle = ((day_index + ticker_index) % 19 - 9) * 0.045
            close = base + trend + cycle
            rows.append(
                {
                    "ticker": ticker,
                    "date": trading_day.isoformat(),
                    "open": round(close * 0.997, 4),
                    "high": round(close * 1.006, 4),
                    "low": round(close * 0.992, 4),
                    "close": round(close, 4),
                    "volume": 1_000_000 + ticker_index * 15_000 + day_index * 250,
                    "source": "synthetic-benchmark",
                    "ingested_at": datetime.now(UTC).isoformat(),
                }
            )

        trading_day += timedelta(days=1)
        day_index += 1

    return rows


def _benchmark_simple_models(
    *,
    price_rows: list[dict[str, Any]],
    ticker_count: int,
) -> BenchmarkRun:
    feature_rows = build_feature_rows(price_rows)
    cold = _measure(lambda: train_and_predict(feature_rows, price_rows))
    prediction_count = len(cold["result"].prediction_rows)
    return BenchmarkRun(
        name="Core simple models",
        status="completed",
        ticker_count=ticker_count,
        horizon_count=len(FORECAST_HORIZONS),
        prediction_count=prediction_count,
        cold_seconds=cold["seconds"],
        peak_python_allocated_mb=cold["peak_python_allocated_mb"],
        rss_delta_mb=cold["rss_delta_mb"],
        rss_after_mb=cold["rss_after_mb"],
        notes=[
            "Includes Baseline, Linear Regression, and Random Forest.",
            "Warm timing is omitted because these sklearn models train fresh each run.",
            f"Built {len(feature_rows)} synthetic feature rows before timing.",
        ],
    )


def _benchmark_timesfm(
    *,
    settings: Settings,
    tickers: tuple[str, ...],
    price_days: int,
    include: bool,
    model_loader: TimesFMModelLoader | None,
) -> BenchmarkRun:
    if not include:
        return _skipped_adapter("TimesFM", tickers, "Pass --include-timesfm to run it.")

    adapter_settings = replace(settings, timesfm_enabled=True)
    price_rows = generate_synthetic_price_rows(tickers=tickers, days=price_days)
    import_probe = _measure_package_import("timesfm")
    try:
        adapter = TimesFMPredictionAdapter(
            settings=adapter_settings,
            model_loader=model_loader,
        )
        cold = _measure(lambda: adapter.predict_from_price_rows(price_rows))
        warm = _measure(lambda: adapter.predict_from_price_rows(price_rows))
        return BenchmarkRun(
            name="TimesFM",
            status="completed",
            ticker_count=len(tickers),
            horizon_count=len(FORECAST_HORIZONS),
            prediction_count=len(cold["result"]),
            cold_seconds=cold["seconds"],
            warm_seconds=warm["seconds"],
            package_import_seconds=import_probe["seconds"],
            model_download_bytes=_huggingface_cache_size(adapter_settings.timesfm_model_id),
            peak_python_allocated_mb=cold["peak_python_allocated_mb"],
            rss_delta_mb=cold["rss_delta_mb"],
            rss_after_mb=cold["rss_after_mb"],
        )
    except (TimesFMDependencyError, ImportError, ValueError, RuntimeError) as exc:
        return _failed_adapter("TimesFM", tickers, exc, import_probe["seconds"])


def _benchmark_chronos(
    *,
    settings: Settings,
    tickers: tuple[str, ...],
    price_days: int,
    include: bool,
    model_loader: ChronosModelLoader | None,
) -> BenchmarkRun:
    if not include:
        return _skipped_adapter("Chronos-2", tickers, "Pass --include-chronos to run it.")

    adapter_settings = replace(settings, chronos_enabled=True)
    price_rows = generate_synthetic_price_rows(tickers=tickers, days=price_days)
    import_probe = _measure_package_import("chronos")
    try:
        adapter = ChronosPredictionAdapter(
            settings=adapter_settings,
            model_loader=model_loader,
        )
        cold = _measure(lambda: adapter.predict_from_price_rows(price_rows))
        warm = _measure(lambda: adapter.predict_from_price_rows(price_rows))
        return BenchmarkRun(
            name="Chronos-2",
            status="completed",
            ticker_count=len(tickers),
            horizon_count=len(FORECAST_HORIZONS),
            prediction_count=len(cold["result"]),
            cold_seconds=cold["seconds"],
            warm_seconds=warm["seconds"],
            package_import_seconds=import_probe["seconds"],
            model_download_bytes=_huggingface_cache_size(adapter_settings.chronos_model_id),
            peak_python_allocated_mb=cold["peak_python_allocated_mb"],
            rss_delta_mb=cold["rss_delta_mb"],
            rss_after_mb=cold["rss_after_mb"],
        )
    except (ChronosDependencyError, ImportError, ValueError, RuntimeError) as exc:
        return _failed_adapter("Chronos-2", tickers, exc, import_probe["seconds"])


def _measure(callback: Callable[[], Any]) -> dict[str, Any]:
    rss_before = _rss_mb()
    tracemalloc.start()
    started = time.perf_counter()
    result = callback()
    seconds = time.perf_counter() - started
    _current, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    rss_after = _rss_mb()
    return {
        "result": result,
        "seconds": round(seconds, 4),
        "peak_python_allocated_mb": round(peak / (1024 * 1024), 2),
        "rss_delta_mb": (
            round(rss_after - rss_before, 2)
            if rss_before is not None and rss_after is not None
            else None
        ),
        "rss_after_mb": rss_after,
    }


def _measure_package_import(module_name: str) -> dict[str, float | None]:
    started = time.perf_counter()
    try:
        __import__(module_name)
    except ImportError:
        return {"seconds": None}
    return {"seconds": round(time.perf_counter() - started, 4)}


def _rss_mb() -> float | None:
    try:
        import resource
    except ImportError:
        return None

    usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    if sys.platform == "darwin":
        usage = usage / (1024 * 1024)
    else:
        usage = usage / 1024
    return round(float(usage), 2)


def _huggingface_cache_size(model_id: str) -> int | None:
    cache_root = Path(os.getenv("HF_HOME", Path.home() / ".cache" / "huggingface")) / "hub"
    model_dir = cache_root / f"models--{model_id.replace('/', '--')}"
    if not model_dir.exists():
        return None

    return sum(path.stat().st_size for path in model_dir.rglob("*") if path.is_file())


def _selected_tickers(count: int) -> tuple[str, ...]:
    if count < 1:
        raise ValueError("Ticker count must be at least 1.")
    return MVP_TICKERS[:count]


def _skipped_adapter(name: str, tickers: tuple[str, ...], reason: str) -> BenchmarkRun:
    return BenchmarkRun(
        name=name,
        status="skipped",
        ticker_count=len(tickers),
        horizon_count=len(FORECAST_HORIZONS),
        prediction_count=0,
        notes=[reason],
    )


def _failed_adapter(
    name: str,
    tickers: tuple[str, ...],
    exc: Exception,
    package_import_seconds: float | None,
) -> BenchmarkRun:
    return BenchmarkRun(
        name=name,
        status="failed",
        ticker_count=len(tickers),
        horizon_count=len(FORECAST_HORIZONS),
        prediction_count=0,
        package_import_seconds=package_import_seconds,
        error=str(exc),
    )


def _automation_recommendation(runs: list[BenchmarkRun]) -> str:
    heavy_runs = [run for run in runs if run.name in {"TimesFM", "Chronos-2"}]
    completed = [run for run in heavy_runs if run.status == "completed"]
    if not completed:
        return (
            "Keep TimesFM and Chronos-2 disabled in automation until local heavy-model "
            "benchmarks complete."
        )

    slow = [
        run.name
        for run in completed
        if (run.cold_seconds or 0) > 300 or (run.warm_seconds or 0) > 120
    ]
    if slow:
        return (
            "Do not enable heavy models in GitHub Actions yet; "
            f"{', '.join(slow)} exceeded the recommended runtime budget."
        )

    return (
        "Heavy-model runtime appears acceptable for a small scheduled subset. "
        "Keep feature flags explicit and monitor GitHub Actions duration."
    )
