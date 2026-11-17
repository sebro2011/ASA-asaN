# COSMORA AI v3.0 — run report

- generated: `2026-11-17T18:45:20+00:00`
- config hash: `a6bbe9432b389257`
- data provenance: **NASA_POWER**
- scientific results: **True**
- seeds executed: [7, 21, 42, 84, 123] (configured: [7, 21, 42, 84, 123])
- quick mode: False
- epochs (actual): mlp=300, gru=300, lstm=300
- folds per series: 40 (all series)
- significance: alpha=0.05 · verdicts require the bootstrap interval to exclude zero and both adjusted p-values to clear alpha
- Diebold–Mariano: newey-west (bartlett) variance, lag 6, student-t, df = n-1, harvey-leybourne-newbold correction
- code: 3.0.0 @ `c452a6161f60`
- cache file sha256: colombo=911aac866cb3, kandy=fa9ea32edcbb, jaffna=ef2ea94b66c9

## Validation (walk-forward, mean over seeds)

_Each row is one model × seed. Metrics are computed over **108 distinct target months**; the folds produced **192 forecast instances** (1.78x, folds overlap). Overlapping instances are averaged per month — none is discarded, and instance-level numbers are in `tables/metrics_validation_instances.csv`._

| location | target | model | mae | rmse | r2 | bias |
| --- | --- | --- | --- | --- | --- | --- |
| colombo | rain | ensemble | 2.624 | 3.368 | 0.202 | 0.249 |
| colombo | rain | gru | 2.999 | 3.735 | 0.011 | 0.560 |
| colombo | rain | lstm | 2.890 | 3.679 | 0.046 | 0.131 |
| colombo | rain | mlp | 2.753 | 3.596 | 0.089 | 0.055 |
| colombo | rain | xgboost | 2.634 | 3.281 | 0.244 | 0.630 |
| colombo | temp | ensemble | 0.336 | 0.427 | 0.676 | -0.130 |
| colombo | temp | gru | 0.427 | 0.536 | 0.490 | -0.053 |
| colombo | temp | lstm | 0.400 | 0.525 | 0.506 | -0.114 |
| colombo | temp | mlp | 0.419 | 0.518 | 0.523 | -0.223 |
| colombo | temp | xgboost | 0.279 | 0.364 | 0.766 | -0.068 |
| jaffna | rain | ensemble | 2.058 | 2.773 | 0.414 | 0.301 |
| jaffna | rain | gru | 2.399 | 3.124 | 0.254 | 0.339 |
| jaffna | rain | lstm | 2.256 | 2.964 | 0.331 | 0.314 |
| jaffna | rain | mlp | 2.407 | 3.245 | 0.187 | 0.249 |
| jaffna | rain | xgboost | 1.939 | 2.639 | 0.470 | 0.541 |
| jaffna | temp | ensemble | 0.420 | 0.539 | 0.833 | -0.091 |
| jaffna | temp | gru | 0.571 | 0.720 | 0.699 | -0.048 |
| jaffna | temp | lstm | 0.509 | 0.659 | 0.750 | -0.133 |
| jaffna | temp | mlp | 0.479 | 0.623 | 0.773 | -0.093 |
| jaffna | temp | xgboost | 0.320 | 0.401 | 0.908 | -0.099 |
| kandy | rain | ensemble | 2.912 | 3.936 | 0.103 | 0.272 |
| kandy | rain | gru | 3.483 | 4.525 | -0.201 | 0.474 |
| kandy | rain | lstm | 3.172 | 4.252 | -0.048 | 0.003 |
| kandy | rain | mlp | 3.073 | 4.144 | 0.004 | 0.338 |
| kandy | rain | xgboost | 2.968 | 4.038 | 0.058 | 0.943 |
| kandy | temp | ensemble | 0.584 | 0.749 | 0.676 | -0.245 |
| kandy | temp | gru | 0.765 | 0.978 | 0.448 | -0.259 |
| kandy | temp | lstm | 0.676 | 0.880 | 0.553 | -0.180 |
| kandy | temp | mlp | 0.735 | 0.915 | 0.509 | -0.297 |
| kandy | temp | xgboost | 0.434 | 0.562 | 0.818 | -0.130 |

## Independent test tail (mean over seeds)
| location | target | model | mae | rmse | r2 | bias |
| --- | --- | --- | --- | --- | --- | --- |
| colombo | rain | ensemble | 2.772 | 3.465 | 0.283 | 0.813 |
| colombo | rain | gru | 2.984 | 3.716 | 0.165 | 0.809 |
| colombo | rain | lstm | 3.036 | 3.829 | 0.130 | 0.584 |
| colombo | rain | mlp | 3.051 | 3.884 | 0.089 | 1.046 |
| colombo | rain | xgboost | 2.722 | 3.394 | 0.316 | 0.829 |
| colombo | temp | ensemble | 0.424 | 0.536 | 0.511 | -0.063 |
| colombo | temp | gru | 0.494 | 0.622 | 0.343 | -0.076 |
| colombo | temp | lstm | 0.473 | 0.614 | 0.355 | -0.088 |
| colombo | temp | mlp | 0.462 | 0.579 | 0.422 | -0.024 |
| colombo | temp | xgboost | 0.263 | 0.327 | 0.819 | 0.032 |
| jaffna | rain | ensemble | 2.428 | 3.388 | 0.428 | -0.144 |
| jaffna | rain | gru | 2.504 | 3.422 | 0.414 | -0.515 |
| jaffna | rain | lstm | 2.605 | 3.613 | 0.350 | -0.231 |
| jaffna | rain | mlp | 3.182 | 4.165 | 0.136 | 0.315 |
| jaffna | rain | xgboost | 2.276 | 3.247 | 0.476 | -0.567 |
| jaffna | temp | ensemble | 0.486 | 0.596 | 0.764 | -0.017 |
| jaffna | temp | gru | 0.586 | 0.734 | 0.640 | -0.124 |
| jaffna | temp | lstm | 0.491 | 0.627 | 0.737 | -0.087 |
| jaffna | temp | mlp | 0.631 | 0.805 | 0.559 | 0.159 |
| jaffna | temp | xgboost | 0.349 | 0.446 | 0.868 | 0.011 |
| kandy | rain | ensemble | 2.594 | 3.222 | 0.285 | 0.307 |
| kandy | rain | gru | 2.999 | 3.703 | 0.051 | 0.837 |
| kandy | rain | lstm | 2.719 | 3.409 | 0.200 | 0.258 |
| kandy | rain | mlp | 2.970 | 3.674 | 0.061 | -0.174 |
| kandy | rain | xgboost | 2.473 | 3.149 | 0.319 | 0.055 |
| kandy | temp | ensemble | 0.607 | 0.841 | 0.565 | -0.236 |
| kandy | temp | gru | 0.757 | 1.009 | 0.373 | -0.187 |
| kandy | temp | lstm | 0.700 | 0.958 | 0.432 | -0.228 |
| kandy | temp | mlp | 0.659 | 0.887 | 0.512 | -0.292 |
| kandy | temp | xgboost | 0.471 | 0.609 | 0.772 | 0.092 |

## Statistical comparison on the test tail
| location | target | candidate | reference | ensemble_mae | candidate_mae | mae_delta_ensemble_minus_candidate | ci_low | ci_high | bootstrap_p | dm_stat | dm_p | dm_p_normal | dm_lag | dm_correction | verdict_raw | n_months | dm_q | bootstrap_q | verdict | verdict_pre_correction | alpha | family_size |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| colombo | temp | mlp | ensemble | 0.391 | 0.360 | 0.031 | -0.015 | 0.081 | 0.206 | 0.809 | 0.422 | 0.418 | 6.000 | hln | not distinguishable | 60 | 0.632 | 0.291 | not distinguishable | not distinguishable | 0.050 | 24 |
| colombo | temp | gru | ensemble | 0.391 | 0.415 | -0.024 | -0.054 | 0.006 | 0.120 | -0.898 | 0.373 | 0.369 | 6.000 | hln | not distinguishable | 60 | 0.632 | 0.206 | not distinguishable | not distinguishable | 0.050 | 24 |
| colombo | temp | lstm | ensemble | 0.391 | 0.440 | -0.049 | -0.081 | -0.018 | 0.003 | -2.334 | 0.023 | 0.020 | 6.000 | hln | better | 60 | 0.100 | 0.017 | inconclusive (tests disagree) | better | 0.050 | 24 |
| colombo | temp | xgboost | ensemble | 0.391 | 0.260 | 0.132 | 0.060 | 0.204 | 0.000 | 2.184 | 0.033 | 0.029 | 6.000 | hln | worse | 60 | 0.111 | 0.005 | inconclusive (tests disagree) | worse | 0.050 | 24 |
| colombo | rain | mlp | ensemble | 2.637 | 2.625 | 0.012 | -0.279 | 0.316 | 0.931 | 0.058 | 0.954 | 0.954 | 6.000 | hln | not distinguishable | 60 | 0.986 | 0.983 | not distinguishable | not distinguishable | 0.050 | 24 |
| colombo | rain | gru | ensemble | 2.637 | 2.657 | -0.020 | -0.190 | 0.146 | 0.804 | -0.164 | 0.870 | 0.869 | 6.000 | hln | not distinguishable | 60 | 0.986 | 0.964 | not distinguishable | not distinguishable | 0.050 | 24 |
| colombo | rain | lstm | ensemble | 2.637 | 2.882 | -0.245 | -0.459 | -0.035 | 0.026 | -2.020 | 0.048 | 0.043 | 6.000 | hln | better | 60 | 0.128 | 0.098 | inconclusive (tests disagree) | better | 0.050 | 24 |
| colombo | rain | xgboost | ensemble | 2.637 | 2.708 | -0.071 | -0.362 | 0.226 | 0.630 | -0.490 | 0.626 | 0.624 | 6.000 | hln | not distinguishable | 60 | 0.791 | 0.796 | not distinguishable | not distinguishable | 0.050 | 24 |
| kandy | temp | mlp | ensemble | 0.565 | 0.525 | 0.040 | -0.021 | 0.102 | 0.206 | 0.816 | 0.418 | 0.414 | 6.000 | hln | not distinguishable | 60 | 0.632 | 0.291 | not distinguishable | not distinguishable | 0.050 | 24 |
| kandy | temp | gru | ensemble | 0.565 | 0.605 | -0.041 | -0.087 | 0.009 | 0.095 | -1.360 | 0.179 | 0.174 | 6.000 | hln | not distinguishable | 60 | 0.429 | 0.194 | not distinguishable | not distinguishable | 0.050 | 24 |
| kandy | temp | lstm | ensemble | 0.565 | 0.643 | -0.078 | -0.122 | -0.039 | 0.000 | -2.359 | 0.022 | 0.018 | 6.000 | hln | better | 60 | 0.100 | 0.005 | inconclusive (tests disagree) | better | 0.050 | 24 |
| kandy | temp | xgboost | ensemble | 0.565 | 0.466 | 0.099 | -0.020 | 0.225 | 0.113 | 0.949 | 0.347 | 0.343 | 6.000 | hln | not distinguishable | 60 | 0.632 | 0.206 | not distinguishable | not distinguishable | 0.050 | 24 |
| kandy | rain | mlp | ensemble | 2.448 | 2.557 | -0.109 | -0.362 | 0.155 | 0.418 | -0.704 | 0.484 | 0.482 | 6.000 | hln | not distinguishable | 60 | 0.646 | 0.557 | not distinguishable | not distinguishable | 0.050 | 24 |
| kandy | rain | gru | ensemble | 2.448 | 2.615 | -0.167 | -0.363 | 0.035 | 0.097 | -2.136 | 0.037 | 0.033 | 6.000 | hln | inconclusive (tests disagree) | 60 | 0.111 | 0.194 | not distinguishable | inconclusive (tests disagree) | 0.050 | 24 |
| kandy | rain | lstm | ensemble | 2.448 | 2.614 | -0.166 | -0.316 | -0.013 | 0.031 | -1.291 | 0.202 | 0.197 | 6.000 | hln | inconclusive (tests disagree) | 60 | 0.441 | 0.098 | inconclusive (tests disagree) | inconclusive (tests disagree) | 0.050 | 24 |
| kandy | rain | xgboost | ensemble | 2.448 | 2.452 | -0.004 | -0.343 | 0.335 | 0.983 | -0.025 | 0.980 | 0.980 | 6.000 | hln | not distinguishable | 60 | 0.986 | 0.983 | not distinguishable | not distinguishable | 0.050 | 24 |
| jaffna | temp | mlp | ensemble | 0.452 | 0.518 | -0.066 | -0.137 | 0.002 | 0.062 | -1.005 | 0.319 | 0.315 | 6.000 | hln | not distinguishable | 60 | 0.632 | 0.148 | not distinguishable | not distinguishable | 0.050 | 24 |
| jaffna | temp | gru | ensemble | 0.452 | 0.485 | -0.033 | -0.081 | 0.016 | 0.186 | -0.732 | 0.467 | 0.464 | 6.000 | hln | not distinguishable | 60 | 0.646 | 0.291 | not distinguishable | not distinguishable | 0.050 | 24 |
| jaffna | temp | lstm | ensemble | 0.452 | 0.453 | -0.001 | -0.046 | 0.046 | 0.976 | -0.018 | 0.986 | 0.986 | 6.000 | hln | not distinguishable | 60 | 0.986 | 0.983 | not distinguishable | not distinguishable | 0.050 | 24 |
| jaffna | temp | xgboost | ensemble | 0.452 | 0.345 | 0.107 | 0.041 | 0.173 | 0.002 | 3.263 | 0.002 | 0.001 | 6.000 | hln | worse | 60 | 0.022 | 0.016 | worse | worse | 0.050 | 24 |
| jaffna | rain | mlp | ensemble | 2.263 | 2.511 | -0.248 | -0.508 | -0.010 | 0.051 | -2.649 | 0.010 | 0.008 | 6.000 | hln | better | 60 | 0.083 | 0.137 | inconclusive (tests disagree) | better | 0.050 | 24 |
| jaffna | rain | gru | ensemble | 2.263 | 2.057 | 0.206 | 0.060 | 0.348 | 0.006 | 3.549 | 0.001 | 0.000 | 6.000 | hln | worse | 60 | 0.018 | 0.027 | worse | worse | 0.050 | 24 |
| jaffna | rain | lstm | ensemble | 2.263 | 2.472 | -0.210 | -0.393 | -0.013 | 0.033 | -2.302 | 0.025 | 0.021 | 6.000 | hln | better | 60 | 0.100 | 0.098 | inconclusive (tests disagree) | better | 0.050 | 24 |
| jaffna | rain | xgboost | ensemble | 2.263 | 2.269 | -0.006 | -0.399 | 0.374 | 0.972 | -0.046 | 0.964 | 0.964 | 6.000 | hln | not distinguishable | 60 | 0.986 | 0.983 | not distinguishable | not distinguishable | 0.050 | 24 |

## Extreme rainfall
| location | model | threshold_mm_per_day | threshold_quantile | train_months | test_months | observed_events | predicted_events | true_positives | false_positives | false_negatives | precision | recall | f1 | underprediction_rate_on_events | mae_on_events | rmse_on_events | max_observed | max_predicted | rank_auc |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| colombo | mlp | 13.330 | 0.950 | 240.000 | 60.000 | 6.000 | 3.000 | 2.000 | 1.000 | 4.000 | 0.667 | 0.333 | 0.444 | 1.000 | 4.662 | 4.997 | 17.980 | 14.770 | 0.787 |
| colombo | gru | 13.330 | 0.950 | 240.000 | 60.000 | 6.000 | 0.000 | 0.000 | 0.000 | 6.000 | — | 0.000 | — | 1.000 | 5.598 | 5.698 | 17.980 | 11.799 | 0.855 |
| colombo | lstm | 13.330 | 0.950 | 240.000 | 60.000 | 6.000 | 0.000 | 0.000 | 0.000 | 6.000 | — | 0.000 | — | 1.000 | 7.256 | 7.347 | 17.980 | 10.683 | 0.722 |
| colombo | xgboost | 13.330 | 0.950 | 240.000 | 60.000 | 6.000 | 0.000 | 0.000 | 0.000 | 6.000 | — | 0.000 | — | 1.000 | 5.153 | 5.360 | 17.980 | 13.062 | 0.793 |
| colombo | ensemble | 13.330 | 0.950 | 240.000 | 60.000 | 6.000 | 0.000 | 0.000 | 0.000 | 6.000 | — | 0.000 | — | 1.000 | 5.839 | 5.903 | 17.980 | 11.718 | 0.799 |
| kandy | mlp | 12.420 | 0.950 | 240.000 | 60.000 | 4.000 | 1.000 | 1.000 | 0.000 | 3.000 | 1.000 | 0.250 | 0.400 | 1.000 | 4.222 | 4.575 | 15.670 | 12.576 | 0.951 |
| kandy | gru | 12.420 | 0.950 | 240.000 | 60.000 | 4.000 | 0.000 | 0.000 | 0.000 | 4.000 | — | 0.000 | — | 1.000 | 5.756 | 5.772 | 15.670 | 9.943 | 0.951 |
| kandy | lstm | 12.420 | 0.950 | 240.000 | 60.000 | 4.000 | 0.000 | 0.000 | 0.000 | 4.000 | — | 0.000 | — | 1.000 | 7.202 | 7.246 | 15.670 | 8.633 | 0.888 |
| kandy | xgboost | 12.420 | 0.950 | 240.000 | 60.000 | 4.000 | 1.000 | 1.000 | 0.000 | 3.000 | 1.000 | 0.250 | 0.400 | 1.000 | 4.468 | 4.960 | 15.670 | 14.205 | 0.938 |
| kandy | ensemble | 12.420 | 0.950 | 240.000 | 60.000 | 4.000 | 0.000 | 0.000 | 0.000 | 4.000 | — | 0.000 | — | 1.000 | 5.726 | 5.807 | 15.670 | 10.185 | 0.938 |
| jaffna | mlp | 9.650 | 0.950 | 240.000 | 60.000 | 7.000 | 5.000 | 1.000 | 4.000 | 6.000 | 0.200 | 0.143 | 0.167 | 1.000 | 5.525 | 6.586 | 20.900 | 12.582 | 0.895 |
| jaffna | gru | 9.650 | 0.950 | 240.000 | 60.000 | 7.000 | 0.000 | 0.000 | 0.000 | 7.000 | — | 0.000 | — | 1.000 | 6.530 | 7.342 | 20.900 | 9.058 | 0.949 |
| jaffna | lstm | 9.650 | 0.950 | 240.000 | 60.000 | 7.000 | 0.000 | 0.000 | 0.000 | 7.000 | — | 0.000 | — | 1.000 | 7.364 | 8.128 | 20.900 | 7.764 | 0.930 |
| jaffna | xgboost | 9.650 | 0.950 | 240.000 | 60.000 | 7.000 | 4.000 | 2.000 | 2.000 | 5.000 | 0.500 | 0.286 | 0.364 | 1.000 | 5.863 | 6.657 | 20.900 | 11.527 | 0.892 |
| jaffna | ensemble | 9.650 | 0.950 | 240.000 | 60.000 | 7.000 | 0.000 | 0.000 | 0.000 | 7.000 | — | 0.000 | — | 1.000 | 6.473 | 7.316 | 20.900 | 9.102 | 0.916 |

## Reproduction
```bash
python scripts/run_experiments.py --config config/experiment.json
```

## Limitations carried by this run
- POWER values are gridded reanalysis/satellite estimates (~0.5 x 0.625 deg), not station observations; the Kandy highlands and coastal sea-breeze effects are poorly resolved at that scale.
- The task is one-month-ahead prediction from a 12-month lookback. Nothing here is a multi-year projection and the results must not be quoted as such.
- The walk-forward design evaluates a fixed configuration. Nested hyper-parameter selection was not performed, so the reported scores are for a tuned-on-prior-knowledge model, not an oracle.
- Only one dataset (NASA POWER) and one grid cell per city are used. Cross-source agreement (IMD, department of meteorology gauges) is not established.
- Ensemble weights are equal by construction to avoid fitting weights on the evaluation window; a learned weighting could be better or worse and has not been tested.
