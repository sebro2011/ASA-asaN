#!/usr/bin/env python3
"""Run the COSMORA AI v3 experiment.

Examples
--------
    python scripts/run_experiments.py
    python scripts/run_experiments.py --quick --locations colombo
    python scripts/run_experiments.py --synthetic --out results/engine_check

Exit codes: 0 success · 2 data unavailable (no values were fabricated).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from cosmora_v3.data import DataUnavailable  # noqa: E402
from cosmora_v3.run import run  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", default=None, help="path to experiment.json")
    parser.add_argument("--quick", action="store_true", help="2 seeds, 2 folds, 40 epochs")
    parser.add_argument("--synthetic", action="store_true", help="synthetic engine check (not scientific)")
    parser.add_argument("--force-refresh", action="store_true", help="ignore the local POWER cache")
    parser.add_argument("--locations", nargs="+", default=None, help="subset of location ids")
    parser.add_argument("--out", default=None, help="results directory")
    args = parser.parse_args()

    try:
        summary = run(
            args.config,
            synthetic=args.synthetic,
            quick=args.quick,
            force_refresh=args.force_refresh,
            out_dir=args.out,
            location_ids=args.locations,
        )
    except DataUnavailable as exc:
        print(f"\n[data unavailable]\n{exc}\n", file=sys.stderr)
        return 2

    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
