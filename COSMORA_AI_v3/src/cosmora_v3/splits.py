"""Walk-forward validation and a sealed test tail.

Layout for ``n`` usable months, with ``T = test_months``:

    [ ---- walk-forward cross-validation ---- ][ test tail ]
    fold 0: train [0, i0)            validate [i0, i0+V)
    fold 1: train [0, i0+S)          validate [i0+S, i0+S+V)
    ...
    test:   train [0, n-T)            evaluate  [n-T, n)     (touched once)

Two invariants are enforced here rather than trusted to the caller:

* a fold's validation window never starts before its training window ends;
* every fold's validation window ends at or before ``n - T``, so the test tail is
  never seen by any fitted model, scaler or conformal calibration step.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterator, List


@dataclass(frozen=True)
class Split:
    name: str
    train_start: int
    train_end: int  # exclusive
    eval_start: int
    eval_end: int  # exclusive

    @property
    def train_slice(self) -> slice:
        return slice(self.train_start, self.train_end)

    @property
    def eval_slice(self) -> slice:
        return slice(self.eval_start, self.eval_end)

    def describe(self) -> Dict[str, int | str]:
        return {
            "name": self.name,
            "train_start": self.train_start,
            "train_end": self.train_end,
            "train_months": self.train_end - self.train_start,
            "eval_start": self.eval_start,
            "eval_end": self.eval_end,
            "eval_months": self.eval_end - self.eval_start,
        }


def test_split(n_samples: int, config: Dict[str, Any]) -> Split:
    splits_cfg = config["splits"]
    reserved = int(splits_cfg["test_months"])
    if n_samples - reserved < int(splits_cfg["cv_initial_train_months"]):
        raise ValueError("test tail leaves too few months for validation")
    boundary = n_samples - reserved
    # Training is *everything before* the tail. Getting this wrong — an empty or
    # truncated training window — produces a model fitted on nothing, and the scores
    # still look plausible, so it is asserted here and in tests/test_splits.py.
    return Split("test", train_start=0, train_end=boundary, eval_start=boundary, eval_end=n_samples)


def walk_forward_splits(n_samples: int, config: Dict[str, Any]) -> List[Split]:
    """Expanding-window folds that stop before the sealed test tail."""
    splits_cfg = config["splits"]
    initial = int(splits_cfg["cv_initial_train_months"])
    horizon = int(splits_cfg["cv_validation_months"])
    step = int(splits_cfg["cv_step_months"])
    edge = n_samples - int(splits_cfg["test_months"])

    if edge - horizon < initial:
        raise ValueError(
            f"no room for a fold: initial={initial}, horizon={horizon}, validation_edge={edge}"
        )

    folds: List[Split] = []
    validation_start = initial
    while validation_start + horizon <= edge:
        folds.append(
            Split(
                name=f"fold{len(folds)}",
                train_start=0,
                train_end=validation_start,
                eval_start=validation_start,
                eval_end=validation_start + horizon,
            )
        )
        validation_start += step
    if not folds:
        raise ValueError("configuration produced zero walk-forward folds")
    return folds


def assert_no_overlap(folds: List[Split], test: Split, n_samples: int) -> None:
    """Fail loudly if any fold leaks into the sealed tail."""
    for fold in folds:
        if fold.train_end > fold.eval_start:
            raise AssertionError(f"{fold.name}: training overlaps validation")
        if fold.eval_end > test.eval_start:
            raise AssertionError(
                f"{fold.name}: validation reaches {fold.eval_end}, past the test boundary {test.eval_start}"
            )
    if test.eval_end > n_samples:
        raise AssertionError("test split runs past the end of the series")


def iter_folds(n_samples: int, config: Dict[str, Any]) -> Iterator[Split]:
    for fold in walk_forward_splits(n_samples, config):
        yield fold
