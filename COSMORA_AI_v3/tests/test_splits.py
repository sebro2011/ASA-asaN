"""The split guarantees the methodology depends on.

If any assertion here fails, every number in the results tables is suspect: the
test tail would no longer be independent, or training would include the month it is
supposed to be predicting.
"""

from __future__ import annotations

import unittest

import common  # noqa: F401  (sets sys.path)

from cosmora_v3.splits import assert_no_overlap, test_split, walk_forward_splits


class SplitTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = common.tiny_config()
        self.n = 200

    def test_folds_expand_and_never_overlap(self) -> None:
        folds = walk_forward_splits(self.n, self.config)
        self.assertGreaterEqual(len(folds), 2)
        previous_end = -1
        for fold in folds:
            self.assertLessEqual(fold.train_end, fold.eval_start, "training must end where validation starts")
            self.assertGreater(fold.eval_end, fold.eval_start)
            self.assertGreater(fold.train_end, previous_end, "training window must expand")
            previous_end = fold.train_end

    def test_folds_never_reach_the_sealed_tail(self) -> None:
        folds = walk_forward_splits(self.n, self.config)
        test = test_split(self.n, self.config)
        assert_no_overlap(folds, test, self.n)  # would raise
        for fold in folds:
            self.assertLessEqual(fold.eval_end, test.eval_start)

    def test_test_split_is_the_tail(self) -> None:
        test = test_split(self.n, self.config)
        self.assertEqual(test.eval_end, self.n)
        self.assertEqual(test.eval_end - test.eval_start, self.config["splits"]["test_months"])

    def test_test_split_trains_on_all_preceding_history(self) -> None:
        """The final model must see the whole record before the tail, not a slice.

        An empty training window still predicts (badly) and still produces a metric
        table, so this has to be asserted rather than assumed.
        """
        test = test_split(self.n, self.config)
        self.assertEqual(test.train_start, 0)
        self.assertEqual(test.train_end, test.eval_start)
        self.assertGreater(test.train_end - test.train_start, 0)
        self.assertGreaterEqual(
            test.train_end - test.train_start, self.config["splits"]["cv_initial_train_months"]
        )

    def test_validation_windows_are_contiguous_history(self) -> None:
        """Every validation month is predicted from a strictly earlier window."""
        folds = walk_forward_splits(self.n, self.config)
        for fold in folds:
            for month in range(fold.eval_start, fold.eval_end):
                self.assertLess(month, fold.eval_end)
                self.assertGreaterEqual(month, fold.train_end)

    def test_config_too_short_is_rejected(self) -> None:
        config = common.tiny_config()
        config["splits"]["test_months"] = 400
        with self.assertRaises(ValueError):
            test_split(self.n, config)


if __name__ == "__main__":
    unittest.main()
