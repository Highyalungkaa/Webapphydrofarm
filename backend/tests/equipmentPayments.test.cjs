const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const orderId = '33333333-3333-4333-8333-333333333333';
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]).toString('base64');

function loadSource(relative, dependencies = require) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console, Buffer, require: dependencies });
  return exports;
}
const helpers = loadSource('../src/services/equipmentPayments.ts');

function setup({ uploadError = false, rpcError = false } = {}) {
  const routes = new Map();
  const calls = { uploads: [], signs: [], rpc: [], settings: [] };
  const router = {};
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'use']) router[method] = (url, ...handlers) => routes.set(`${method} ${url}`, handlers);
  const auth = () => {}, admin = () => {};
  const supabase = {
    async rpc(name, params) { calls.rpc.push({ name, params }); return { data: rpcError ? null : orderId, error: rpcError ? { message: 'Stock unavailable' } : null }; },
    from(table) {
      const filters = {};
      const query = {
        async upsert(value) { calls.settings.push(value); return { error: null }; },
        select() { return query; }, eq(key, value) { filters[key] = value; return query; },
        async maybeSingle() {
          if (table === 'equipment_orders') return { data: filters.id === orderId && (!filters.customer_id || filters.customer_id === owner) ? { id: orderId, payment_slip_path: owner + '/slip.png' } : null, error: null };
          return { data: null, error: null };
        },
      };
      return query;
    },
    storage: { from(bucket) { return {
      async upload(filePath, buffer, options) { calls.uploads.push({ bucket, filePath, size: buffer.length, options }); return { error: uploadError ? { message: 'Storage unavailable' } : null }; },
      async createSignedUrl(filePath, expires) { calls.signs.push({ bucket, filePath, expires }); return { data: { signedUrl: 'https://storage.example.test/signed-slip' }, error: null }; },
      getPublicUrl(filePath) { return { data: { publicUrl: 'https://storage.example.test/merchant-qr/' + filePath } }; },
    }; } },
  };
  loadSource('../src/routes/equipment.ts', (name) => {
    if (name === 'express') return { Router: () => router };
    if (name.endsWith('/supabase.js')) return { supabaseAdmin: supabase };
    if (name.endsWith('/auth.js')) return { requireAuth: auth, requireAdmin: admin };
    if (name.endsWith('/equipmentPayments.js')) return helpers;
    return require(name);
  });
  return {
    calls, routes, auth, admin,
    async request(method, route, body = {}, userId = owner) {
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; } };
      await routes.get(`${method} ${route}`).at(-1)({ body, user: { id: userId }, params: { id: orderId }, query: {} }, res);
      return res;
    },
  };
}
const order = {
  items: [{ product_id: orderId, quantity: 1 }], shipping_address: '123 Bangkok', contact_phone: '0812345678',
};

test('transfer requires a receipt owned by the authenticated customer', async () => {
  const app = setup();
  assert.equal((await app.request('post', '/orders', { ...order, payment_method: 'transfer' })).statusCode, 400);
  assert.equal((await app.request('post', '/orders', { ...order, payment_method: 'transfer', payment_slip_path: other + '/slip.png' })).statusCode, 400);
  assert.equal(app.calls.rpc.length, 0);
});

test('transfer binds the receipt in the order RPC; cash on delivery still needs no receipt', async () => {
  const app = setup();
  assert.equal((await app.request('post', '/orders', { ...order, payment_method: 'transfer', payment_slip_path: owner + '/slip.png' })).statusCode, 201);
  assert.equal(app.calls.rpc[0].params.p_payment_slip_path, owner + '/slip.png');
  assert.equal(app.calls.rpc[0].params.p_payment_method, 'transfer');
  assert.equal(app.calls.rpc[0].params.payment_status, undefined);
  assert.equal((await app.request('post', '/orders', { ...order, payment_method: 'cash_on_delivery' })).statusCode, 201);
  assert.equal(app.calls.rpc[1].params.p_payment_slip_path, null);
});

test('upload uses the private bucket and a path scoped to the authenticated customer', async () => {
  const app = setup();
  assert.equal((await app.request('post', '/orders/payment-slip', { mime_type: 'image/png', data: png })).statusCode, 201);
  assert.equal(app.calls.uploads[0].bucket, 'equipment-payment-slips');
  assert.ok(app.calls.uploads[0].filePath.startsWith(owner + '/'));
  assert.equal(app.calls.uploads[0].options.upsert, false);
  assert.equal(app.routes.get('post /orders/payment-slip')[0], app.auth);
});

test('invalid or oversized image files are rejected', () => {
  assert.throws(() => helpers.parseSlipImage('image/png', Buffer.from('<html>invalid</html>').toString('base64')));
  assert.throws(() => helpers.parseSlipImage('image/png', Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')));
  assert.throws(() => helpers.parseSlipImage('text/html', png));
});

test('another customer cannot get a receipt link; the owner and admin can', async () => {
  const app = setup();
  assert.equal((await app.request('get', '/orders/mine/:id/payment-slip', {}, other)).statusCode, 404);
  assert.equal(app.calls.signs.length, 0);
  assert.equal((await app.request('get', '/orders/mine/:id/payment-slip')).statusCode, 200);
  assert.equal(app.calls.signs[0].expires, 3600);
  assert.equal((await app.request('get', '/admin/orders/:id/payment-slip', {}, other)).statusCode, 200);
  assert.equal(app.routes.get('use /admin')[0], app.auth);
  assert.equal(app.routes.get('use /admin')[1], app.admin);
});

test('failed uploads or order transactions do not report successful orders', async () => {
  const app = setup({ uploadError: true });
  assert.equal((await app.request('post', '/orders/payment-slip', { mime_type: 'image/png', data: png })).statusCode, 400);
  assert.equal(app.calls.rpc.length, 0);
  assert.equal((await setup({ rpcError: true }).request('post', '/orders', { ...order, payment_method: 'cash_on_delivery' })).statusCode, 400);
});

test('transfer becomes available with a QR code or account/PromptPay number', () => {
  assert.equal(helpers.readTransferAccount(null).transfer_enabled, false);
  assert.equal(helpers.readTransferAccount({ bank_name: 'Bank', account_name: 'Farm' }).transfer_enabled, false);
  assert.equal(helpers.readTransferAccount({ account_number: '0812345678' }).transfer_enabled, true);
  assert.equal(helpers.readTransferAccount({ qr_image_url: 'https://example.test/merchant-qr.png' }).transfer_enabled, true);
  assert.equal(helpers.readTransferAccount({ bank_name: 'Bank', account_name: 'Farm', account_number: '123' }).transfer_enabled, true);
});

test('merchant QR upload is under admin protection and uses a separate bucket from receipts', async () => {
  const app = setup();
  const result = await app.request('post', '/admin/settings/payment/qr', { mime_type: 'image/png', data: png });
  assert.equal(result.statusCode, 201);
  assert.equal(app.calls.uploads[0].bucket, 'equipment-payment-qr');
  assert.ok(result.body.image_url.startsWith('https://storage.example.test/merchant-qr/'));
  assert.equal(app.routes.get('use /admin')[1], app.admin);
});

test('admin can configure QR-only or PromptPay-only and clear both to disable transfer', async () => {
  const app = setup();
  const blank = { bank_name: '', account_name: '', account_number: '', qr_image_url: '' };
  assert.equal((await app.request('put', '/admin/settings/payment', { ...blank, account_number: '0812345678' })).body.transfer_enabled, true);
  assert.equal((await app.request('put', '/admin/settings/payment', { ...blank, qr_image_url: 'https://example.test/qr.png' })).body.transfer_enabled, true);
  assert.equal((await app.request('put', '/admin/settings/payment', blank)).body.transfer_enabled, false);
  assert.equal(app.calls.settings.length, 3);
});
