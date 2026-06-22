from __future__ import annotations

import unittest

from pipeline.config import Settings


class ConfigTest(unittest.TestCase):
    def test_default_gemini_model_uses_current_flash_model(self) -> None:
        self.assertEqual(Settings().gemini_model, "gemini-3.5-flash")

    def test_chronos_is_disabled_by_default(self) -> None:
        settings = Settings()

        self.assertFalse(settings.chronos_enabled)
        self.assertEqual(settings.chronos_model_id, "amazon/chronos-2")
        self.assertEqual(settings.chronos_frequency, "B")


if __name__ == "__main__":
    unittest.main()
