const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const load=name=>fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',name),'utf8');

test('atomic planting transactions, snapshot conflicts and retry behavior',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
    CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT);CREATE TABLE admin_users(email TEXT PRIMARY KEY);
    CREATE TABLE crops(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name TEXT,is_active BOOLEAN DEFAULT true,slots_per_kg NUMERIC);
    CREATE TABLE plots(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name TEXT,zone_name TEXT,slot_capacity INTEGER,crop_id UUID,crop_ids UUID[],is_active BOOLEAN DEFAULT true);
    CREATE TABLE app_settings(key TEXT PRIMARY KEY,value JSONB);
    CREATE TABLE planting_rounds(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name TEXT NOT NULL,status TEXT DEFAULT 'draft',current_step INTEGER DEFAULT 1,
      seed_date DATE,fertilizing_date DATE,planting_start_date DATE,transplant_date DATE,harvest_sale_date DATE,sold_out_date DATE,completed_date DATE,
      planted_at DATE NOT NULL,growing_days INTEGER NOT NULL CHECK(growing_days>0),expected_harvest_date DATE NOT NULL,booking_opens_at TIMESTAMPTZ NOT NULL,booking_closes_at TIMESTAMPTZ,
      fulfillment_date DATE NOT NULL,delivery_start_time TIME,delivery_end_time TIME,notes TEXT,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE round_items(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),round_id UUID NOT NULL REFERENCES planting_rounds ON DELETE CASCADE,crop_id UUID NOT NULL REFERENCES crops,
      plant_count INTEGER CHECK(plant_count>0),estimated_qty_kg NUMERIC NOT NULL DEFAULT 0,bookable_qty_kg NUMERIC NOT NULL DEFAULT 0,price_per_kg NUMERIC NOT NULL CHECK(price_per_kg>=0),
      max_qty_per_order_kg NUMERIC,plot_ids UUID[],loss_baseline_plant_count INTEGER,created_at TIMESTAMPTZ DEFAULT now(),UNIQUE(round_id,crop_id));
    CREATE TABLE orders(id UUID PRIMARY KEY,round_id UUID,status TEXT,payment_status TEXT);
    CREATE TABLE order_items(id UUID PRIMARY KEY,order_id UUID,round_item_id UUID);
    CREATE TABLE audit_logs(actor_id UUID,actor_email TEXT,entity_type TEXT,entity_id TEXT,action TEXT,old_data JSONB,new_data JSONB);`);
  await db.exec(load('045_audit_round_and_plot_capacity.sql'));
  await db.exec(load('046_atomic_planting_rounds.sql'));await db.exec(load('046_atomic_planting_rounds.sql'));
  await db.exec(load('047_remove_farm_wide_capacity.sql'));
  const actor=randomUUID(),otherActor=randomUUID(),customer=randomUUID(),crop=randomUUID(),second=randomUUID(),plot=randomUUID();
  await db.query("INSERT INTO auth.users VALUES($1,'admin@example.com'),($2,'other@example.com'),($3,'customer@example.com')",[actor,otherActor,customer]);
  await db.exec("INSERT INTO admin_users VALUES('admin@example.com'),('other@example.com')");
  await db.query("INSERT INTO crops(id,name,slots_per_kg) VALUES($1,'Oak',5),($2,'Cos',5)",[crop,second]);
  await db.query("INSERT INTO plots(id,name,zone_name,slot_capacity,crop_ids) VALUES($1,'Plot 1','A',100,ARRAY[$2::UUID,$3::UUID])",[plot,crop,second]);
  const base={name:'Atomic round',planted_at:'2026-10-27',seed_date:'2026-10-27',growing_days:30,expected_harvest_date:'2026-11-26',booking_opens_at:'2026-10-27T10:00:00Z',fulfillment_date:'2026-11-26',delivery_start_time:'13:00',delivery_end_time:'16:30'};
  const items=[{crop_id:crop,plant_count:60,price_per_kg:100,plot_ids:[plot]}];
  const snapshot=async()=>(await db.query('SELECT read_planting_allocation_state() AS s')).rows[0].s;
  const save=async({state,who=actor,id=null,body=base,lines=items,request=null,payload=base}={})=>(await db.query('SELECT save_planting_round($1,$2,$3,$4,$5,$6,$7) AS r',[who,id,JSON.stringify(body),JSON.stringify(lines),state.token,request,JSON.stringify(payload)])).rows[0].r;
  const counts=async()=>(await db.query('SELECT (SELECT count(*) FROM planting_rounds)::INTEGER AS rounds,(SELECT count(*) FROM round_items)::INTEGER AS items,(SELECT count(*) FROM audit_logs)::INTEGER AS audits')).rows[0];

  await t.test('failure of the second crop rolls back round, first crop, request and audit',async()=>{
    const before=await counts(),state=await snapshot(),request=randomUUID();
    await assert.rejects(save({state,request,lines:[...items,{crop_id:second,plant_count:20,price_per_kg:-1,plot_ids:[plot]}]}),/check constraint/);
    assert.deepEqual(await counts(),before);assert.equal((await db.query('SELECT count(*)::INTEGER AS n FROM planting_round_requests')).rows[0].n,0);
  });
  await t.test('two admins submitting from the same snapshot cannot both reserve the same free area',async()=>{
    const state=await snapshot();
    const results=await Promise.allSettled([save({state}),save({state,who:otherActor})]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.find(r=>r.status==='rejected').reason.code,'40001');
    assert.deepEqual(await counts(),{rounds:1,items:1,audits:1});
  });
  await t.test('changed crop availability, plot capacity and round placement invalidate the snapshot',async()=>{
    for(const sql of ["UPDATE crops SET is_active=NOT is_active WHERE id='"+crop+"'","UPDATE plots SET slot_capacity=slot_capacity+1 WHERE id='"+plot+"'","UPDATE planting_rounds SET notes='changed'"]){
      const state=await snapshot(),before=await counts();await db.exec(sql);
      await assert.rejects(save({state}),e=>e.code==='40001');assert.deepEqual(await counts(),before);
    }
    await db.query('UPDATE crops SET is_active=true WHERE id=$1',[crop]);
  });
  await t.test('one successful request remains retryable after stock is reserved and other data changes',async()=>{
    const state=await snapshot(),request=randomUUID();
    const retryItems=[{...items[0],plant_count:20}];
    const first=await save({state,request,lines:retryItems});
    await db.query('UPDATE crops SET name=$2 WHERE id=$1',[crop,'Oak updated']);
    const retry=await save({state,request,lines:retryItems});assert.equal(retry.id,first.id);
    const early=(await db.query('SELECT find_planting_round_request($1,$2,$3) AS r',[actor,request,JSON.stringify(base)])).rows[0].r;
    assert.equal(early.id,first.id);
    await assert.rejects(save({state,request,payload:{...base,name:'different'}}),/ข้อมูลอื่น/);
    await assert.rejects(save({state,request,who:otherActor}),/ข้อมูลอื่น/);
    assert.deepEqual(await counts(),{rounds:2,items:2,audits:2});
  });
  await t.test('item update failures roll back the edited name and all earlier item changes',async()=>{
    const state=await snapshot(),round=state.rounds[0],old=round.round_items[0];
    await assert.rejects(save({state,id:round.id,body:{name:'must roll back'},lines:[{...old,price_per_kg:55,plot_ids:[plot]},{crop_id:second,plant_count:1,price_per_kg:-1,plot_ids:[plot]}]}),/check constraint/);
    const after=(await snapshot()).rounds.find(r=>r.id===round.id);
    assert.equal(after.name,round.name);assert.equal(after.round_items[0].price_per_kg,old.price_per_kg);
  });
  await t.test('loss baseline, wrong-round items, omitted original items and non-admin actors are rejected',async()=>{
    let state=await snapshot(),round=state.rounds[0],old=round.round_items[0];
    await db.query('UPDATE round_items SET loss_baseline_plant_count=plant_count WHERE id=$1',[old.id]);
    state=await snapshot();round=state.rounds.find(r=>r.id===round.id);old=round.round_items[0];
    await assert.rejects(save({state,id:round.id,lines:[{...old,plant_count:61}]}),/สูญเสีย/);
    await assert.rejects(save({state,id:round.id,lines:[]}),/ครบทุกชนิด/);
    await assert.rejects(save({state,id:round.id,lines:[{...old,id:randomUUID()}]}),/ครบทุกชนิด/);
    await assert.rejects(save({state,who:customer}),/ไม่มีสิทธิ์/);
  });
  await t.test('audit failure also rolls back the whole business transaction',async()=>{
    const state=await snapshot(),before=await counts();
    await db.exec("CREATE FUNCTION fail_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'audit unavailable';END$$; CREATE TRIGGER fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_audit()");
    await assert.rejects(save({state}),/audit unavailable/);assert.deepEqual(await counts(),before);
    await db.exec('DROP TRIGGER fail_audit ON audit_logs');
  });
  await t.test('browser roles cannot execute the snapshot/save RPCs or read request history',async()=>{
    const result=(await db.query("SELECT has_function_privilege('authenticated','public.save_planting_round(uuid,uuid,jsonb,jsonb,text,uuid,jsonb)','EXECUTE') AS save,has_function_privilege('anon','public.read_planting_allocation_state()','EXECUTE') AS read,has_table_privilege('authenticated','public.planting_round_requests','SELECT') AS requests")).rows[0];
    assert.deepEqual(result,{save:false,read:false,requests:false});
  });
});
