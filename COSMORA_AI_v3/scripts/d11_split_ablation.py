#!/usr/bin/env python3
"""D11 ablation: how much did the collapsed early-stopping split actually cost?

The defect is invisible in the run tables — it lives inside every neural fit. To measure
it, the same series is trained twice from the same data, seeds and folds, once with the
pre-correction split rule and once with the corrected one, and the resulting validation
and test MAE are compared model by model.

    python scripts/d11_split_ablation.py --location colombo --target temp --seeds 7 --folds 2

The "buggy" variant is produced by rewriting the split line in a throw-away copy of
``nn.py`` — the repository source is never modified and never imported in the patched form.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT / "src"))

from cosmora_v3.config import load_config  # noqa: E402
from cosmora_v3.data import load_dataset  # noqa: E402

LEGACY_SPLIT = """        split = max(int(n * (1.0 - self.inner_val_fraction)), n - 1)
        split = min(max(split, 1), n - 1) if n > 1 else n"""

RUNNER = r'''
import json, sys
import numpy as np
from cosmora_v3.config import load_config
from cosmora_v3.data import load_dataset
from cosmora_v3.evaluate import run_series

config = load_config(sys.argv[1])
frames, _provenance = load_dataset(config)
result = run_series(
    frames[sys.argv[2]], sys.argv[2], sys.argv[3], config,
    seeds=[int(seed) for seed in sys.argv[4].split(",")],
    max_folds=int(sys.argv[5]),
    log=lambda message: print(message, file=sys.stderr),
)
payload = {
    "validation": {
        row["model"]: {"mae": row["mae"], "n": row["n"]}
        for row in result.metrics_validation.to_dict("records")
    },
    "test": {
        row["model"]: {"mae": row["mae"], "n": row["n"]}
        for row in result.metrics_test.to_dict("records")
    },
    "split": {"rows": int(result.metrics_validation["n"].iloc[0])},
    "counts": result.validation_counts,
}
print(json.dumps(payload))
'''


def _prepare_tree(tmp: Path, patch_split: bool) -> Path:
    """Copy the importable package into ``tmp`` and optionally restore the legacy split."""
    src = tmp / "src"
    if not src.exists():
        shutil.copytree(PACKAGE_ROOT / "src", src)
        shutil.copytree(PACKAGE_ROOT / "data" / "cache", tmp / "data" / "cache")
    nn_path = src / "cosmora_v3" / "nn.py"
    original = (PACKAGE_ROOT / "src" / "cosmora_v3" / "nn.py").read_text(encoding="utf-8")
    if patch_split:
        marker = "        split = int(round(n * (1.0 - self.inner_val_fraction)))"
        if marker not in original:
            raise SystemExit("cannot find the corrected split expression to replace")
        nn_path.write_text(original.replace(marker, LEGACY_SPLIT), encoding="utf-8")
    else:
        nn_path.write_text(original, encoding="utf-8")
    return tmp


def run_variant(tmp: Path, config_path: Path, location: str, target: str, seeds: str, folds: int) -> dict:
    env = {"PYTHONPATH": str(tmp / "src"), "PATH": "/usr/bin:/bin"}
    completed = subprocess.run(
        [sys.executable, "-c", RUNNER, str(config_path), location, target, seeds, str(folds)],
        cwd=str(tmp), env=env, capture_output=True, text=True, check=False,
    )
    if completed.returncode != 0:
        raise SystemExit(f"variant failed:\n{completed.stderr[-3000:]}")
    return json.loads(completed.stdout.strip().splitlines()[-1])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default=str(PACKAGE_ROOT / "config" / "experiment_lk_power_2000_2024.json"))
    parser.add_argument("--location", default="colombo")
    parser.add_argument("--target", default="temp")
    parser.add_argument("--seeds", default="7")
    parser.add_argument("--folds", type=int, default=2)
    parser.add_argument("--out", default=None, help="write the comparison JSON here")
    args = parser.parse_args()

    config_path = Path(args.config)
    config = load_config(str(config_path))
    frames, provenances = load_dataset(config)
    provenance = sorted({p.source for p in provenances})
    # "cache" means the committed NASA POWER payloads listed in data/cache/README.md;
    # "NASA_POWER" would mean a live download. Anything else is not this experiment.
    if provenance not in (["cache"], ["NASA_POWER"]):
        raise SystemExit(f"refusing to measure this on {provenance} data")
    frame = frames[args.location]

    out: dict = {
        "config": str(config_path.relative_to(PACKAGE_ROOT)) if config_path.is_relative_to(PACKAGE_ROOT) else str(config_path),
        "config_hash": config["config_hash"],
        "location": args.location, "target": args.target,
        "seeds": [int(s) for s in args.seeds.split(",")], "folds": args.folds,
        "data_provenance": provenance, "months": int(len(frame)),
    }
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        for variant, patch in (("buggy", True), ("fixed", False)):
            _prepare_tree(tmp, patch_split=patch)
            out[variant] = run_variant(tmp, config_path, args.location, args.target, args.seeds, args.folds)

    rows = []
    for model in ("mlp", "gru", "lstm", "ensemble", "xgboost"):
        buggy_val = out["buggy"]["validation"].get(model, {}).get("mae", float("nan"))
        fixed_val = out["fixed"]["validation"].get(model, {}).get("mae", float("nan"))
        buggy_test = out["buggy"]["test"].get(model, {}).get("mae", float("nan"))
        fixed_test = out["fixed"]["test"].get(model, {}).get("mae", float("nan"))
        rows.append({
            "model": model,
            "validation_mae_buggy": buggy_val, "validation_mae_fixed": fixed_val,
            "validation_change": fixed_val - buggy_val,
            "test_mae_buggy": buggy_test, "test_mae_fixed": fixed_test,
            "test_change": fixed_test - buggy_test,
        })
    out["comparison"] = rows

    header = f"{'model':10s} {'val buggy':>10s} {'val fixed':>10s} {'Δ':>8s} {'test buggy':>11s} {'test fixed':>11s} {'Δ':>8s}"
    print(header)
    for row in rows:
        print(
            f"{row['model']:10s} {row['validation_mae_buggy']:10.4f} {row['validation_mae_fixed']:10.4f} "
            f"{row['validation_change']:+8.4f} {row['test_mae_buggy']:11.4f} {row['test_mae_fixed']:11.4f} "
            f"{row['test_change']:+8.4f}"
        )
    changes = [row["test_change"] for row in rows if np.isfinite(row["test_change"])]
    print(f"\ntest MAE change: {min(changes):+.4f} … {max(changes):+.4f} "
          f"(mean {np.mean(changes):+.4f}); sign is {'consistent' if all(c > 0 for c in changes) or all(c < 0 for c in changes) else 'NOT consistent'}")

    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(out, indent=2), encoding="utf-8")
        print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
