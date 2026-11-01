# Roadmap: Astra Deck

Only incomplete, directly actionable work is kept here. Blocked work stays in `Roadmap_Blocked.md`; completed work belongs in `CHANGELOG.md`.

## Requested

## Research-Driven Additions

### Now (P1)

### Next (P2)

- [ ] P2 Earn back the startup debt. `scripts/startup-performance-baseline.json` carries 15 ms of `acceptedRegression` on first feature paint, because the core loader and feature module stages grew from 53 and 6 ms to about 78 and 15 ms as modules went from 9 to 32. Try not loading modules for features a default profile leaves off, then lower the debt to zero and delete it.
- [ ] P2 Fit Theater Split's owner actions on one row. Like, Download, Add to Watch Feed and the two tool buttons need about 480 px and the column opens at 392 to 464 px, so they wrap. Showing Add to Watch Feed as its icon at that width would do it, and the zero-ads smoke's owner card and metadata limits can go back to 110 and 235 px.
