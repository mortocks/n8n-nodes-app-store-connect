# Example workflows

Importable examples for `n8n-nodes-apple-appstore`. In n8n: **Workflows → ⋯ →
Import from File** (or paste the JSON into a new canvas), then attach your
credentials and fill the placeholders.

| File | What it does | You must set |
|------|--------------|--------------|
| [`react-to-testflight-crash-feedback.json`](react-to-testflight-crash-feedback.json) | Starts a workflow whenever App Store Connect delivers a **TestFlight crash-feedback** event (via the **App Store Connect Trigger**), then hands off to a node of your choice. | An **App Store Connect Webhook** credential (the shared signing secret); register the webhook at this node's URL (or turn on *Manage Webhook*). |
| [`find-one-star-app-store-reviews.json`](find-one-star-app-store-reviews.json) | Fetches your app's **1-star customer reviews** (Customer Review → Get Many, `filterRating = 1`, Simplify on). Wire the output into Slack/email/a ticket. | An **App Store Connect API** credential, and your app id in the **Target App** field (replace `YOUR_APP_ID`). |

Both are starting points — swap the trailing node for whatever you want to do
with the data (Slack, email, a database, an issue tracker, an AI Agent, …).
