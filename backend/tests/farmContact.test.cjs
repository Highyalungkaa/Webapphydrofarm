const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadRoute(file, rows) {
  const handlers = new Map();
  const router = { get(url, handler) { handlers.set(`GET ${url}`, handler); }, put(url, handler) { handlers.set(`PUT ${url}`, handler); }, use() {} };
  const saved = [];
  const db = {
    from() {
      return {
        select() { return this; },
        in() { return Promise.resolve({ data: rows, error: null }); },
        order() { return Promise.resolve({ data: rows, error: null }); },
        upsert(value) { saved.push(value); return Promise.resolve({ error: null }); },
      };
    },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require(name) {
    if (name === 'express') return { Router: () => router };
    if (name.endsWith('/supabase.js')) return { supabaseAdmin: db };
    if (name.endsWith('/auth.js')) return { requireAuth() {}, requireAdmin() {} };
    if (name.endsWith('/audit.js')) return { async recordAuditLog() {} };
    return require(name);
  }, console });
  return {
    saved,
    async request(method, route, body) {
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; } };
      await handlers.get(`${method} ${route}`)({ body, user: { id: 'test', email: 'test@example.com' } }, res);
      return res;
    },
  };
}

test('public contact response includes only the configured phone and cancellation window', async () => {
  const route = loadRoute('../src/routes/settings.ts', [
    { key: 'farm_contact_phone', value: '081 234 5678' },
    { key: 'cancellation_deadline_hours_before_harvest', value: 24 },
    { key: 'equipment_transfer_account', value: { account_number: 'private' } },
  ]);
  const response = await route.request('GET', '/contact');
  assert.deepEqual(JSON.parse(JSON.stringify(response.body)), { phone: '081 234 5678', cancellation_deadline_hours: 24 });
});

test('admin settings reject invalid farm phone before any write', async () => {
  const route = loadRoute('../src/routes/admin/settings.ts', []);
  const response = await route.request('PUT', '/', { farm_contact_phone: 'javascript:123456789' });
  assert.equal(response.statusCode, 400);
  assert.equal(route.saved.length, 0);
});
