# BTL poverty report — LLM extraction brief

You are reading the National Insurance Institute (ביטוח לאומי) annual poverty / inequality report.

Rules:
- Extract the disposable-income Gini coefficient (מקדם ג׳יני להכנסה פנויה, after transfers and taxes).
- Do **not** return the market-income / before-transfers Gini unless that is the only figure present — prefer disposable.
- `period` is the survey/reference year as `YYYY`.
- `raw_value` must appear verbatim inside `quote`.
- If multiple years appear, return each year you can support with a quote.
