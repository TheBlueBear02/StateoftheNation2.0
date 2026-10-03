# GovernmentBordersPage — ג"ג · גבולות גזרה לממשלה

> See [ProjectOverview.md](./ProjectOverview.md), [DesignLanguage.md](./DesignLanguage.md), [PollsPage.md](./PollsPage.md), and [ElectionsPage.md](./ElectionsPage.md).

Interactive tool for drawing a contiguous “government” band across parties ordered on a political axis, using the latest seat poll for a chosen media channel.

## Route

| Route | Component | Purpose |
|-------|-----------|---------|
| `/elections/government-borders` | `src/views/GovernmentBordersPage.tsx` | Channel + topic selectors, seat bars, range picker, share poster |

Static App Router segment: `src/app/elections/government-borders/page.tsx` (takes priority over `[partyId]`). Metadata title: **ג"ג - גבולות גזרה לממשלה**. WebPage + Breadcrumb JSON-LD. Client view wrapped in `Suspense` because it reads `useSearchParams`.

Linked from the `/elections` hero (“שרטטו את גבולות הגזרה לממשלה”) and listed in `src/app/sitemap.ts`.

## UX

1. **Topic axis** — pick one of: דת ומדינה, כלכלה, מדיני-ביטחוני, מערכת המשפט. Reorders the party columns (RTL: first in config = rightmost).
2. **Channel** — publisher logos; selecting one loads that publisher’s **latest non-scenario poll** (`selectRecentRegularPollsForPublisher(..., 1)`). Default = publisher of the newest poll overall.
3. **Bars** — one column per party with `seats > 0`: bloc-colored vertical bar, seat count, list-leader photo (`list_position = 1`), `short_name`. Parties outside the selected range are dimmed.
4. **Range picker** — black window under the bars. Drag body to move; drag edge handles to resize; snaps to whole columns. Keyboard: arrows move, Shift+arrows resize start edge / grow end. `role="slider"`.
5. **Summary** — “ממשלה: X מנדטים” + “יש רוב” when X ≥ 61, else “חסרים N”. Bottom 0–120 bar (coalition / opposition) with a 61 marker.
6. **Share** — off-screen poster via `exportNodeToPng` + `sharePngImage` (same pattern as dream-government leaders poster).
7. **URL state** — `?channel=&topic=&from=&to=` kept in sync with `router.replace` so shared links restore selection.

## Data

- Polls: `usePolls(120)` → `listBordersChannels` / `getChannelPoll` in `src/lib/governmentBorders.ts`.
- Leaders: exported `fetchPartyLeaders` from `src/lib/fetchElectionParties.ts` (candidates at `list_position = 1`). Hook: `useGovernmentBordersData`. Fallback: party logo → color initials circle.
- Topic orders: hand-curated static config `src/content/governmentBordersTopics.ts`. Matching via `normalizePartyShortName`. Parties missing from a topic list are appended (bloc order) with a dev `console.warn`.
- Majority constant: `BORDERS_MAJORITY = 61`. Default range grows from the rightmost column until seats ≥ 61.

## Files

| File | Role |
|------|------|
| `src/app/elections/government-borders/page.tsx` | Metadata + JSON-LD + Suspense |
| `src/views/GovernmentBordersPage.tsx` / `.css` | Page shell, URL sync, share button |
| `src/content/governmentBordersTopics.ts` | Topic labels + ordered short_names |
| `src/lib/governmentBorders.ts` | Channels, topic ordering, range math |
| `src/hooks/useGovernmentBordersData.ts` | Polls + leaders → ordered columns |
| `src/components/elections/borders/BordersToolbar.tsx` | Topic + channel controls |
| `src/components/elections/borders/BordersBarsChart.tsx` | Seat bars + avatars |
| `src/components/elections/borders/BordersRangePicker.tsx` | Draggable/resizable range |
| `src/components/elections/borders/BordersSummaryBar.tsx` | Totals + 0–120 bar |
| `src/components/elections/borders/ShareableBordersPoster.tsx` | Off-screen share card |

## Licensing

Wikipedia CC BY-SA 4.0 attribution footer (same poll source as `/elections/polls`). Topic axis positions are editorial estimates by מצב האומה, stated in the footer.
