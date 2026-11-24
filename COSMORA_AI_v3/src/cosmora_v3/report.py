"""Artefact export: tables, model files, manifest, dashboard and the report.

Everything written here is derived from computed objects. There is no template with
numbers baked into it — that is the specific v2 defect this module exists to make
impossible (v2's dashboard carried literal ``0.813``/``0.710`` cells next to live
values, so a reader could not tell measurement from decoration).

Layout of a run directory::

    results/<run_id>/
        run_manifest.json          config hash, data hashes, environment, timings
        tables/*.csv               every metric table, untruncated
        figures/*.png              actual-vs-predicted, comparison, stability, extremes
        exports/models/...         evaluated model weights + scalers
        dashboard.html             self-contained, values injected from tables
        REPORT.md                  generated narrative with the same numbers
"""

from __future__ import annotations

import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from . import __version__


def _json_default(value: Any) -> Any:
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    if isinstance(value, np.ndarray):
        return value.tolist()
    return str(value)


def write_manifest(
    out_dir: Path,
    config: Dict[str, Any],
    provenance: List[Any],
    *,
    synthetic: bool,
    quick: bool,
    timing: Dict[str, Any],
    extra: Optional[Dict[str, Any]] = None,
) -> Path:
    unverified_cache = not synthetic and any(not prov.request_signature_checked for prov in provenance)
    manifest = {
        "package": "COSMORA_AI_v3",
        "version": __version__,
        "created_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "config_hash": config["config_hash"],
        "config_path": config.get("_source_path"),
        "data_provenance": "SYNTHETIC" if synthetic else "NASA_POWER_UNVERIFIED_CACHE" if unverified_cache else "NASA_POWER",
        "scientific_results": not synthetic and not unverified_cache,
        "quick_mode": quick,
        "seeds": config["seeds"],
        # Configured, not executed: a run may be restricted with --locations. The
        # executed set is written by run() under "locations_executed", so a manifest
        # can never claim a site was modelled on the strength of the config alone.
        "locations_configured": [loc["id"] for loc in config["locations"]],
        "environment": {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "numpy": np.__version__,
            "pandas": pd.__version__,
        },
        "dataset": [prov.as_dict() for prov in provenance],
        "timing": timing,
    }
    if extra:
        manifest.update(extra)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "run_manifest.json"
    path.write_text(json.dumps(manifest, indent=2, default=_json_default), encoding="utf-8")
    return path


def export_tables(out_dir: Path, tables: Dict[str, pd.DataFrame]) -> List[Path]:
    tables_dir = out_dir / "tables"
    tables_dir.mkdir(parents=True, exist_ok=True)
    paths: List[Path] = []
    for name, frame in tables.items():
        if frame is None or frame.empty:
            continue
        path = tables_dir / f"{name}.csv"
        frame.to_csv(path, index=False)
        paths.append(path)
    return paths


def export_models(out_dir: Path, series_results: List[Any]) -> List[str]:
    """Persist the *evaluated* fitted models, their scalers and their feature list.

    These are the models whose metrics appear in the tables — not a refit. A reader
    can regenerate the test predictions exactly, which is the point of shipping
    weights at all.
    """
    written: List[str] = []
    for result in series_results:
        for model_name, per_seed in getattr(result, "trained", {}).items():
            for seed, bundle in per_seed.items():
                if bundle is None:
                    continue
                base = out_dir / "exports" / "models" / result.location_id / result.target / model_name / f"seed{seed}"
                base.mkdir(parents=True, exist_ok=True)
                (base / "features.json").write_text(
                    json.dumps({"columns": bundle["columns"], "lookback": bundle["lookback"],
                                "scaler": bundle["scaler"], "target": result.target,
                                "unit": result.unit}, indent=2),
                    encoding="utf-8",
                )
                model = bundle["model"]
                if model_name == "xgboost":
                    model.estimator.save_model(str(base / "model.json"))
                else:
                    state = model.export_state()
                    if model_name == "ensemble":
                        for member_name, member_state in state.items():
                            np.savez(
                                base / f"{member_name}.npz",
                                **{f"p_{k}": np.asarray(v, dtype="float64")
                                   for k, v in member_state["params"].items()},
                                y_mean=np.array([member_state["y_mean"]]),
                                y_std=np.array([member_state["y_std"]]),
                            )
                    else:
                        np.savez(
                            base / "model.npz",
                            **{f"p_{k}": np.asarray(v, dtype="float64") for k, v in state["params"].items()},
                            y_mean=np.array([state["y_mean"]]),
                            y_std=np.array([state["y_std"]]),
                        )
                written.append(str(base))
    return written


def _banner(manifest: Dict[str, Any]) -> str:
    if manifest.get("scientific_results"):
        return (
            '<div class="banner ok">NASA POWER observations · '
            f'config {manifest["config_hash"]} · generated {manifest["created_utc"]}</div>'
        )
    if manifest.get("data_provenance") == "NASA_POWER_UNVERIFIED_CACHE":
        return '<div class="banner warn"><strong>UNVERIFIED CACHE — NOT SCIENTIFIC RESULTS.</strong> Request identity could not be verified.</div>'
    return (
        '<div class="banner warn"><strong>ENGINE CHECK — NOT SCIENTIFIC RESULTS.</strong> '
        "These numbers were produced on synthetic data to verify that the pipeline runs. "
        "They say nothing about climate predictability in Sri Lanka.</div>"
    )


def render_html_dashboard(
    out_dir: Path,
    manifest: Dict[str, Any],
    tables: Dict[str, pd.DataFrame],
    interval_scores: Dict[str, pd.DataFrame],
    extreme_rows: pd.DataFrame,
) -> Path:
    """Self-contained dashboard. Every number is interpolated from a computed table."""
    def table_html(frame: pd.DataFrame, columns: Optional[List[str]] = None, floatfmt: str = "{:.3f}") -> str:
        if frame is None or frame.empty:
            return "<p class='muted'>no rows</p>"
        frame = frame if columns is None else frame[columns]
        head = "".join(f"<th>{c}</th>" for c in frame.columns)

        def cell(value: Any) -> str:
            if isinstance(value, (float, np.floating)):
                return "<td class='num'>" + ("—" if not np.isfinite(value) else floatfmt.format(value)) + "</td>"
            return f"<td>{value}</td>"

        rows = "".join("<tr>" + "".join(cell(v) for v in row) + "</tr>" for row in frame.itertuples(index=False))
        return f"<table><thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table>"

    validation = tables.get("metrics_validation", pd.DataFrame())
    test = tables.get("metrics_test", pd.DataFrame())

    def summary_block(frame: pd.DataFrame) -> str:
        if frame.empty:
            return "<p class='muted'>no rows</p>"
        grouped = (
            frame.groupby(["location", "target", "model"])[["mae", "rmse", "r2"]]
            .mean()
            .reset_index()
            .sort_values(["location", "target", "mae"])
        )
        return table_html(grouped)

    comparisons = tables.get("statistical_comparisons", pd.DataFrame())
    stability = tables.get("seed_stability", pd.DataFrame())

    html = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>COSMORA AI v3 — validation dashboard</title>
<style>
 :root {{ --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --bg:#f8fafc; --card:#ffffff; }}
 * {{ box-sizing: border-box; }}
 body {{ margin:0; padding:28px; font:14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        background:var(--bg); color:var(--ink); }}
 h1 {{ font-size:22px; margin:0 0 4px; letter-spacing:-0.01em; }}
 h2 {{ font-size:15px; margin:28px 0 10px; text-transform:uppercase; letter-spacing:0.08em; color:var(--muted); }}
 .banner {{ padding:12px 16px; border-radius:10px; margin:14px 0 18px; font-size:13px; }}
 .banner.ok {{ background:#ecfdf5; border:1px solid #a7f3d0; color:#065f46; }}
 .banner.warn {{ background:#fef2f2; border:1px solid #fecaca; color:#991b1b; }}
 .card {{ background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; overflow:auto; }}
 table {{ border-collapse:collapse; width:100%; font-size:12.5px; }}
 th {{ text-align:left; font-weight:600; color:var(--muted); border-bottom:1px solid var(--line);
       padding:7px 10px; white-space:nowrap; }}
 td {{ padding:6px 10px; border-bottom:1px solid #f1f5f9; white-space:nowrap; }}
 td.num {{ font-variant-numeric: tabular-nums; text-align:right; }}
 tr:hover td {{ background:#f8fafc; }}
 .muted {{ color:var(--muted); }}
 .grid {{ display:grid; gap:16px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }}
 img {{ max-width:100%; border-radius:8px; border:1px solid var(--line); }}
 footer {{ margin-top:32px; color:var(--muted); font-size:12px; }}
</style></head><body>
<h1>COSMORA AI v3 — Advanced Research Validation Edition</h1>
<p class="muted">Walk-forward validation and a sealed test tail. Validation and test figures are kept apart on purpose.</p>
{_banner(manifest)}

<h2>Validation (walk-forward, out-of-fold)</h2>
<div class="card">{summary_block(validation)}</div>

<h2>Independent test tail (used once)</h2>
<div class="card">{summary_block(test)}</div>

<h2>Statistical comparison (test tail, seed-mean predictions)</h2>
<div class="card">{table_html(comparisons, floatfmt="{:.4f}")}</div>

<h2>Seed stability</h2>
<div class="card">{table_html(stability)}</div>

<h2>Calibrated interval coverage</h2>
<div class="card">{table_html(interval_scores.get("interval_scores", pd.DataFrame()))}</div>

<h2>Extreme rainfall</h2>
<div class="card">{table_html(extreme_rows)}</div>

<h2>Figures</h2>
<div class="grid">{_figure_gallery(out_dir)}</div>

<footer>Generated by COSMORA AI v3 {__version__} · config {manifest["config_hash"]}
· seeds executed {manifest.get("seeds_executed", manifest["seeds"])}
· locations executed {manifest.get("locations_executed", manifest.get("locations_configured"))} · {manifest["created_utc"]}.
No value on this page was typed by hand; all are rendered from the CSV tables in <code>tables/</code>.</footer>
</body></html>"""
    path = out_dir / "dashboard.html"
    path.write_text(html, encoding="utf-8")
    return path


def _figure_gallery(out_dir: Path) -> str:
    figures = sorted((out_dir / "figures").glob("*.png")) if (out_dir / "figures").exists() else []
    if not figures:
        return "<p class='muted'>no figures generated</p>"
    return "".join(
        f'<figure style="margin:0"><img src="figures/{p.name}" alt="{p.stem}">'
        f'<figcaption class="muted" style="font-size:11px;margin-top:4px">{p.stem.replace("_", " ")}</figcaption></figure>'
        for p in figures
    )


def _validation_counts_note(validation: pd.DataFrame) -> List[str]:
    """Say plainly what the validation numbers are averaged over.

    Walk-forward folds overlap when the step is shorter than the horizon, so the number
    of forecast instances exceeds the number of distinct months. Both are printed: a
    single "n" here would be ambiguous, which is exactly how the pre-correction tables
    misled their reader (DEFECT_REPORT D12).
    """
    if validation is None or validation.empty:
        return []
    months = int(validation["n"].iloc[0]) if "n" in validation else None
    instances = int(validation["n_instances"].iloc[0]) if "n_instances" in validation else None
    if months is None or instances is None:
        return []
    overlap = f" ({instances / months:.2f}x, folds overlap)" if months and instances > months else ""
    return [
        f"_Each row is one model × seed. Metrics are computed over **{months} distinct target "
        f"months**; the folds produced **{instances} forecast instances**{overlap}. Overlapping "
        "instances are averaged per month — none is discarded, and instance-level numbers are "
        "in `tables/metrics_validation_instances.csv`._",
        "",
    ]


def render_markdown_report(
    out_dir: Path,
    manifest: Dict[str, Any],
    tables: Dict[str, pd.DataFrame],
    narrative: Dict[str, Any],
) -> Path:
    test = tables.get("metrics_test", pd.DataFrame())
    validation = tables.get("metrics_validation", pd.DataFrame())
    comparisons = tables.get("statistical_comparisons", pd.DataFrame())
    extremes = tables.get("extreme_rainfall", pd.DataFrame())

    def markdown_table(frame: pd.DataFrame) -> str:
        if frame is None or frame.empty:
            return "_no rows_"
        header = "| " + " | ".join(frame.columns) + " |"
        rule = "| " + " | ".join("---" for _ in frame.columns) + " |"
        body = []
        for row in frame.itertuples(index=False):
            cells = []
            for value in row:
                if isinstance(value, (float, np.floating)):
                    cells.append("—" if not np.isfinite(value) else f"{value:.3f}")
                else:
                    cells.append(str(value))
            body.append("| " + " | ".join(cells) + " |")
        return "\n".join([header, rule, *body])

    def summary(frame: pd.DataFrame) -> pd.DataFrame:
        if frame.empty:
            return frame
        return (
            frame.groupby(["location", "target", "model"])[["mae", "rmse", "r2", "bias"]]
            .mean()
            .reset_index()
            .round(3)
        )

    lines = [
        "# COSMORA AI v3.0 — run report",
        "",
        f"- generated: `{manifest['created_utc']}`",
        f"- config hash: `{manifest['config_hash']}`",
        f"- data provenance: **{manifest['data_provenance']}**",
        # D27: this printed the Python bool (`True`) in markdown; a reader should
        # not have to parse a repr to learn whether the numbers are scientific.
        f"- scientific results: **{'yes' if manifest['scientific_results'] else 'no'}**",
        f"- seeds executed: {manifest.get('seeds_executed', manifest['seeds'])} (configured: {manifest['seeds']})",
        f"- quick mode: {manifest['quick_mode']}",
    ]
    if manifest.get("configured_config_hash"):
        lines.append(
            f"- configured hash: `{manifest['configured_config_hash']}`"
            + (
                " — **overridden for this run**; the hash above is the configuration that executed"
                if manifest["configured_config_hash"] != manifest["config_hash"]
                else ""
            )
        )
    overlap = manifest.get("fold_overlap") or {}
    if overlap:
        lines.append(
            f"- fold geometry: step {overlap['cv_step_months']} months, validation window "
            f"{overlap['cv_validation_months']} months"
            + (
                f", {overlap['months_shared_between_neighbouring_folds']} months shared between "
                "neighbouring folds (averaged once per month, D12)"
                if overlap.get("overlapping")
                else ""
            )
        )
    execution = manifest.get("execution") or {}
    if execution:
        epochs = execution.get("epochs_effective") or {}
        if epochs:
            lines.append("- epochs (actual): " + ", ".join(f"{k}={v}" for k, v in epochs.items()))
        if execution.get("folds_per_series"):
            folds = sorted(set(execution["folds_per_series"].values()))
            lines.append(f"- folds per series: {folds[0]}" + (" (all series)" if len(folds) == 1 else f" — values {folds}"))
        if execution.get("alpha") is not None:
            lines.append(
                f"- significance: alpha={execution['alpha']} · verdicts require the bootstrap "
                "interval to exclude zero and both adjusted p-values to clear alpha"
            )
        dm = execution.get("dm_test") or {}
        if dm:
            lines.append(
                f"- Diebold–Mariano: {dm.get('variance')} variance, lag {dm.get('max_lag')}, "
                f"{dm.get('reference')}, {dm.get('small_sample')} correction"
            )
    code = manifest.get("code") or {}
    if code.get("git_sha"):
        dirty = " (working tree dirty)" if code.get("working_tree_dirty") else ""
        lines.append(f"- code: {code.get('package_version')} @ `{str(code['git_sha'])[:12]}`{dirty}")
    if manifest.get("dataset_file_sha256"):
        lines.append(
            "- cache file sha256: "
            + ", ".join(f"{k}={str(v)[:12]}" for k, v in manifest["dataset_file_sha256"].items())
        )
    lines += [""]
    if manifest.get("data_provenance") == "NASA_POWER_UNVERIFIED_CACHE":
        lines += ["> **UNVERIFIED CACHE — not scientific results.** Request identity could not be verified.", ""]
    elif not manifest["scientific_results"]:
        lines += [
            "> **ENGINE CHECK — not scientific results.**",
            "> This run used synthetic data to verify the pipeline. No statement below",
            "> describes climate predictability; the numbers exist to prove the code runs",
            "> and that leakage guards hold.",
            "",
        ]
    lines += [
        "## Validation (walk-forward, mean over seeds)",
        "",
        *_validation_counts_note(validation),
        markdown_table(summary(validation)),
        "",
        "## Independent test tail (mean over seeds)",
        markdown_table(summary(test)),
        "",
        "## Statistical comparison on the test tail",
        markdown_table(comparisons),
        "",
        "## Extreme rainfall",
        markdown_table(extremes),
        "",
        "## Reproduction",
        "```bash",
        "python scripts/run_experiments.py --config config/experiment.json",
        "```",
        "",
        "## Limitations carried by this run",
        *[f"- {item}" for item in narrative.get("limitations", [])],
        "",
    ]
    path = out_dir / "REPORT.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path
