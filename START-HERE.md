# Three Man Weave

No packages to install, no API key for the public data requests, no trading account, and no paid database. Node.js 22 or later.

## Start with the demo

1. Extract the ZIP and open the folder containing `package.json`.
2. Open a terminal in that folder and run `npm start`.
3. Open http://127.0.0.1:3010. The Market Board ships with fictional quotes. Research is a separate real-data report.

## Use it privately with real data

- Keep `npm start` running in the first terminal. In a second terminal opened to the same folder, run `npm run watch` for pregame snapshots every five minutes. Reload the browser once after it switches from demo to live; the live page then checks for a new snapshot once a minute. Ctrl+C stops the collector. Run `npm run refresh` instead for a one-time snapshot.
- The collector fetches recent completed box scores and scheduled game times. ESPN schedule and summary are public-facing, undocumented endpoints and may change. Kalshi market data access is documented but rate-limited. No trading credentials are used.
- `npm run backtest` replays the most recent 26 days of settled points contracts using Kalshi's recent market and event candlestick endpoints. `BACKTEST_DAYS` accepts 1–30; older seasons require adapting it to the separate historical archive. The report shipped with the demo is a real exploratory study.
- `npm test` checks data matching, sim inputs, quote costs and movement safeguards. `npm run demo` restores the sample board without clearing local history.

## Deploy when ready

Create a separate GitHub repository and preserve the whole extracted folder structure. GitHub must see **`.github/workflows/refresh.yml` at the repository root**. If browser upload leaves out `.github`, use the repository's main **Code → Add file → Create new file** page, enter that exact path, and paste the workflow from the ZIP. Do not put it inside an extra `workflows` folder.

Import the repo into Vercel as a separate project. The included config serves `public` and runs `npm run check`. It works with the sample board immediately. Before publishing live data, check the providers' terms for your intended use. Add repository Actions variable `ENABLE_LIVE=true` to enable collection, and run **Actions → Collect NBA props → Run workflow**. Optionally add a Vercel main-branch Deploy Hook as GitHub secret `VERCEL_DEPLOY_HOOK` so bot snapshots trigger redeployment.

## What the numbers mean

- **Price Check** compares standard thresholds on the same player, game, and stat. A lower YES threshold or higher NO threshold covers more outcomes under normal settlement. If that contract also costs less, it dominates the more expensive quote without any forecast. The scanner requires displayed size and more than 2¢ of quoted savings, and pauses on snapshots older than six minutes. It also checks two-leg price inconsistencies separately with a 6¢ combined cost allowance. Neither quotes nor same-minute historical candles establish actual fills. To reproduce the historical Price Audit, run `node scripts/price-audit.mjs` after the backtest has collected candles.

- Kalshi is the only market feed. Volume counts contracts traded; it does not show sportsbook ticket share or dollars on one side.
- The simulation samples a player's recent stat lines as a unit. It supports points, assists, rebounds, threes, steals, blocks, PRA, double-doubles and triple-doubles. Double- and triple-doubles count any two or three of points, rebounds, assists, steals and blocks reaching ten. Game points leader is quote-only because ties pay fractional amounts and pricing requires a joint game model. The board needs an exact listed contract. Protected contracts and unmatched games are excluded.
- A points escalator is a scalar contract. We verify the structured payout formula and average the dollar payout over simulated scores. The estimate assumes the player appears; it is not backtested here. The lowered-line combo calculator accepts an actual ask entered by you and up to three binary YES legs from separate games. It assumes independence, does not fetch bundle prices, and does not place orders.
- Rotation shift = average minutes over the last three played games minus average minutes in the prior eight. For points only, shot opportunity = change in (FGA + 0.44 × FTA) per minute, scaled to recent minutes. This is a shot-rate proxy, not official NBA usage percentage. The Research tab tests each as a separate added predictor in chronological splits against Kalshi's midpoint. These later dates overlap an already inspected window.
- A move is confirmed at 4¢ or more, with at least 50 contracts traded and ≤10¢ spread at both observations. The UI labels historical movement separately from the model probability gap. A model gap is model win probability minus current ask minus a flat 2¢ cost allowance per $1 contract. The allowance is a stress assumption, not the exchange's fee schedule. Live quotes older than 45 minutes are flagged.
- The research uses the scheduled tipoff (not a Kalshi expiration field), T−90 and T−15 quote closes, pregame historical stats, and binary settlements only. The rule adds half the confirmed move to the later midpoint. A hypothetical fill requires at least another 2¢ of gap after the cost allowance. Compare Brier scores on the same contracts and day-block intervals to avoid treating many players on one slate as independent. Economic returns assume quote-close fills and exclude nonbinary settlements; slippage and fill risk can erase them.
- The historical points results do not validate other prop types or live model-agreement picks. Freeze the rule now, collect prospective observations, and evaluate before tuning. Avoid selecting a winner after searching dozens of cutoffs without a fresh holdout.

Sources: [Kalshi public data](https://docs.kalshi.com/getting_started/quick_start_market_data), [event candles](https://docs.kalshi.com/api-reference/events/get-event-candlesticks), [older archive](https://docs.kalshi.com/getting_started/historical_data), [fee schedule](https://kalshi.com/docs/kalshi-fee-schedule.pdf).
