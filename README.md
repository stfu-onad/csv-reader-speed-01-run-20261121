[![Bounty](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![Rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/stfu-onad/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)
[![Reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/stfu-onad/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/competitions/csv-reader-speed-01-run-20261121)

# csv-speed

A fast drop-in for make.fun's own csv-reader 1.0.0: `solve.js` answers every
case exactly as csv-reader does — same `{columns, rows, errors}`, same
broken-row policy (BOM, stray CR, unterminated quotes, quote junk, short and
long rows) — in a single left-to-right pass, with fields cut out by `slice`
instead of built character by character and quoted fields skipped to their
next quote with `indexOf`.

## Grade locally

```sh
# correctness: run on the practice set, compare with the reference answers
MAKEFUN_INPUT_DIR=<kit>/practice/input MAKEFUN_OUTPUT_DIR=/tmp/csv-out node main.ts
node <kit>/program/scorer/main.ts  # with MAKEFUN_OUTPUT_DIR=/tmp/csv-out,
                                   # MAKEFUN_REFERENCE_DIR=<kit>/practice/reference,
                                   # MAKEFUN_SCORES_DIR=/tmp/csv-scores
```

## Local timing (practice set, 6 cases, ~10 MB of CSV; 5 runs each, wall median)

| entry | time |
| --- | --- |
| csv-reader 1.0.0 (house baseline) | ~1.59 s |
| csv-speed (this entry) | ~0.74 s |

About 2.2× faster than the baseline end to end on this machine; `run()` alone
is ~5× faster warm (~94 ms vs ~483 ms for the 6 cases). Correctness: 6/6
practice cases identical to the reference, plus 3,500/3,500 differential fuzz
cases identical to csv-reader 1.0.0.
