# COSMORA AI v3.0 — run report

- generated: `2026-11-17T18:26:11+00:00`
- config hash: `6da3a2ceb621a903`
- data provenance: **NASA_POWER**
- scientific results: **True**
- seeds executed: [7, 21, 42, 84, 123] (configured: [7, 21, 42, 84, 123])
- quick mode: False

## Validation (walk-forward, mean over seeds)
| location | target | model | mae | rmse | r2 | bias |
| --- | --- | --- | --- | --- | --- | --- |
| colombo | rain | ensemble | 2.846 | 3.537 | 0.119 | 0.814 |
| colombo | rain | gru | 3.339 | 4.171 | -0.242 | 1.013 |
| colombo | rain | lstm | 3.134 | 3.933 | -0.088 | 0.604 |
| colombo | rain | mlp | 3.207 | 4.115 | -0.195 | 0.824 |
| colombo | rain | xgboost | 2.604 | 3.238 | 0.263 | 0.609 |
| colombo | temp | ensemble | 0.367 | 0.472 | 0.593 | -0.107 |
| colombo | temp | gru | 0.468 | 0.600 | 0.343 | -0.072 |
| colombo | temp | lstm | 0.415 | 0.552 | 0.446 | -0.096 |
| colombo | temp | mlp | 0.463 | 0.594 | 0.347 | -0.155 |
| colombo | temp | xgboost | 0.281 | 0.363 | 0.761 | -0.045 |
| jaffna | rain | ensemble | 2.289 | 3.123 | 0.224 | 0.686 |
| jaffna | rain | gru | 2.631 | 3.447 | 0.050 | 0.699 |
| jaffna | rain | lstm | 2.589 | 3.483 | 0.034 | 0.814 |
| jaffna | rain | mlp | 2.625 | 3.700 | -0.092 | 0.544 |
| jaffna | rain | xgboost | 1.994 | 2.722 | 0.411 | 0.638 |
| jaffna | temp | ensemble | 0.474 | 0.624 | 0.773 | -0.107 |
| jaffna | temp | gru | 0.661 | 0.866 | 0.555 | -0.087 |
| jaffna | temp | lstm | 0.526 | 0.717 | 0.703 | -0.106 |
| jaffna | temp | mlp | 0.583 | 0.766 | 0.651 | -0.128 |
| jaffna | temp | xgboost | 0.324 | 0.403 | 0.906 | -0.097 |
| kandy | rain | ensemble | 3.162 | 4.116 | -0.011 | 0.991 |
| kandy | rain | gru | 3.889 | 5.051 | -0.563 | 0.969 |
| kandy | rain | lstm | 3.344 | 4.406 | -0.157 | 0.766 |
| kandy | rain | mlp | 3.596 | 4.788 | -0.381 | 1.237 |
| kandy | rain | xgboost | 2.953 | 4.102 | -0.001 | 1.023 |
| kandy | temp | ensemble | 0.607 | 0.778 | 0.630 | -0.181 |
| kandy | temp | gru | 0.808 | 1.031 | 0.346 | -0.206 |
| kandy | temp | lstm | 0.673 | 0.865 | 0.543 | -0.133 |
| kandy | temp | mlp | 0.755 | 0.982 | 0.403 | -0.205 |
| kandy | temp | xgboost | 0.425 | 0.543 | 0.820 | -0.109 |

## Independent test tail (mean over seeds)
| location | target | model | mae | rmse | r2 | bias |
| --- | --- | --- | --- | --- | --- | --- |
| colombo | rain | ensemble | 2.418 | 3.079 | 0.436 | -0.047 |
| colombo | rain | gru | 2.706 | 3.442 | 0.294 | 0.182 |
| colombo | rain | lstm | 2.756 | 3.482 | 0.270 | -0.383 |
| colombo | rain | mlp | 2.718 | 3.566 | 0.240 | 0.062 |
| colombo | rain | xgboost | 2.722 | 3.394 | 0.316 | 0.829 |
| colombo | temp | ensemble | 0.360 | 0.455 | 0.648 | 0.023 |
| colombo | temp | gru | 0.399 | 0.498 | 0.563 | 0.054 |
| colombo | temp | lstm | 0.460 | 0.584 | 0.393 | -0.152 |
| colombo | temp | mlp | 0.507 | 0.635 | 0.271 | 0.168 |
| colombo | temp | xgboost | 0.263 | 0.327 | 0.819 | 0.032 |
| jaffna | rain | ensemble | 2.260 | 3.315 | 0.452 | -0.940 |
| jaffna | rain | gru | 2.683 | 3.653 | 0.332 | -0.965 |
| jaffna | rain | lstm | 2.434 | 3.491 | 0.384 | -0.722 |
| jaffna | rain | mlp | 2.596 | 3.722 | 0.309 | -1.134 |
| jaffna | rain | xgboost | 2.276 | 3.247 | 0.476 | -0.567 |
| jaffna | temp | ensemble | 0.495 | 0.606 | 0.754 | 0.160 |
| jaffna | temp | gru | 0.585 | 0.738 | 0.636 | 0.200 |
| jaffna | temp | lstm | 0.519 | 0.653 | 0.716 | 0.070 |
| jaffna | temp | mlp | 0.655 | 0.833 | 0.525 | 0.212 |
| jaffna | temp | xgboost | 0.349 | 0.446 | 0.868 | 0.011 |
| kandy | rain | ensemble | 2.337 | 2.911 | 0.416 | -0.060 |
| kandy | rain | gru | 2.625 | 3.316 | 0.242 | 0.470 |
| kandy | rain | lstm | 2.514 | 3.243 | 0.273 | 0.159 |
| kandy | rain | mlp | 2.867 | 3.558 | 0.119 | -0.810 |
| kandy | rain | xgboost | 2.473 | 3.149 | 0.319 | 0.055 |
| kandy | temp | ensemble | 0.559 | 0.737 | 0.665 | -0.107 |
| kandy | temp | gru | 0.723 | 0.899 | 0.500 | -0.120 |
| kandy | temp | lstm | 0.614 | 0.817 | 0.587 | -0.110 |
| kandy | temp | mlp | 0.735 | 0.945 | 0.440 | -0.092 |
| kandy | temp | xgboost | 0.471 | 0.609 | 0.772 | 0.092 |

## Statistical comparison on the test tail
| location | target | candidate | reference | ensemble_mae | candidate_mae | mae_delta_ensemble_minus_candidate | ci_low | ci_high | bootstrap_p | dm_stat | dm_p | verdict | n_months |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| colombo | temp | mlp | ensemble | 0.307 | 0.310 | -0.003 | -0.058 | 0.058 | 0.931 | -0.054 | 0.957 | not distinguishable | 60 |
| colombo | temp | gru | ensemble | 0.307 | 0.302 | 0.005 | -0.017 | 0.029 | 0.654 | 0.319 | 0.750 | not distinguishable | 60 |
| colombo | temp | lstm | ensemble | 0.307 | 0.395 | -0.087 | -0.144 | -0.032 | 0.004 | -1.692 | 0.091 | inconclusive (tests disagree) | 60 |
| colombo | temp | xgboost | ensemble | 0.307 | 0.260 | 0.048 | -0.000 | 0.097 | 0.055 | 1.378 | 0.168 | not distinguishable | 60 |
| colombo | rain | mlp | ensemble | 2.271 | 2.133 | 0.137 | -0.109 | 0.393 | 0.280 | 0.759 | 0.448 | not distinguishable | 60 |
| colombo | rain | gru | ensemble | 2.271 | 2.409 | -0.138 | -0.300 | 0.019 | 0.083 | -1.947 | 0.052 | not distinguishable | 60 |
| colombo | rain | lstm | ensemble | 2.271 | 2.469 | -0.198 | -0.399 | 0.005 | 0.057 | -1.725 | 0.084 | not distinguishable | 60 |
| colombo | rain | xgboost | ensemble | 2.271 | 2.708 | -0.437 | -0.754 | -0.121 | 0.006 | -3.028 | 0.002 | better | 60 |
| kandy | temp | mlp | ensemble | 0.488 | 0.463 | 0.025 | -0.045 | 0.094 | 0.485 | 0.468 | 0.640 | not distinguishable | 60 |
| kandy | temp | gru | ensemble | 0.488 | 0.596 | -0.108 | -0.170 | -0.046 | 0.000 | -2.922 | 0.003 | better | 60 |
| kandy | temp | lstm | ensemble | 0.488 | 0.557 | -0.069 | -0.114 | -0.023 | 0.002 | -1.961 | 0.050 | better | 60 |
| kandy | temp | xgboost | ensemble | 0.488 | 0.466 | 0.023 | -0.067 | 0.113 | 0.619 | 0.412 | 0.680 | not distinguishable | 60 |
| kandy | rain | mlp | ensemble | 2.207 | 2.406 | -0.199 | -0.451 | 0.065 | 0.123 | -1.436 | 0.151 | not distinguishable | 60 |
| kandy | rain | gru | ensemble | 2.207 | 2.361 | -0.155 | -0.401 | 0.090 | 0.214 | -0.936 | 0.349 | not distinguishable | 60 |
| kandy | rain | lstm | ensemble | 2.207 | 2.216 | -0.010 | -0.177 | 0.161 | 0.918 | -0.113 | 0.910 | not distinguishable | 60 |
| kandy | rain | xgboost | ensemble | 2.207 | 2.452 | -0.245 | -0.512 | 0.019 | 0.069 | -1.910 | 0.056 | not distinguishable | 60 |
| jaffna | temp | mlp | ensemble | 0.459 | 0.527 | -0.067 | -0.118 | -0.021 | 0.008 | -2.579 | 0.010 | better | 60 |
| jaffna | temp | gru | ensemble | 0.459 | 0.450 | 0.010 | -0.039 | 0.059 | 0.702 | 0.430 | 0.667 | not distinguishable | 60 |
| jaffna | temp | lstm | ensemble | 0.459 | 0.461 | -0.002 | -0.047 | 0.044 | 0.946 | -0.054 | 0.957 | not distinguishable | 60 |
| jaffna | temp | xgboost | ensemble | 0.459 | 0.345 | 0.114 | 0.047 | 0.183 | 0.001 | 1.928 | 0.054 | inconclusive (tests disagree) | 60 |
| jaffna | rain | mlp | ensemble | 2.111 | 2.234 | -0.123 | -0.320 | 0.055 | 0.202 | -1.181 | 0.238 | not distinguishable | 60 |
| jaffna | rain | gru | ensemble | 2.111 | 2.142 | -0.031 | -0.186 | 0.110 | 0.690 | -0.375 | 0.708 | not distinguishable | 60 |
| jaffna | rain | lstm | ensemble | 2.111 | 2.242 | -0.131 | -0.318 | 0.064 | 0.180 | -1.328 | 0.184 | not distinguishable | 60 |
| jaffna | rain | xgboost | ensemble | 2.111 | 2.269 | -0.158 | -0.481 | 0.159 | 0.339 | -1.417 | 0.157 | not distinguishable | 60 |

## Extreme rainfall
| location | model | threshold_mm_per_day | threshold_quantile | train_months | test_months | observed_events | predicted_events | true_positives | false_positives | false_negatives | precision | recall | f1 | underprediction_rate_on_events | mae_on_events | rmse_on_events | max_observed | max_predicted | rank_auc |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| colombo | mlp | 13.330 | 0.950 | 240.000 | 60.000 | 6.000 | 2.000 | 2.000 | 0.000 | 4.000 | 1.000 | 0.333 | 0.500 | 1.000 | 4.506 | 5.050 | 17.980 | 14.234 | 0.846 |
| colombo | gru | 13.330 | 0.950 | 240.000 | 60.000 | 6.000 | 0.000 | 0.000 | 0.000 | 6.000 | — | 0.000 | — | 1.000 | 5.428 | 5.522 | 17.980 | 11.328 | 0.910 |
| colombo | lstm | 13.330 | 0.950 | 240.000 | 60.000 | 6.000 | 0.000 | 0.000 | 0.000 | 6.000 | — | 0.000 | — | 1.000 | 6.950 | 6.993 | 17.980 | 10.127 | 0.827 |
| colombo | xgboost | 13.330 | 0.950 | 240.000 | 60.000 | 6.000 | 0.000 | 0.000 | 0.000 | 6.000 | — | 0.000 | — | 1.000 | 5.153 | 5.360 | 17.980 | 13.062 | 0.793 |
| colombo | ensemble | 13.330 | 0.950 | 240.000 | 60.000 | 6.000 | 0.000 | 0.000 | 0.000 | 6.000 | — | 0.000 | — | 1.000 | 5.628 | 5.719 | 17.980 | 11.831 | 0.870 |
| kandy | mlp | 12.420 | 0.950 | 240.000 | 60.000 | 4.000 | 1.000 | 1.000 | 0.000 | 3.000 | 1.000 | 0.250 | 0.400 | 1.000 | 3.570 | 3.801 | 15.670 | 13.054 | 0.991 |
| kandy | gru | 12.420 | 0.950 | 240.000 | 60.000 | 4.000 | 0.000 | 0.000 | 0.000 | 4.000 | — | 0.000 | — | 1.000 | 4.936 | 4.956 | 15.670 | 10.606 | 0.982 |
| kandy | lstm | 12.420 | 0.950 | 240.000 | 60.000 | 4.000 | 1.000 | 1.000 | 0.000 | 3.000 | 1.000 | 0.250 | 0.400 | 1.000 | 3.892 | 4.419 | 15.670 | 13.758 | 0.946 |
| kandy | xgboost | 12.420 | 0.950 | 240.000 | 60.000 | 4.000 | 1.000 | 1.000 | 0.000 | 3.000 | 1.000 | 0.250 | 0.400 | 1.000 | 4.468 | 4.960 | 15.670 | 14.205 | 0.938 |
| kandy | ensemble | 12.420 | 0.950 | 240.000 | 60.000 | 4.000 | 0.000 | 0.000 | 0.000 | 4.000 | — | 0.000 | — | 1.000 | 4.132 | 4.293 | 15.670 | 11.965 | 0.982 |
| jaffna | mlp | 9.650 | 0.950 | 240.000 | 60.000 | 7.000 | 2.000 | 1.000 | 1.000 | 6.000 | 0.500 | 0.143 | 0.222 | 1.000 | 6.498 | 7.397 | 20.900 | 12.142 | 0.927 |
| jaffna | gru | 9.650 | 0.950 | 240.000 | 60.000 | 7.000 | 1.000 | 1.000 | 0.000 | 6.000 | 1.000 | 0.143 | 0.250 | 1.000 | 6.923 | 7.611 | 20.900 | 10.354 | 0.927 |
| jaffna | lstm | 9.650 | 0.950 | 240.000 | 60.000 | 7.000 | 3.000 | 1.000 | 2.000 | 6.000 | 0.333 | 0.143 | 0.200 | 1.000 | 5.849 | 7.077 | 20.900 | 13.448 | 0.946 |
| jaffna | xgboost | 9.650 | 0.950 | 240.000 | 60.000 | 7.000 | 4.000 | 2.000 | 2.000 | 5.000 | 0.500 | 0.286 | 0.364 | 1.000 | 5.863 | 6.657 | 20.900 | 11.527 | 0.892 |
| jaffna | ensemble | 9.650 | 0.950 | 240.000 | 60.000 | 7.000 | 1.000 | 1.000 | 0.000 | 6.000 | 1.000 | 0.143 | 0.250 | 1.000 | 6.424 | 7.311 | 20.900 | 11.955 | 0.935 |

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
