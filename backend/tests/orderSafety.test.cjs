const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const orderId = '11111111-1111-4111-8111-111111111111';
const roundId = '22222222-2222-4222-8222-222222222222';
const itemId = '33333333-3333-4333-8333-333333333333';

function routeFor(file, method, route, existing = {}) {
  const routes = new Map();
  let databaseCalls = 0;
  const router = {};
  for (const verb of ['get', 'post', 'put', 'patch', 'delete', 'use']) {
    router[verb] = (url, ...handlers) => {
      if (typeof url === 'string') routes.set(`${verb} ${url}`, handlers.at(-1));
    };
  }
  const supabaseAdmin = {
    from() {
      databaseCalls++;
      return {
        select() { return this; },
        eq() { return this; },
        async single() { return { data: existing }; },
        async maybeSingle() { return { data: existing, error: null }; },
      };
    },
    async rpc() { databaseCalls++; return { data: null, error: null }; },
  };
  const deps = (name) => {
    if (name === 'express') return { Router: () => router };
    if (name.endsWith('/supabase.js')) return { supabaseAdmin };
    if (name.endsWith('/auth.js')) return { requireAuth() {}, requireAdmin() {} };
    if (name.endsWith('/rateLimiter.js')) return { orderCreationLimiter() {} };
    if (name.endsWith('/audit.js')) return { recordAuditLog() {} };
    if (name.endsWith('/equipmentPayments.js')) return { SLIP_BUCKET: 'test', parseSlipImage() {}, readTransferAccount() {} };
    return require(name);
  };
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: deps, console, Buffer });
  return {
    get databaseCalls() { return databaseCalls; },
    async request(body) {
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; } };
      await routes.get(`${method} ${route}`)({ body, params: { id: orderId }, user: { id: orderId } }, res);
      return res;
    },
  };
}

test('vegetable booking rejects repeated round items before writing to the database', async () => {
  const app = routeFor('../src/routes/orders.ts', 'post', '/', {});
  const result = await app.request({
    round_id: roundId,
    items: [{ round_item_id: itemId, qty_kg: 1 }, { round_item_id: itemId, qty_kg: 1 }],
    fulfillment_method: 'pickup', contact_phone: '0812345678', accepted_substitution_terms: true,
  });
  assert.equal(result.statusCode, 400);
  assert.match(result.body.error, /ไม่ซ้ำกัน/);
  assert.equal(app.databaseCalls, 0);
});

for (const [file, route] of [
  ['../src/routes/admin/orders.ts', '/:id'],
  ['../src/routes/equipment.ts', '/admin/orders/:id'],
]) {
  test(`${file} rejects completion without payment and payment reversal after completion`, async () => {
    const unpaid = routeFor(file, 'patch', route, { status: 'ready', payment_status: 'unpaid' });
    assert.equal((await unpaid.request({ status: 'completed' })).statusCode, 400);
    assert.equal(unpaid.databaseCalls, 1);

    const completed = routeFor(file, 'patch', route, { status: 'completed', payment_status: 'paid' });
    assert.equal((await completed.request({ payment_status: 'unpaid' })).statusCode, 400);
    assert.equal(completed.databaseCalls, 1);
  });
}
