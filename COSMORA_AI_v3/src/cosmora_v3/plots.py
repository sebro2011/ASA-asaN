"""Figures: actual vs predicted, model comparison, seed stability, extremes.

Colours are chosen to stay legible when printed in greyscale and to remain
distinguishable for the most common forms of colour-vision deficiency; the figures
are also readable through their axis labels alone, because a legend is a
convenience, not the data.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

import matplotlib

matplotlib.use("Agg")  # headless: no display needed in CI or on a server
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

PALETTE = {
    "mlp": "#E4A11B",
    "gru": "#2E7D8F",
    "lstm": "#7B4E9E",
    "xgboost": "#C0392B",
    "ensemble": "#1F6F43",
}
GRID = "#CBD5E1"
INK = "#0F172A"


def _style(ax) -> None:
    ax.grid(True, color=GRID, linewidth=0.6, alpha=0.7)
    ax.set_axisbelow(True)
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    ax.tick_params(colors=INK, labelsize=8)


def actual_vs_predicted(
    dates: List[str],
    y_true: np.ndarray,
    predictions: Dict[str, np.ndarray],
    interval: Optional[tuple[np.ndarray, np.ndarray]],
    title: str,
    unit: str,
    path: Path,
) -> Path:
    fig, ax = plt.subplots(figsize=(9.5, 4.0), dpi=140)
    x = np.arange(len(dates))
    ax.plot(x, y_true, color=INK, linewidth=1.5, label="Observed", zorder=3)
    if interval is not None:
        lower, upper = interval
        ax.fill_between(x, lower, upper, color=PALETTE["ensemble"], alpha=0.15,
                        label="90% calibrated interval", zorder=1)
    for name, pred in predictions.items():
        ax.plot(x, pred, color=PALETTE.get(name, "#475569"), linewidth=1.1,
                alpha=0.95, label=name.upper(), zorder=2)

    step = max(len(dates) // 8, 1)
    ax.set_xticks(x[::step])
    ax.set_xticklabels([dates[i] for i in range(0, len(dates), step)], rotation=45, ha="right", fontsize=7)
    ax.set_ylabel(unit, fontsize=9, color=INK)
    ax.set_title(title, fontsize=11, color=INK, loc="left")
    _style(ax)
    ax.legend(fontsize=7, frameon=False, ncol=len(predictions) + 2, loc="upper left")
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path)
    plt.close(fig)
    return path


def model_comparison(metrics: pd.DataFrame, metric: str, title: str, path: Path) -> Path:
    fig, ax = plt.subplots(figsize=(7.0, 3.4), dpi=140)
    models = list(metrics["model"])
    values = metrics[metric].to_numpy(dtype="float64")
    colours = [PALETTE.get(m, "#475569") for m in models]
    bars = ax.bar(models, values, color=colours, width=0.62)
    for bar, value in zip(bars, values):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height(), f"{value:.3f}",
                ha="center", va="bottom", fontsize=8, color=INK)
    ax.set_ylabel(metric.upper(), fontsize=9, color=INK)
    ax.set_title(title, fontsize=10, color=INK, loc="left")
    _style(ax)
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path)
    plt.close(fig)
    return path


def scatter_panel(y_true: np.ndarray, predictions: Dict[str, np.ndarray], title: str, unit: str, path: Path) -> Path:
    count = len(predictions)
    fig, axes = plt.subplots(1, count, figsize=(2.9 * count, 3.0), dpi=140, squeeze=False)
    low = float(np.min(y_true))
    high = float(np.max(y_true))
    for ax, (name, pred) in zip(axes[0], predictions.items()):
        ax.scatter(y_true, pred, s=9, alpha=0.55, color=PALETTE.get(name, "#475569"), edgecolors="none")
        ax.plot([low, high], [low, high], color=INK, linewidth=0.8, linestyle="--")
        ax.set_title(name.upper(), fontsize=9, color=INK)
        ax.set_xlabel(f"observed ({unit})", fontsize=7)
        ax.set_ylabel(f"predicted ({unit})", fontsize=7)
        _style(ax)
    fig.suptitle(title, fontsize=10, color=INK, x=0.01, ha="left")
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path)
    plt.close(fig)
    return path


def seed_stability_chart(metrics: pd.DataFrame, metric: str, title: str, path: Path) -> Path:
    fig, ax = plt.subplots(figsize=(7.0, 3.2), dpi=140)
    models = sorted(metrics["model"].unique())
    data = [metrics.loc[metrics["model"] == m, metric].to_numpy(dtype="float64") for m in models]
    box = ax.boxplot(data, tick_labels=[m.upper() for m in models], patch_artist=True, widths=0.5)
    for patch, model in zip(box["boxes"], models):
        patch.set_facecolor(PALETTE.get(model, "#475569"))
        patch.set_alpha(0.35)
        patch.set_edgecolor(PALETTE.get(model, "#475569"))
    for median in box["medians"]:
        median.set_color(INK)
    ax.set_ylabel(metric.upper(), fontsize=9, color=INK)
    ax.set_title(title, fontsize=10, color=INK, loc="left")
    _style(ax)
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path)
    plt.close(fig)
    return path


def extreme_chart(rows: pd.DataFrame, path: Path) -> Path:
    fig, ax = plt.subplots(figsize=(7.0, 3.2), dpi=140)
    labels = [f"{r.location}\n{r.model.upper()}" for r in rows.itertuples()]
    x = np.arange(len(rows))
    width = 0.38
    ax.bar(x - width / 2, rows["recall"], width, label="Recall", color="#2E7D8F")
    ax.bar(x + width / 2, rows["precision"], width, label="Precision", color="#E4A11B")
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=6.5)
    ax.set_ylim(0, 1.05)
    ax.set_title("Extreme rainfall detection on the sealed test tail", fontsize=10, color=INK, loc="left")
    ax.legend(fontsize=8, frameon=False)
    _style(ax)
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path)
    plt.close(fig)
    return path


def overview_dashboard(
    results: List[dict],
    path: Path,
) -> Path:
    """One figure per run: MAE by model and target, averaged over locations."""
    frame = pd.DataFrame(results)
    if frame.empty:
        return path
    fig, axes = plt.subplots(1, 2, figsize=(9.5, 3.4), dpi=140, squeeze=False)
    for ax, target in zip(axes[0], ["temp", "rain"]):
        subset = frame[frame["target"] == target]
        if subset.empty:
            continue
        grouped = subset.groupby("model")["mae"].mean().reindex(["mlp", "gru", "lstm", "xgboost", "ensemble"])
        grouped = grouped.dropna()
        bars = ax.bar(grouped.index, grouped.values, color=[PALETTE.get(m, "#475569") for m in grouped.index], width=0.6)
        for bar, value in zip(bars, grouped.values):
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height(), f"{value:.2f}",
                    ha="center", va="bottom", fontsize=8, color=INK)
        ax.set_title(f"{target.upper()} · mean test MAE across locations", fontsize=9, color=INK, loc="left")
        ax.set_ylabel("MAE", fontsize=8)
        _style(ax)
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path)
    plt.close(fig)
    return path
