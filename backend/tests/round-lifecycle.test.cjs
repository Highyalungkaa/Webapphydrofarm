const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual route with an in-memory database, without credentials or HTTP.
function setup(initialRound = {}) {
  let round = { id: 'round-test', current_step: 1, status: 'draft', ...initialRound };
  const routes = new Map();
  const router = {};
  for (const method of ['use', 'get', 'post', 'put', 'patch', 'delete']) {
    router[method] = (url, ...handlers) => routes.set(`${method} ${url}`, handlers.at(-1));
  }
  const db = {
    from() {
      let update;
      const query = {
        select() { return query; },
        eq() { return query; },
        update(payload) { update = payload; return query; },
        async single() {
          if (update) {
            const nextRound = { ...round, ...update };
            if (nextRound.booking_closes_at && nextRound.status !== 'booking_closed'
                && new Date(nextRound.booking_closes_at) <= new Date(nextRound.booking_opens_at)) {
              return { data: null, error: { message: 'check_booking_window' } };
            }
            round = nextRound;
          }
          return { data: { ...round }, error: null };
        },
      };
      return query;
    },
  };
  const filename = path.resolve(__dirname, '../src/routes/admin/rounds.ts');
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, console,
    require(name) {
      if (name === 'express') return { Router: () => router };
      if (name.endsWith('/supabase.js')) return { getSupabaseClient: () => db };
      if (name.endsWith('/auth.js')) return {};
      if (name.endsWith('/audit.js')) return { recordAuditLog: async () => {} };
      if (name.endsWith('/plotCrops.js')||name.endsWith('/plantAllocation.js')||name.endsWith('/plotPlantingAllocations.js')) return {};
      if (name.endsWith('/plantingQuantities.js')) return {};
      return require(name);
    },
  }, { filename });
  return {
    computeCurrentStep: exports.computeCurrentStep,
    round: () => round,
    openBooking() {
      round = { ...round, status: 'booking_open', booking_opens_at: '2026-01-01T00:00:00Z', booking_closes_at: null };
    },
    async confirm(step, extra = {}) {
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
      await routes.get('patch /:id/step')({
        params: { id: round.id }, user: { id: 'admin', email: 'admin@example.com' },
        body: { step, date: '2026-10-19', ...extra },
      }, res);
      return res;
    },
  };
}

test('all eight milestones preserve dates, booking checks and harvest calculation', async () => {
  const app = setup();
  for (const step of [1, 2]) assert.equal((await app.confirm(step)).statusCode, 200);
  assert.equal(app.round().current_step, 3);
  assert.equal((await app.confirm(4)).statusCode, 400, 'cannot skip planting start');
  assert.equal((await app.confirm(3)).statusCode, 200);
  assert.equal(app.round().planting_start_date, '2026-10-19');
  assert.equal(app.round().transplant_date, undefined);
  assert.equal(app.round().expected_harvest_date, undefined);
  assert.equal(app.round().current_step, 4);
  assert.equal((await app.confirm(4, { crop_growing_days: { lettuce: 30, kale: 45 } })).statusCode, 200);
  assert.equal(app.round().transplant_date, '2026-10-19');
  assert.equal(app.round().expected_harvest_date, '2026-12-03');
  assert.equal(app.round().current_step, 5);
  assert.equal((await app.confirm(5)).statusCode, 400, 'booking must actually be open');
  app.openBooking();
  for (const step of [5, 6, 7, 8]) {
    const result = await app.confirm(step);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.current_step, Math.min(8, step + 1));
  }
  assert.equal(app.round().status, 'completed');
  assert.equal(app.round().completed_date, '2026-10-19');
  assert.equal((await app.confirm(9)).statusCode, 400);
});

test('date-based fallback recognizes the inserted milestone', () => {
  const { computeCurrentStep } = setup();
  assert.equal(computeCurrentStep({ fertilizing_date: '2026-10-19' }), 3);
  assert.equal(computeCurrentStep({ planting_start_date: '2026-10-19' }), 4);
  assert.equal(computeCurrentStep({ transplant_date: '2026-10-19' }), 5);
  assert.equal(computeCurrentStep({ current_step: 7, sold_out_date: '2026-10-19' }), 8);
});

test('confirming planting preserves plot assignments needed by loss recording', async () => {
  const app = setup({ current_step: 4, notes: JSON.stringify({ note: 'test', cropPlotIds: { lettuce: ['plot-a'] }, bookingCreated: true }) });
  assert.equal((await app.confirm(4, { crop_growing_days: { lettuce: 30 } })).statusCode, 200);
  const notes = JSON.parse(app.round().notes);
  assert.deepEqual(notes.cropPlotIds, { lettuce: ['plot-a'] });
  assert.equal(notes.bookingCreated, true);
});

test('completion succeeds when booking was closed before its scheduled opening', async () => {
  const app = setup({
    current_step: 7,
    status: 'booking_closed',
    booking_opens_at: '2027-01-01T00:00:00Z',
    booking_closes_at: '2026-10-19T00:00:00Z',
  });
  const result = await app.confirm(8);
  assert.equal(result.statusCode, 200);
  assert.equal(app.round().status, 'completed');
  assert.equal(app.round().booking_closes_at, null);
});

test('closing a scheduled booking before opening keeps the round completable', async () => {
  const app = setup({
    current_step: 7,
    status: 'booking_open',
    booking_opens_at: '2027-01-01T00:00:00Z',
    booking_closes_at: null,
  });
  assert.equal((await app.confirm(7)).statusCode, 200);
  assert.equal(app.round().booking_closes_at, null);
  assert.equal((await app.confirm(8)).statusCode, 200);
});
