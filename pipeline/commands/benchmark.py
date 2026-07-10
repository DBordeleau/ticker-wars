from __future__ import annotations

import logging

from pipeline.config import load_settings

LOGGER = logging.getLogger(__name__)

DEFAULT_RUNTIME_BENCHMARK_PATH = "data_exports/runtime_benchmark.json"
DEFAULT_SIMPLE_TICKERS = 25
DEFAULT_ADAPTER_TICKERS = 3
DEFAULT_PRICE_DAYS = 760


def run_benchmark_runtime(
    *,
    output_path: str = DEFAULT_RUNTIME_BENCHMARK_PATH,
    simple_ticker_count: int = DEFAULT_SIMPLE_TICKERS,
    adapter_ticker_count: int = DEFAULT_ADAPTER_TICKERS,
    price_days: int = DEFAULT_PRICE_DAYS,
    include_timesfm: bool = False,
    include_chronos: bool = False,
) -> int:
    from pipeline.benchmarking.runtime import run_runtime_benchmark, write_runtime_benchmark

    settings = load_settings()
    report = run_runtime_benchmark(
        settings=settings,
        simple_ticker_count=simple_ticker_count,
        adapter_ticker_count=adapter_ticker_count,
        price_days=price_days,
        include_timesfm=include_timesfm,
        include_chronos=include_chronos,
    )
    path = write_runtime_benchmark(report, output_path)
    LOGGER.info("Runtime benchmark report written to %s.", path)

    for benchmark in report["benchmarks"]:
        LOGGER.info(
            "%s: %s, cold=%s, warm=%s, predictions=%s",
            benchmark["name"],
            benchmark["status"],
            benchmark["cold_seconds"],
            benchmark["warm_seconds"],
            benchmark["prediction_count"],
        )

    LOGGER.info("Automation recommendation: %s", report["automation_recommendation"])
    return 0
