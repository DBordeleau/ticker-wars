from __future__ import annotations

import numpy as np
import pandas as pd


def rsi(close: pd.Series, window: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    average_gain = gain.rolling(window=window, min_periods=window).mean()
    average_loss = loss.rolling(window=window, min_periods=window).mean()

    relative_strength = average_gain / average_loss
    value = 100 - (100 / (1 + relative_strength))

    value = value.mask((average_gain == 0) & (average_loss == 0), 50.0)
    value = value.mask((average_gain > 0) & (average_loss == 0), 100.0)
    value = value.mask((average_gain == 0) & (average_loss > 0), 0.0)
    return value.replace([np.inf, -np.inf], np.nan)
