# Car Payments

Auto loan calculator with every state tax and government fee itemized for the buyer's state.

## Develop

Requires Node 22 or later.

```sh
npm install
npm run dev
```

## Checks

```sh
npm run check   # typecheck, lint, format check, tests
npm run build   # static build into dist/
```

## State data

One JSON file per state in `data/states/`. Every field is sourced from a state revenue
department, DMV, statute, or regulator page. See `CLAUDE.md` for the rules.

## Disclaimer

Estimates only, not an offer of credit. Local taxes and fees vary; confirm with the dealer and
your state DMV.
