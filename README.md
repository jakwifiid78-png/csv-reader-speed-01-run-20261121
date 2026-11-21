[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/jakwifiid78-png/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/jakwifiid78-png/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# Faster drop-in for csv-reader 1.0.0 — csv-reader-speed-01-run-20261121

My entry for make.fun's **"Read broken CSV files faster, 21 November 2026"**
bounty ($100, top 10 paid $10 each):
https://make.fun/bounty/csv-reader-speed-01-run-20261121

## What it does

`solve.js` exports `run(input)`, which returns exactly what make.fun's own
csv-reader 1.0.0 returns for `{text, header}` — `{columns, rows, errors}` —
including its whole broken-row policy: BOM drop, LF/CRLF, stray CRs, doubled
quotes, quote junk, unterminated quotes, short/long rows, and the exact
`{code, line, row}` error order. `main.ts` is the driver the harness runs:
it reads every case from `cases.json`, answers each one with `run`, and
writes `answers.json`.

## How it is faster

The reference walks the text one character at a time and glues every field
together char by char. This reader does one left-to-right pass that jumps
between field boundaries with `indexOf` and slices fields straight out of
the input instead of building them up:

- an unquoted field with no carriage return is a single slice;
- a quoted field with no doubled quote and no embedded line break is a
  single slice — the extra work (un-doubling quotes, turning CR/CRLF inside
  quotes into LF) only runs when the field actually needs it;
- no regex per field, no big splits, no per-character loop on the hot path.

## Measured speed (this machine, practice set, 6 cases, 10.2 MB)

- Pure `run()` time: **217 ms vs 887 ms reference — 4.08x faster**
- Whole driver end to end (JSON in/out + startup): **1,378 ms vs 2,746 ms
  reference — ~2.0x faster**
- Synthetic 20,001-row CRLF file (1.8 MB): **89 ms vs 181 ms — 2.02x**

## Correctness

- Practice set: **6/6 cases identical to the reference** (checked against
  the kit's `practice/reference/expected.json` via the scorer's canonical
  comparison, and by running `main.ts` end to end).
- Hand-written edge battery: **107/107 cases identical** — BOM, CRLF,
  stray CRs (mid-field, before comma, at end of file, several in a row),
  quoted fields, doubled quotes, quote junk, unterminated quotes, quotes
  inside unquoted fields, empty/blank lines, header true/false, short and
  long rows, error line/row numbering, Unicode fields.
