from __future__ import annotations

import unittest
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch

from pipeline.cli import main


class CliSmokeTest(unittest.TestCase):
    def test_cli_help_runs(self) -> None:
        output = StringIO()
        with redirect_stdout(output):
            with self.assertRaises(SystemExit) as exit_context:
                main(["--help"])
        self.assertEqual(exit_context.exception.code, 0)
        self.assertIn("run-daily", output.getvalue())

    def test_backfill_placeholder_runs(self) -> None:
        with patch("pipeline.cli.SupabaseDatabase.from_settings", return_value=None):
            self.assertEqual(main(["backfill", "--start", "2020-01-01"]), 0)


if __name__ == "__main__":
    unittest.main()
