# Chronos-2 Local Benchmark

Chronos-2 is optional and disabled by default because it downloads a pretrained checkpoint and
adds meaningful inference time to `train-predict`.

## Install

```bash
.venv/bin/python -m pip install -e ".[chronos]"
```

## Enable

Add these values to `.env`:

```env
CHRONOS_ENABLED=true
CHRONOS_MODEL_ID=amazon/chronos-2
CHRONOS_CONTEXT_LENGTH=1024
CHRONOS_DEVICE_MAP=cpu
CHRONOS_FREQUENCY=B
```

Use `CHRONOS_DEVICE_MAP=cuda` only on machines with a compatible GPU runtime.
`CHRONOS_FREQUENCY=B` tells Chronos to generate business-day forecast steps instead of
trying to infer a regular frequency from market data that skips weekends and holidays.

## Smoke Run

```bash
.venv/bin/python -m pipeline.cli train-predict
```

Expected behavior:

- With `CHRONOS_ENABLED=false`, the pipeline logs that Chronos-2 is disabled.
- With Chronos enabled but the optional package missing, the pipeline logs a skip warning and
  continues.
- With Chronos enabled and installed, the pipeline writes four Chronos-2 prediction rows per
  ticker, one for each horizon: `1w`, `1m`, `3m`, and `1y`.

## Notes

The adapter uses Amazon's `Chronos2Pipeline.from_pretrained(...)` and `predict_df(...)` API.
It requests 0.1, 0.5, and 0.9 quantiles so dashboard rows can carry an 80% interval.
