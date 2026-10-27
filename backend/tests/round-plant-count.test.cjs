const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const cropId = '11111111-1111-4111-8111-111111111111';
const plotId = '22222222-2222-4222-8222-222222222222';
const loadTs = (relative, dependencies) => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console, require: dependencies });
  return exports;
};

async function createRound(count, capacity = 100, options = {}) {
  const handlers = new Map();
  const router = {};
  for (const method of ['use', 'get', 'post', 'put', 'patch', 'delete']) router[method] = (url, ...callbacks) => handlers.set(`${method} ${url}`, callbacks.at(-1));
  let savedItems;
  const db = {
    from(table) {
      let inserted;
      const result = () => {
        if (table === 'crops') return { data: options.crops || [{ id: cropId, slots_per_kg: 4.5 }], error: null };
        if (table === 'plots') return { data: options.plots || [{ id: plotId, crop_ids: [cropId], slot_capacity: capacity, is_active: true }], error: null };
        if (table === 'planting_rounds' && !inserted) return {data:options.rounds||[],error:null};
        if (table === 'round_items') return { data: savedItems, error: null };
        return { data: { ...inserted, id: 'round' }, error: null };
      };
      const query = {
        select() { return query; }, in() { return query; }, eq() { return query; }, order() { return query; },
        insert(value) { inserted = value; if (table === 'round_items') savedItems = value; return query; },
        async single() { return result(); },
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
      };
      return query;
    },
  };
  const quantities = loadTs('../src/services/plantingQuantities.ts', require);
  const plotCrops = loadTs('../src/services/plotCrops.ts', require);
  loadTs('../src/routes/admin/rounds.ts', (name) => {
    if (name === 'express') return { Router: () => router };
    if (name.endsWith('/supabase.js')) return { getSupabaseClient: () => db };
    if (name.endsWith('/auth.js')) return {};
    if (name.endsWith('/audit.js')) return { recordAuditLog: async () => {} };
    if (name.endsWith('/plantingQuantities.js')) return quantities;
    if (name.endsWith('/plotCrops.js')) return plotCrops;
    if (name.endsWith('/plantAllocation.js')) return loadTs('../src/services/plantAllocation.ts',require);
    if (name.endsWith('/plotPlantingAllocations.js')) return loadTs('../src/services/plotPlantingAllocations.ts',dep=>dep.endsWith('/plantAllocation.js')?loadTs('../src/services/plantAllocation.ts',require):dep.endsWith('/plotCrops.js')?plotCrops:require(dep));
    return require(name);
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  await handlers.get('post /')({
    body: { name: 'Count-based round', items: options.items || [{ crop_id: cropId, plant_count: count, growing_days: 45, estimated_qty_kg: 999, bookable_qty_kg: 999, price_per_kg: 100, plot_ids: [plotId] }] },
    user: { id: 'admin', email: 'admin@example.com' },
  }, res);
  return { res, savedItems };
}

test('create saves the exact plant count without deriving kilograms, ignoring legacy projection inputs', async () => {
  const { res, savedItems } = await createRound(100);
  assert.equal(res.statusCode, 201);
  assert.equal(savedItems[0].plant_count, 100);
  assert.equal(savedItems[0].estimated_qty_kg, 0);
  assert.equal(savedItems[0].bookable_qty_kg, 0);
});

test('plant capacity cannot be bypassed by rounding weight down', async () => {
  const { res, savedItems } = await createRound(101);
  assert.equal(res.statusCode, 400);
  assert.equal(savedItems, undefined);
});

test('a small plant count needs no kilogram estimate to create a round', async () => {
  const { res, savedItems } = await createRound(2);
  assert.equal(res.statusCode, 201);
  assert.equal(savedItems[0].plant_count, 2);
  assert.equal(savedItems[0].estimated_qty_kg, 0);
});

test('creating a shared round persists all crop placements and sends extra oak to the second plot',async()=>{
 const other='33333333-3333-4333-8333-333333333333',second='44444444-4444-4444-8444-444444444444';
 const options={crops:[{id:cropId,slots_per_kg:5},{id:other,slots_per_kg:5}],plots:[{id:plotId,crop_ids:[cropId,other],slot_capacity:500,is_active:true},{id:second,crop_ids:[cropId],slot_capacity:420,is_active:true}],items:[{crop_id:cropId,plant_count:200,growing_days:45,price_per_kg:100,plot_ids:[plotId,second]},{crop_id:other,plant_count:400,growing_days:45,price_per_kg:100,plot_ids:[plotId]}]};
 const {res}=await createRound(200,500,options);assert.equal(res.statusCode,201);
 const allocations=JSON.parse(res.body.notes).cropPlotAllocations;
 assert.equal(allocations[cropId][plotId],100);assert.equal(allocations[cropId][second],100);assert.equal(allocations[other][plotId],400);
 const occupied={id:'old',status:'growing',current_step:2,notes:JSON.stringify({cropPlotIds:{[cropId]:[second]}}),round_items:[{crop_id:cropId,plant_count:420}]};
 const rejected=await createRound(200,500,{...options,rounds:[occupied]});assert.equal(rejected.res.statusCode,400);assert.equal(rejected.savedItems,undefined);
});
