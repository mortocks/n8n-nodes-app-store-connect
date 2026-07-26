// Screenshots every node's detail view (parameters) and every credential
// screen from a running n8n instance, into docs/nodes/screenshots/.
//
// Prereqs: the docker-compose n8n instance is up (see docker/README.md) and
// Playwright + chromium are installed (`npm install` in this folder).
//
// Run:  N8N_URL=http://localhost:5678 node screenshot-nodes.mjs
//
// It authenticates via n8n's REST API (owner-setup on a fresh instance, else
// login), then builds a throwaway workflow per node so it can open each node's
// detail view deterministically rather than driving the node-creator UI.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const BASE = process.env.N8N_URL || 'http://localhost:5678';
const CREDS = {
  email: process.env.N8N_EMAIL || 'demo@example.com',
  firstName: 'Demo',
  lastName: 'User',
  password: process.env.N8N_PASSWORD || 'Screenshot123',
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SHOTS_DIR || path.resolve(HERE, '../../docs/nodes/screenshots');
const CRED_OUT = path.join(OUT, 'credentials');
const DEBUG_OUT = path.join(HERE, 'debug');
for (const d of [OUT, CRED_OUT, DEBUG_OUT]) fs.mkdirSync(d, { recursive: true });

// The three nodes (types as registered by the custom-extensions loader).
const NODES = [
  { slug: 'app-store-connect', type: 'CUSTOM.appStoreConnect', name: 'App Store Connect', isTrigger: false },
  { slug: 'app-store-connect-trigger', type: 'CUSTOM.appStoreConnectTrigger', name: 'App Store Connect Trigger', isTrigger: true },
  { slug: 'verify-webhook-signature', type: 'CUSTOM.verifyWebhookSignature', name: 'Verify Webhook Signature', isTrigger: false },
];
const CREDENTIALS = [
  { slug: 'app-store-connect-api', name: 'App Store Connect API' },
  { slug: 'app-store-connect-webhook', name: 'App Store Connect Webhook' },
];

const log = (...a) => console.log('•', ...a);
const first = async (page, selectors, { timeout = 4000 } = {}) => {
  for (const sel of selectors) {
    const loc = typeof sel === 'string' ? page.locator(sel) : sel;
    try {
      await loc.first().waitFor({ state: 'visible', timeout });
      return loc.first();
    } catch { /* try next */ }
  }
  return null;
};
async function dumpDebug(page, label) {
  try {
    await page.screenshot({ path: path.join(DEBUG_OUT, `${label}.png`), fullPage: true });
    const ids = await page.$$eval('[data-test-id]', els =>
      [...new Set(els.map(e => e.getAttribute('data-test-id')))].sort());
    fs.writeFileSync(path.join(DEBUG_OUT, `${label}.testids.txt`), ids.join('\n'));
    log(`  debug saved: ${label} (${ids.length} test-ids)`);
  } catch (e) { log('  debug dump failed:', e.message); }
}

async function authenticate(ctx) {
  const body = { email: CREDS.email, firstName: CREDS.firstName, lastName: CREDS.lastName, password: CREDS.password };
  // Try login first; if there's no owner yet, run owner-setup.
  let r = await ctx.request.post(`${BASE}/rest/login`, { data: { emailOrLdapLoginId: CREDS.email, password: CREDS.password } });
  if (r.ok()) { log('authenticated via /rest/login'); return; }
  r = await ctx.request.post(`${BASE}/rest/owner/setup`, { data: body });
  if (r.ok()) { log('authenticated via /rest/owner/setup'); return; }
  // Older field name fallback for login.
  r = await ctx.request.post(`${BASE}/rest/login`, { data: { email: CREDS.email, password: CREDS.password } });
  if (r.ok()) { log('authenticated via /rest/login (legacy field)'); return; }
  throw new Error(`could not authenticate (login + setup both failed: ${r.status()})`);
}

async function createWorkflow(ctx, node) {
  const nodes = [];
  if (!node.isTrigger) {
    nodes.push({ parameters: {}, id: '11111111-1111-1111-1111-111111111111', name: "When clicking 'Execute workflow'", type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [260, 300] });
  }
  nodes.push({ parameters: {}, id: '22222222-2222-2222-2222-222222222222', name: node.name, type: node.type, typeVersion: 1, position: [560, 300] });
  const payload = { name: `shot-${node.slug}`, nodes, connections: {}, settings: { executionOrder: 'v1' } };
  const r = await ctx.request.post(`${BASE}/rest/workflows`, { data: payload });
  if (!r.ok()) throw new Error(`workflow create failed (${r.status()}): ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return (j.data || j).id;
}

async function shootNode(ctx, page, node) {
  log(`node: ${node.name}`);
  const id = await createWorkflow(ctx, node);
  await page.goto(`${BASE}/workflow/${id}`, { waitUntil: 'networkidle' });
  // Dismiss any first-load overlays.
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(800);
  // Open the node's detail view by double-clicking its canvas tile.
  const tile = await first(page, [
    `[data-test-id="canvas-node"]:has-text("${node.name}")`,
    `[data-canvas-name="${node.name}"]`,
    page.getByText(node.name, { exact: true }),
  ], { timeout: 8000 });
  if (!tile) { await dumpDebug(page, `node-${node.slug}-no-tile`); throw new Error('canvas node tile not found'); }
  await tile.dblclick();
  const ndv = await first(page, ['[data-test-id="ndv"]', '[data-test-id="ndv-parameters"]', '.ndv-wrapper'], { timeout: 10000 });
  if (!ndv) { await dumpDebug(page, `node-${node.slug}-no-ndv`); throw new Error('NDV did not open'); }
  await page.waitForTimeout(1200); // let params render
  await ndv.screenshot({ path: path.join(OUT, `${node.slug}.png`) });
  log(`  saved ${node.slug}.png`);
  await page.keyboard.press('Escape').catch(() => {});
}

async function shootCredential(page, cred) {
  log(`credential: ${cred.name}`);
  await page.goto(`${BASE}/home/credentials`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const add = await first(page, ['[data-test-id="add-resource-credential"]'], { timeout: 8000 });
  if (!add) { await dumpDebug(page, `cred-${cred.slug}-no-add`); throw new Error('add-credential button not found'); }
  await add.click();
  await page.waitForTimeout(600);
  // Open the type combobox, filter by name, pick the matching option.
  const select = await first(page, ['[data-test-id="new-credential-type-select"]'], { timeout: 6000 });
  if (!select) { await dumpDebug(page, `cred-${cred.slug}-no-select`); throw new Error('credential type select not found'); }
  await select.click();
  await page.keyboard.type(cred.name, { delay: 25 });
  await page.waitForTimeout(500);
  const opt = page.locator('[role="option"]', { hasText: cred.name }).first();
  await opt.click({ timeout: 5000 });
  await page.waitForTimeout(200);
  const cont = page.locator('[data-test-id="new-credential-type-button"]');
  await cont.click({ timeout: 6000 }); // enabled once a type is chosen
  const dialog = await first(page, ['[data-test-id="credential-edit-dialog"]', '[data-test-id="editCredential-modal"]'], { timeout: 8000 });
  if (!dialog) { await dumpDebug(page, `cred-${cred.slug}-no-dialog`); throw new Error('credential dialog not found'); }
  await page.waitForTimeout(1000); // let fields render
  await dialog.screenshot({ path: path.join(CRED_OUT, `${cred.slug}.png`) });
  log(`  saved credentials/${cred.slug}.png`);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1680, height: 1020 }, deviceScaleFactor: 2 });
  await authenticate(ctx);
  const page = await ctx.newPage();
  const results = [];
  for (const node of NODES) {
    try { await shootNode(ctx, page, node); results.push([node.slug, 'ok']); }
    catch (e) { log(`  FAILED ${node.slug}: ${e.message}`); results.push([node.slug, 'FAIL: ' + e.message]); }
  }
  for (const cred of CREDENTIALS) {
    try { await shootCredential(page, cred); results.push([cred.slug + ' (cred)', 'ok']); }
    catch (e) { log(`  FAILED ${cred.slug}: ${e.message}`); results.push([cred.slug + ' (cred)', 'FAIL: ' + e.message]); }
  }
  await browser.close();
  console.log('\n=== summary ===');
  for (const [k, v] of results) console.log(`${v.startsWith('ok') ? '✓' : '✗'} ${k}: ${v}`);
  if (results.some(([, v]) => !v.startsWith('ok'))) process.exit(1);
}
main().catch(e => { console.error('fatal:', e); process.exit(1); });
