const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const body = { name: 'Mixed plot', zone_name: 'A', slot_capacity: 100, is_active: true };

function setup({ oldPlot, inactive = [], plots = [], rounds = [], writeError } = {}) {
  const routes = new Map();
  const router = {};
  let saved;
  for (const method of ['use', 'get', 'post', 'put', 'patch', 'delete']) {
    router[method] = (url, ...handlers) => routes.set(`${method} ${url}`, handlers.at(-1));
  }
  const db = {
    from(table) {
      let selectedIds = [], mutation;
      const result = () => {
        if (table === 'crops') return { data: ids.filter((id) => selectedIds.includes(id)).map((id) => ({ id, is_active: !inactive.includes(id) })), error: null };
        if (table === 'app_settings') return { data: [{ key: 'farm_total_slots', value: 1000 }], error: null };
        if (table === 'planting_rounds') return { data: rounds, error: null };
        if (mutation) return { data: writeError ? null : saved, error: writeError ? (typeof writeError === 'string' ? { message: writeError } : writeError) : null };
        return { data: oldPlot ? [oldPlot] : plots, error: null };
      };
      const query = {
        select(fields) { if (table === 'planting_rounds' && /round_items\([^)]*plot_ids/.test(fields)) throw new Error('column round_items.plot_ids does not exist'); return query; }, range() { return query; }, delete() { mutation = true; saved = {deleted: true}; return query; }, eq() { return query; }, order() { return query; },
        in(_column, values) { selectedIds = values; return query; },
        insert(payload) { mutation = true; saved = { id: 'plot', ...payload }; return query; },
        update(payload) { mutation = true; saved = { ...oldPlot, ...payload }; return query; },
        async maybeSingle() { return table === 'app_settings' ? { data: { value: 1000 }, error: null } : result(); },
        async single() { return mutation ? result() : { data: oldPlot, error: null }; },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return query;
    },
  };
  const loadTs = (relative, dependencies) => {
    const exports = {};
    const source = fs.readFileSync(path.resolve(__dirname, relative), 'utf8');
    vm.runInNewContext(ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports, console, require: dependencies });
    return exports;
  };
  const helpers = loadTs('../src/services/plotCrops.ts', require);
  const timeline = loadTs('../src/services/plotRoundTimeline.ts', require);
  const allocations = loadTs('../src/services/plotPlantingAllocations.ts', name => name.endsWith('/plantAllocation.js') ? loadTs('../src/services/plantAllocation.ts',require) : name.endsWith('/plotCrops.js') ? helpers : require(name));
  loadTs('../src/routes/admin/plots.ts', (name) => {
    if (name === 'express') return { Router: () => router };
    if (name.endsWith('/supabase.js')) return { getSupabaseClient: () => db };
    if (name.endsWith('/auth.js')) return {};
    if (name.endsWith('/audit.js')) return { recordAuditLog: async () => {} };
    if (name.endsWith('/plotHistory.js')) return loadTs('../src/services/plotHistory.ts', n => n.endsWith('/plotCrops.js') ? helpers : require(n));
    if (name.endsWith('/plotCrops.js')) return helpers;
    if (name.endsWith('/plotRoundTimeline.js')) return timeline;
    if (name.endsWith('/plotPlantingAllocations.js')) return allocations;
    return require(name);
  });
  return {
    saved: () => saved,
    async request(method, extra) {
      const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; } };
      await routes.get(`${method} ${['post', 'get'].includes(method) ? '/' : '/:id'}`)({
        body: { ...body, ...extra }, query: {}, params: { id: 'plot' }, user: { id: 'admin', email: 'admin@example.com' },
      }, res);
      return res;
    },
  };
}

test('create saves every selected crop once in one plot', async () => {
  const app = setup();
  assert.equal((await app.request('post', { crop_ids: [...ids, ids[0]] })).statusCode, 201);
  assert.equal(JSON.stringify(app.saved().crop_ids), JSON.stringify(ids));
  assert.equal(app.saved().crop_id, ids[0]);
});

test('plot capacity is independent of the retired farm ceiling', async () => {
  const app = setup();
  assert.equal((await app.request('post', { slot_capacity: 5001 })).statusCode, 201);
  assert.equal(app.saved().slot_capacity, 5001);
});

test('an unapplied database migration reports the old ceiling clearly', async () => {
  const app = setup({ writeError: 'จำนวนต้นที่จัดสรรให้แปลงรวม 5001 ต้น เกินความจุฟาร์ม 5000 ต้น' });
  const result = await app.request('post', { slot_capacity: 5001 });
  assert.equal(result.statusCode, 503);
  assert.match(result.body.error, /migration 047/);
});

test('unknown or newly inactive crops are rejected', async () => {
  assert.equal((await setup().request('post', { crop_ids: [ids[0], '44444444-4444-4444-8444-444444444444'] })).statusCode, 400);
  assert.equal((await setup({ inactive: [ids[1]] }).request('post', { crop_ids: ids })).statusCode, 400);
});

test('edit and status changes preserve existing assignments, including inactive crops', async () => {
  const app = setup({ oldPlot: { id: 'plot', ...body, crop_ids: ids, crop_id: ids[0] }, inactive: [ids[1]] });
  assert.equal((await app.request('put', { is_active: false })).statusCode, 200);
  assert.equal(JSON.stringify(app.saved().crop_ids), JSON.stringify(ids));
  assert.equal((await app.request('put', { crop_ids: [] })).statusCode, 200);
  assert.equal(app.saved().crop_ids.length, 0);
  assert.equal(app.saved().crop_id, null);
});

test('legacy single-crop data remains editable', async () => {
  const app = setup({ oldPlot: { id: 'plot', ...body, crop_id: ids[0] } });
  assert.equal((await app.request('put', {})).statusCode, 200);
  assert.equal(JSON.stringify(app.saved().crop_ids), JSON.stringify([ids[0]]));
});

test('plot listing includes milestone dates and crop-specific harvests for each occupying round', async () => {
  const item = (cropId, name) => ({ crop_id: cropId, estimated_qty_kg: 10, bookable_qty_kg: 10, crops: { name, slots_per_kg: 4, growing_days: 45 } });
  const app = setup({
    plots: [{ id: 'plot', ...body, crop_ids: ids }],
    rounds: [{
      id: 'round-1', name: 'October round', status: 'growing', current_step: 5,
      seed_date: '2026-10-01', fertilizing_date: '2026-10-07', planting_start_date: '2026-10-12', transplant_date: '2026-10-19',
      notes: JSON.stringify({ cropPlotIds: { [ids[0]]: ['plot'], [ids[1]]: ['plot'] }, cropGrowingDays: { [ids[0]]: 30, [ids[1]]: 45 } }),
      round_items: [{ ...item(ids[0], 'Lettuce'), plant_count: 41 }, { ...item(ids[1], 'Kale'), plant_count: 39 }],
    }, {
      id: 'round-2', name: 'New round', status: 'draft', current_step: 2, seed_date: '2026-10-19', planted_at: '2026-10-19',
      round_items: [{ ...item(ids[2], 'Rocket'), estimated_qty_kg: 5, bookable_qty_kg: 5 }],
    }],
  });
  const result = await app.request('get');
  assert.equal(result.statusCode, 200);
  const entries = result.body.plots[0].occupying_rounds;
  assert.equal(entries.length, 3);
  assert.equal(entries[0].planting_start_date, '2026-10-12');
  assert.equal(entries[0].used_slots, 41);
  assert.equal(entries[1].used_slots, 39);
  assert.equal(entries[0].calculated_harvest_date, '2026-11-18');
  assert.equal(entries[1].calculated_harvest_date, '2026-12-03');
  assert.equal(entries[2].id, 'round-2');
  assert.equal(entries[2].calculated_harvest_date, null);
});

for (const [name,extra] of [
  ['loss history',{oldPlot:{id:'plot',...body,plant_losses:[{count:1}]}}],
  ['completed round',{oldPlot:{id:'plot',...body},rounds:[{status:'completed',notes:'{}',round_items:[{crop_id:ids[0],plot_ids:['plot']}]}]}],
  ['JSON allocation',{oldPlot:{id:'plot',...body},rounds:[{status:'completed',notes:JSON.stringify({cropPlotAllocations:{[ids[0]]:{plot:100}}}),round_items:[{crop_id:ids[0]}]}]}],
]) test('deleting a plot preserves '+name,async()=>{
  const app=setup(extra);const res=await app.request('delete');assert.equal(res.statusCode,200);assert.equal(app.saved().deleted,true);
});
test('an unused plot can be deleted, while a missing plot is reported honestly',async()=>{
  const app=setup({oldPlot:{id:'plot',...body}});assert.equal((await app.request('delete')).statusCode,200);assert.equal(app.saved().deleted,true);
  assert.equal((await setup().request('delete')).statusCode,404);
});
test('deleting a plot in an active round requires ending that round',async()=>{
  const app=setup({oldPlot:{id:'plot',...body},rounds:[{status:'growing',notes:'{}',round_items:[{crop_id:ids[0],plot_ids:['plot']}]}]});
  const res=await app.request('delete');assert.equal(res.statusCode,409);assert.match(res.body.error,/สิ้นสุดรอบ/);assert.equal(app.saved(),undefined);
});
test('foreign-key rejection gives a user-facing next step without SQL details',async()=>{
  const app=setup({oldPlot:{id:'plot',...body},writeError:{code:'23503',message:'plant_losses_plot_id_fkey'}});const res=await app.request('delete');
  assert.equal(res.statusCode,503);assert.match(res.body.error,/migration 049/);assert.doesNotMatch(res.body.error,/fkey|constraint/);
});
test('retiring a plot retains its id and history and can be reversed',async()=>{
  const app=setup({oldPlot:{id:'plot',...body,plant_losses:[{count:1}]}});
  assert.equal((await app.request('put',{is_active:false})).statusCode,200);assert.equal(app.saved().id,'plot');assert.equal(app.saved().plant_losses[0].count,1);assert.equal(app.saved().is_active,false);
  assert.equal((await app.request('put',{is_active:true})).statusCode,200);assert.equal(app.saved().is_active,true);
});
