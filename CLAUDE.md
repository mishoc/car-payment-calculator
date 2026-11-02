# Car Payments

Auto loan calculator for a dealer purchase of a new or used car, with every state tax and
government fee itemized. Static site: Vite + React + TypeScript, Zod, Vitest. No backend, no
accounts, no applicant data.

## Hard rules

1. **No state names in engine code.** Every state difference enters through a field in the
   state record (`data/states/*.json`). Code under `src/engine/` must never branch on a state
   name or code. Engine tests use a made-up test state.
2. **No state data without a primary source.** Every number and rule in a state record comes
   from a state revenue department, DMV, statute, or regulator page, stored with its URL, page
   title, and the date it was checked. Aggregator sites (Car Concierge Pro, CarEdge, OTDCheck,
   etc.) may only be used to flag conflicts for the reviewer. Never fill a field from an
   aggregator or from model memory. If no primary source is found, leave the field `null`,
   keep `status: "draft"`, and say so in the pull request.
3. **Every unreviewed state is labeled "unverified estimate".** A state whose `status` is
   `draft` shows that label on every result. Only a person's review flips `status` to
   `verified`.

## Math rules

- Keep full precision through every calculation. Round to cents only for display, except where
  a state's source says how it rounds a tax line.
- Monthly payment: `M = P * r / (1 - (1 + r)^-n)` with `r = APR / 12`; if APR is 0,
  `M = P / n`.
- The entered rate is treated as the loan's interest rate; the UI labels it
  "interest rate (APR)" with a note that a lender's legal APR can be higher.

## Layout

- `src/engine/` pure calculation functions (loan math, tax and fee engine). No React, no I/O.
- `src/` React UI.
- `data/states/` one JSON file per state.

## Commands

- `npm run dev` local dev server
- `npm run check` typecheck, lint, format check, tests (run before every PR)
- `npm test` tests only

## Workflow

One build phase per pull request. Tests first for engine code.
