const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const {PGlite}=require('@electric-sql/pglite');
const backend=require('./load-service.cjs')('harvestDates');
const frontend={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../frontend/src/lib/harvestDates.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:frontend});
const basis=JSON.stringify({harvestDateBasis:backend.SEED_HARVEST_BASIS,cropGrowingDays:{}});
const round={seed_date:'2026-08-15',planting_start_date:'2026-08-29',transplant_date:'2026-08-31',notes:basis};

test('frontend and backend use only seed date and growing days regardless of actual transplant date',()=>{
  for(const helper of [backend,frontend]){
    assert.equal(helper.calculateHarvestDate(round,40),'2026-09-24');
    assert.equal(helper.calculateHarvestDate(round,40,{actualDate:'2026-08-29'}),'2026-09-24');
    assert.equal(helper.calculateHarvestDate(round,40,{actualDate:'2026-08-28'}),'2026-09-24');
    assert.equal(helper.calculateHarvestDate(round,40,{actualDate:'2026-09-02'}),'2026-09-24');
    assert.equal(helper.calculateHarvestDate(round,40),'2026-09-24','recording or changing the actual planting date never moves harvest');
    assert.equal(helper.calculateHarvestDate(round,30),'2026-09-14');
    assert.equal(helper.calculateHarvestDate({...round,seed_date:'2028-02-15',planting_start_date:'2028-02-29',transplant_date:'2028-03-02'},40),'2028-03-26');
  }
});

test('existing schedules stay on their saved basis until step four is re-confirmed',()=>{
  for(const helper of [backend,frontend]){
    const legacy={...round,notes:'Old note'};
    assert.equal(helper.calculateHarvestDate(legacy,40),'2026-10-10');
    assert.equal(helper.calculateHarvestDate(legacy,40,{actualDate:'2026-08-31',fromSeed:true}),'2026-09-24');
    assert.equal(helper.calculateHarvestDate({...round,seed_date:null},40),'2026-10-10');
    assert.equal(helper.calculateHarvestDate({status:'draft',current_step:1,planted_at:'2026-08-15'},40),null);
  }
});

test('migration removes automatic delay without changing manual schedules or existing order promises',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE TABLE planting_rounds(id UUID PRIMARY KEY,notes TEXT,seed_date DATE,planting_start_date DATE,transplant_date DATE,harvest_sale_date DATE,expected_harvest_date DATE,fulfillment_date DATE,growing_days INTEGER,status TEXT DEFAULT 'growing',updated_at TIMESTAMPTZ);
    CREATE TABLE crops(id UUID PRIMARY KEY,growing_days INTEGER); CREATE TABLE orders(id UUID,round_id UUID); CREATE TABLE round_items(id UUID,round_id UUID); CREATE TABLE order_items(order_id UUID,round_item_id UUID);`);
  const sql=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/055_seed_based_harvest_dates.sql'),'utf8');
  await db.exec(sql);await db.exec(sql);
  const id='11111111-1111-4111-8111-111111111111',crop='22222222-2222-4222-8222-222222222222';
  await db.query('INSERT INTO crops VALUES($1,40)',[crop]);
  await db.query(`INSERT INTO planting_rounds(id,notes,seed_date,planting_start_date,transplant_date,harvest_sale_date,expected_harvest_date,fulfillment_date,growing_days) VALUES($1,$2,'2026-08-15','2026-08-29','2026-08-31',NULL,'2026-09-26','2026-09-26',40)`,[id,JSON.stringify({harvestDateBasis:'seed_with_transplant_delay'})]);
  const date=async()=> (await db.query('SELECT booking_harvest_date($1,$2)::TEXT AS day',[id,crop])).rows[0].day;
  assert.equal(await date(),'2026-09-26');
  const correction=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/056_remove_transplant_harvest_delay.sql'),'utf8');
  await db.exec(correction);await db.exec(correction);
  assert.equal(await date(),'2026-09-24');
  const saved=(await db.query('SELECT expected_harvest_date::TEXT AS expected,fulfillment_date::TEXT AS fulfillment,notes FROM planting_rounds')).rows[0];
  assert.equal(saved.expected,'2026-09-24');assert.equal(saved.fulfillment,'2026-09-24');assert.equal(JSON.parse(saved.notes).harvestDateBasis,'seed');
  await db.query("UPDATE planting_rounds SET transplant_date='2026-08-29'");assert.equal(await date(),'2026-09-24');
  await db.query("UPDATE planting_rounds SET transplant_date='2026-08-28'");assert.equal(await date(),'2026-09-24');
  await db.query('UPDATE planting_rounds SET notes=$1',[JSON.stringify({harvestDateBasis:backend.SEED_HARVEST_BASIS,cropGrowingDays:{[crop]:30}})]);
  assert.equal(await date(),'2026-09-14');
  await db.query("UPDATE planting_rounds SET notes='Legacy note',transplant_date='2026-08-31'");assert.equal(await date(),'2026-10-10');
  await db.query('INSERT INTO orders VALUES($1,$1)',[id]);
  await db.query("UPDATE planting_rounds SET notes=$1,expected_harvest_date='2026-10-05',fulfillment_date='2026-09-26'",[JSON.stringify({harvestDateBasis:'seed_with_transplant_delay'})]);
  await db.exec(correction);
  const promised=(await db.query('SELECT expected_harvest_date::TEXT AS expected,fulfillment_date::TEXT AS fulfillment FROM planting_rounds')).rows[0];
  assert.equal(promised.expected,'2026-10-05');assert.equal(promised.fulfillment,'2026-09-26');
  await db.query("UPDATE planting_rounds SET harvest_sale_date='2026-09-28'");assert.equal(await date(),'2026-09-28');
});
