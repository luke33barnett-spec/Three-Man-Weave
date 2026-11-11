# Update your existing Three Man Weave site

The Tonight update ZIP contains only changed files. It does not replace your published market snapshot, historical research or quote archive.

1. Extract the ZIP. Open your existing Three Man Weave repository on GitHub.
2. From the main Code page, choose Add file → Upload files. Drag the extracted api, public, scripts and tests folders together with TONIGHT-UPDATE.md. Keep their folder paths. Verify the upload list shows api/quotes.js and public/tonight.mjs, then commit to main.
3. In GitHub, open the existing .github/workflows/refresh.yml and edit it. Find the line that starts with `git add public/data/board.json` and replace it with:

   ```sh
   git add public/data/board.json public/data/picks.json state/quotes.json
   ```

   Keep the line's existing indentation, then commit. The workflow file is also included in this update.
4. Wait for Vercel to show Ready. Run Collect NBA props once on main to create and publish the paper record. No new Vercel variables or API keys are needed.
5. Open the site. Tonight is the first screen. Refresh prices rechecks a limited group of points contracts directly on Kalshi without redeploying. All Props and Research retain the advanced features.

Top Singles screens for sample size, bid–ask spread, displayed size, and estimated return after an assumed cost. A no-pick slate is allowed. Suggested Parlays proposes two or three lower points thresholds from different games. Its price ceiling is a model estimate with a buffer, not a live Kalshi combo quote. The model has not established a betting edge. The prospective paper ledger locks one decision per game before tipoff and records settlement when available.
