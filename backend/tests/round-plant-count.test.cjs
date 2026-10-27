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
  const rpcCalls=[];
  const db = {
    async rpc(name,payload){
      rpcCalls.push({name,payload});
      if(name==='find_planting_round_request')return {data:options.retry||null,error:null};
      if(name==='read_planting_allocation_state')return {data:{token:'snapshot',crops:(options.crops||[{id:cropId,slots_per_kg:4.5}]).map(c=>({is_active:true,...c})),plots:options.plots||[{id:plotId,crop_ids:[cropId],slot_capacity:capacity,is_active:true}],rounds:options.rounds||[]},error:options.readError||null};
      assert.equal(name,'save_planting_round');
      savedItems=payload.p_items;
      return {data:{...payload.p_round,id:'round',round_items:savedItems},error:options.saveError||null};
    },
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
    if(name.endsWith('/roundOrders.js'))return require('./load-service.cjs')('roundOrders');if (name === 'express') return { Router: () => router };
    if (name.endsWith('/supabase.js')) return { getSupabaseClient: () => db, supabaseAdmin:db };
    if (name.endsWith('/auth.js')) return {};
    if (name.endsWith('/audit.js')) return { recordAuditLog: async () => {} };
    if (name.endsWith('/plantingQuantities.js')) return quantities;
    if (name.endsWith('/plotCrops.js')) return plotCrops;
    if (name.endsWith('/plantAllocation.js')) return loadTs('../src/services/plantAllocation.ts',require);
    if (name.endsWith('/plotPlantingAllocations.js')) return loadTs('../src/services/plotPlantingAllocations.ts',dep=>dep.endsWith('/plantAllocation.js')?loadTs('../src/services/plantAllocation.ts',require):dep.endsWith('/plotCrops.js')?plotCrops:require(dep));
    return require(name);
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  await handlers.get(options.editId?'put /:id':'post /')({
    params:{id:options.editId},
    body: options.body||{ name: 'Count-based round', items: options.items || [{ crop_id: cropId, plant_count: count, growing_days: 45, estimated_qty_kg: 999, bookable_qty_kg: 999, price_per_kg: 100, plot_ids: [plotId] }] },
    user: { id: 'admin', email: 'admin@example.com' },
  }, res);
  return { res, savedItems,rpcCalls };
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

test('a stale allocation snapshot returns conflict, and failed reads never invoke save',async()=>{
 const conflict=await createRound(50,100,{saveError:{code:'40001',message:'พื้นที่เปลี่ยนแล้ว'}});
 assert.equal(conflict.res.statusCode,409);
 const failure=await createRound(50,100,{readError:{message:'unavailable'}});
 assert.equal(failure.res.statusCode,500);assert.equal(failure.rpcCalls.some(c=>c.name==='save_planting_round'),false);
});

test('successful request retry is returned before planning against an already full plot',async()=>{
 const request='55555555-5555-4555-8555-555555555555';
 const result=await createRound(100,100,{body:{name:'Retry',request_id:request},retry:{id:'original'},rounds:[{id:'full',status:'growing',current_step:2,round_items:[{crop_id:cropId,plant_count:100}]}]});
 assert.equal(result.res.statusCode,201);assert.equal(result.res.body.id,'original');assert.equal(result.rpcCalls.length,1);
});

test('editing a round checks its final item set against other rounds and keeps old crop ids',async()=>{
 const id='55555555-5555-4555-8555-555555555555',itemId='66666666-6666-4666-8666-666666666666';
 const round={id,name:'Existing',status:'growing',current_step:3,notes:JSON.stringify({note:'keep',cropPlotIds:{[cropId]:[plotId]},cropGrowingDays:{[cropId]:30}}),round_items:[{id:itemId,crop_id:cropId,plant_count:50,price_per_kg:100}]};
 const other={id:'other',status:'growing',current_step:2,notes:JSON.stringify({cropPlotIds:{[cropId]:[plotId]}}),round_items:[{crop_id:cropId,plant_count:40}]};
 const rejected=await createRound(0,100,{editId:id,rounds:[round,other],body:{items:[{id:itemId,crop_id:cropId,plant_count:61,price_per_kg:100}]}});
 assert.equal(rejected.res.statusCode,400);assert.equal(rejected.savedItems,undefined);
 const accepted=await createRound(0,100,{editId:id,rounds:[round,other],body:{items:[{id:itemId,crop_id:cropId,plant_count:60,price_per_kg:90}]}});
 assert.equal(accepted.res.statusCode,200);assert.equal(accepted.savedItems[0].plant_count,60);
 const payload=accepted.rpcCalls.find(c=>c.name==='save_planting_round').payload;
 assert.equal(payload.p_round.status,undefined,'partial edit must not reset the round to draft');
 assert.equal(JSON.parse(payload.p_round.notes).note,'keep');
});

test('an unchanged planted crop can be retained after catalog/plot deactivation, but cannot be increased',async()=>{
 const id='55555555-5555-4555-8555-555555555555',itemId='66666666-6666-4666-8666-666666666666';
 const round={id,status:'growing',current_step:3,round_items:[{id:itemId,crop_id:cropId,plant_count:50,price_per_kg:100,plot_ids:[plotId]}]};
 const options={editId:id,rounds:[round],crops:[{id:cropId,is_active:false}],plots:[{id:plotId,crop_ids:[cropId],slot_capacity:100,is_active:false}]};
 const accepted=await createRound(0,100,{...options,body:{name:'Renamed'}});assert.equal(accepted.res.statusCode,200);
 const rejected=await createRound(0,100,{...options,body:{items:[{id:itemId,crop_id:cropId,plant_count:51,price_per_kg:100}]}});assert.equal(rejected.res.statusCode,400);
});

test('unplaced plants in an older legacy round cannot be silently ignored when creating another round',async()=>{
 const other='33333333-3333-4333-8333-333333333333',second='44444444-4444-4444-8444-444444444444';
 const result=await createRound(1,100,{crops:[{id:cropId},{id:other}],plots:[{id:plotId,crop_ids:[cropId],slot_capacity:100,is_active:true},{id:second,crop_ids:[other],slot_capacity:100,is_active:true}],rounds:[{id:'legacy',status:'growing',current_step:2,notes:'legacy note',round_items:[{crop_id:cropId,plant_count:101}]}],items:[{crop_id:other,plant_count:1,growing_days:30,price_per_kg:100,plot_ids:[second]}]});
 assert.equal(result.res.statusCode,400);assert.match(result.res.body.error,/รอบเดิม/);assert.equal(result.savedItems,undefined);
});
