from __future__ import annotations

import unittest

from pipeline.config import Settings


class ConfigTest(unittest.TestCase):
    def test_default_gemini_model_uses_current_flash_model(self) -> None:
        self.assertEqual(Settings().gemini_model, "gemini-3.5-flash")


if __name__ == "__main__":
    unittest.main()
