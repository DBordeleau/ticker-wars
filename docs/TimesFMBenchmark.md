# TimesFM Local Benchmark

TimesFM is disabled by default because it downloads model weights and can be heavy for scheduled CI.

Install the optional dependency and run the pipeline locally:

```bash
python3 -m pip install -e ".[dev,timesfm]"
TIMESFM_ENABLED=true TIMESFM_CONTEXT_LENGTH=1024 python3 -m pipeline.cli train-predict
```

Useful environment variables:

- `TIMESFM_ENABLED=true`
- `TIMESFM_MODEL_ID=google/timesfm-2.5-200m-pytorch`
- `TIMESFM_CONTEXT_LENGTH=1024`
- `TIMESFM_BACKEND=torch`

Suggested benchmark process:

1. Start with a small ticker universe or a short recent backfill.
2. Record wall-clock runtime for `python3 -m pipeline.cli train-predict`.
3. Confirm TimesFM rows are written with `model_slug=timesfm`.
4. Increase ticker count only after the local runtime is acceptable.
5. Keep TimesFM disabled in scheduled automation until model download and inference time are predictable.
