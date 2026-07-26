# Local n8n harness + node screenshots

Runs a local n8n instance with **n8n-nodes-app-store-connect** loaded,
and captures a screenshot of every node's detail view and every credential
screen into [`../docs/nodes/screenshots/`](../docs/nodes/screenshots/).

## What's here

| File | Purpose |
|------|---------|
| `docker-compose.yml` | n8n service (pinned to `2.31.4`) that builds the image below |
| `Dockerfile` | `FROM n8nio/n8n` + installs the local package into `~/.n8n/custom` |
| `screenshots/screenshot-nodes.mjs` | Playwright script that drives n8n and saves the PNGs |
| `screenshots/package.json` | Playwright dependency for the script |

## How the package is loaded

n8n's in-app "Community nodes" installer pulls from npm. Since this package
isn't published yet, the Dockerfile installs the locally-built `.tgz` into n8n's
**custom-extensions** directory (`~/.n8n/custom`), which n8n scans on startup and
loads exactly like a community node. The nodes appear as **CUSTOM.appStoreConnect**,
**CUSTOM.appStoreConnectTrigger**, and **CUSTOM.verifyWebhookSignature**. Once the
package is on npm you would instead install it by name from
**Settings → Community nodes**.

Data is intentionally **ephemeral** (no persistent volume) — every `up` starts a
clean instance, so the first-run owner-setup screen appears. The screenshot
script performs owner-setup automatically via the REST API.

## Run it

From the **repo root**:

```bash
# 1. Build the package and pack it into docker/ (the Dockerfile copies the .tgz)
npm run build
npm pack --pack-destination docker

# 2. Start n8n with the package loaded
docker compose -f docker/docker-compose.yml up -d --build
#    open http://localhost:5678  (owner setup: demo@example.com / Screenshot123)

# 3. Install the screenshot tooling (once) and capture the screenshots
cd docker/screenshots
npm install
npx playwright install chromium
node screenshot-nodes.mjs        # writes ../../docs/nodes/screenshots/*.png

# 4. Tear down when done
docker compose -f docker/docker-compose.yml down
```

### Environment overrides (screenshot script)

| Var | Default | Meaning |
|-----|---------|---------|
| `N8N_URL` | `http://localhost:5678` | n8n base URL |
| `N8N_EMAIL` / `N8N_PASSWORD` | `demo@example.com` / `Screenshot123` | owner-setup / login creds |
| `SHOTS_DIR` | `../../docs/nodes/screenshots` | output directory |

The script authenticates via n8n's REST API (owner-setup on a fresh instance,
else login), then builds a throwaway workflow per node so it can open each
node's detail view deterministically rather than fighting the node-creator UI.
Credentials are captured from **Credentials → Add credential → (type)**.

## Authentication note

The `App Store Connect API` credential mints a short-lived ES256 JWT inside its
`authenticate` **function** (not the declarative form, and not
`preAuthentication`). This is deliberate: n8n only runs `preAuthentication` in
some request contexts — it is skipped for `listSearch`/`loadOptions` dropdowns
(e.g. the "Target App" picker) and for the credential test — so a token minted
there is absent in exactly those places and Apple returns 401. An `authenticate`
function runs on every authenticated request in every context, so the picker,
node execution, and the "Test" button all work.

## Notes

- Pin a different n8n version with `N8N_VERSION=<tag> docker compose ... up --build`
  (UI selectors in the screenshot script are matched to `2.31.4`).
- The n8n image is ~1.5 GB and Playwright's Chromium is ~130 MB — remove them
  (`docker rmi n8n-app-store-connect:local n8nio/n8n:2.31.4`) if you need the space.
