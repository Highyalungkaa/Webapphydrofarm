const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

test('plant loss ledger and booking protection execute against PostgreSQL', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT);
    CREATE TABLE public.admin_users(email TEXT PRIMARY KEY);
    CREATE FUNCTION public.is_admin() RETURNS BOOLEAN LANGUAGE SQL AS 'SELECT true';
    CREATE TABLE storage.buckets(id TEXT PRIMARY KEY,name TEXT,public BOOLEAN,file_size_limit BIGINT,allowed_mime_types TEXT[]);
    CREATE TABLE storage.objects(bucket_id TEXT,name TEXT);
    CREATE TABLE public.plots(id UUID PRIMARY KEY,name TEXT);
    CREATE TABLE public.crops(id UUID PRIMARY KEY,slots_per_kg NUMERIC);
    CREATE TABLE public.planting_rounds(id UUID PRIMARY KEY,status TEXT,current_step INTEGER,notes TEXT,
      seed_date DATE,created_at TIMESTAMPTZ DEFAULT now(),sold_out_date DATE,completed_date DATE);
    CREATE TABLE public.round_items(id UUID PRIMARY KEY,round_id UUID REFERENCES public.planting_rounds,
      crop_id UUID REFERENCES public.crops,plant_count INTEGER,estimated_qty_kg NUMERIC,bookable_qty_kg NUMERIC);
    CREATE TABLE public.orders(id UUID PRIMARY KEY,status TEXT);
    CREATE TABLE public.order_items(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID REFERENCES public.orders,
      round_item_id UUID REFERENCES public.round_items,qty_kg NUMERIC);
    CREATE TABLE public.audit_logs(actor_id UUID,actor_email TEXT,entity_type TEXT,entity_id TEXT,action TEXT,old_data JSONB,new_data JSONB);
  `);
  const migration = readFileSync(path.resolve(__dirname,'../../supabase/migrations/031_plant_loss_history.sql'),'utf8');
  await db.exec(migration);
  // Repeat application must not duplicate records or fail on existing triggers.
  await db.exec(migration);
  const actor = randomUUID();
  await db.query('INSERT INTO auth.users VALUES ($1,$2)',[actor,'admin@example.com']);
  await db.query('INSERT INTO public.admin_users VALUES ($1)',['admin@example.com']);
  async function setup(count=500,rate=5) {
    const round=randomUUID(),item=randomUUID(),crop=randomUUID(),plot=randomUUID();
    await db.query('INSERT INTO public.plots VALUES($1,$2)',[plot,'แปลง A']);
    await db.query('INSERT INTO public.crops VALUES($1,$2)',[crop,rate]);
    await db.query(`INSERT INTO public.planting_rounds(id,status,current_step,seed_date,notes)
      VALUES($1,'booking_open',5,(now() AT TIME ZONE 'Asia/Bangkok')::DATE-5,$2)`,[round,JSON.stringify({cropPlotIds:{[crop]:[plot]}})]);
    await db.query('INSERT INTO public.round_items(id,round_id,crop_id,plant_count,estimated_qty_kg,bookable_qty_kg) VALUES($1,$2,$3,$4,$5,$5)',[item,round,crop,count,Math.floor(count*100/Math.round(rate*100))]);
    return {round,item,crop,plot};
  }
  async function record(ids,count,options={}) {
    const result = await db.query(`SELECT public.record_plant_loss($1,$2,$3,$4,
      COALESCE($5::DATE,(now() AT TIME ZONE 'Asia/Bangkok')::DATE),$6,$7,$8,$9,$10,$11) AS entry`,[
      ids.round,ids.item,options.actor||actor,options.request||randomUUID(),options.date||null,count,
      options.reason||'รากเน่า',options.plot===undefined?ids.plot:options.plot,options.note||null,options.image||null,options.void||null,
    ]);
    return result.rows[0].entry;
  }
  async function row(ids) { return (await db.query('SELECT * FROM public.round_items WHERE id=$1',[ids.item])).rows[0]; }
  await t.test('500 plants minus 50 gives 450 plants and 90kg; original quantities are preserved',async()=>{
    const ids=await setup(); const loss=await record(ids,50); const state=await row(ids);
    assert.equal(state.plant_count,500); assert.equal(state.lost_plant_count,50);
    assert.equal(Number(state.remaining_estimated_qty_kg),90); assert.equal(Number(state.estimated_qty_kg),100);
    assert.equal(Number(state.bookable_qty_kg),100); assert.equal(Number(loss.estimated_loss_kg),10);
    assert.equal(loss.stage,5); assert.equal(loss.recorded_by_email,'admin@example.com');
    assert.equal((await db.query('SELECT count(*) AS n FROM public.audit_logs WHERE entity_id=$1',[ids.item])).rows[0].n,1);
  });
  await t.test('snapshots survive catalog edits; fractional loss is the difference between rounded totals',async()=>{
    const ids=await setup(33,1.1);
    await db.query('UPDATE public.crops SET slots_per_kg=99 WHERE id=$1',[ids.crop]);
    const first=await record(ids,1);
    assert.equal(Number(first.estimated_loss_kg),1); assert.equal(Number((await row(ids)).remaining_estimated_qty_kg),29);
    await db.query('UPDATE public.crops SET slots_per_kg=99 WHERE id=$1',[ids.crop]);
    await record(ids,1); assert.equal(Number((await row(ids)).loss_plants_per_kg),1.1);
    assert.equal(Number((await row(ids)).remaining_estimated_qty_kg),28);
  });
  await t.test('retries are idempotent; over-loss, future dates and invalid plot/actor/image are rejected',async()=>{
    const ids=await setup(); const request=randomUUID(); const first=await record(ids,50,{request});
    assert.equal((await record(ids,50,{request})).id,first.id); assert.equal((await row(ids)).lost_plant_count,50);
    await assert.rejects(record(ids,51,{request}),/รหัสรายการซ้ำ/);
    await assert.rejects(record(ids,451),/จำนวนเสียหาย/);
    await assert.rejects(record(ids,0),/จำนวนเสียหาย/);
    await assert.rejects(record(ids,1,{date:'2999-01-01'}),/วันที่พบ/);
    await assert.rejects(record(ids,1,{date:'2000-01-01'}),/วันที่พบ/);
    await assert.rejects(record(ids,1,{plot:randomUUID()}),/แปลง/);
    await assert.rejects(record(ids,1,{actor:randomUUID()}),/ไม่มีสิทธิ์/);
    await assert.rejects(record(ids,1,{image:'another-round/slip.jpg'}),/รูปภาพ/);
    assert.equal((await row(ids)).lost_plant_count,50);
  });
  await t.test('void keeps history, restores computed totals and is safe to retry',async()=>{
    const ids=await setup(); const first=await record(ids,50); await record(ids,1);
    assert.equal(Number((await row(ids)).remaining_estimated_qty_kg),89);
    const reversed=await record(ids,null,{void:first.id,reason:'กรอกผิด'});
    assert.ok(reversed.voided_at); assert.equal(reversed.void_reason,'กรอกผิด');
    await record(ids,null,{void:first.id,reason:'กรอกผิด'});
    const state=await row(ids); assert.equal(state.lost_plant_count,1); assert.equal(Number(state.remaining_estimated_qty_kg),99);
    assert.equal((await db.query('SELECT count(*) AS n FROM public.plant_losses WHERE round_item_id=$1',[ids.item])).rows[0].n,2);
    await assert.rejects(db.query('UPDATE public.round_items SET plant_count=600 WHERE id=$1',[ids.item]),/ประวัติสูญเสีย/);
  });
  await t.test('existing bookings stay intact; stock trigger blocks extra bookings after a shortage',async()=>{
    const ids=await setup(); const order=randomUUID();
    await db.query("INSERT INTO public.orders VALUES($1,'confirmed')",[order]);
    await db.query('INSERT INTO public.order_items(order_id,round_item_id,qty_kg) VALUES($1,$2,95)',[order,ids.item]);
    await record(ids,50);
    assert.equal(Number((await db.query('SELECT qty_kg FROM public.order_items WHERE order_id=$1',[order])).rows[0].qty_kg),95);
    const next=randomUUID(); await db.query("INSERT INTO public.orders VALUES($1,'confirmed')",[next]);
    await assert.rejects(db.query('INSERT INTO public.order_items(order_id,round_item_id,qty_kg) VALUES($1,$2,0.5)',[next,ids.item]),/ไม่เพียงพอ/);
    await db.query("UPDATE public.orders SET status='cancelled' WHERE id=$1",[order]);
    await db.query('INSERT INTO public.order_items(order_id,round_item_id,qty_kg) VALUES($1,$2,90)',[next,ids.item]);
    await assert.rejects(db.query('UPDATE public.order_items SET qty_kg=91 WHERE order_id=$1',[next]),/ไม่เพียงพอ/);
    await assert.rejects(db.query("UPDATE public.orders SET status='confirmed' WHERE id=$1",[order]),/ไม่เพียงพอ/);
  });
  await t.test('all plants can be lost, leaving exactly zero kilograms and no new booking capacity',async()=>{
    const ids=await setup(); const entry=await record(ids,500);
    assert.equal(Number(entry.estimated_loss_kg),100);
    assert.equal(Number((await row(ids)).remaining_estimated_qty_kg),0);
    await assert.rejects(record(ids,1),/จำนวนเสียหาย/);
    await record(ids,null,{void:entry.id});
    assert.equal(Number((await row(ids)).remaining_estimated_qty_kg),100);
  });
  await t.test('terminal rounds reject losses and reversals; historical rows cannot be deleted with a round',async()=>{
    const ids=await setup(); const entry=await record(ids,50);
    await db.query("UPDATE public.planting_rounds SET status='completed' WHERE id=$1",[ids.round]);
    await assert.rejects(record(ids,1),/สิ้นสุด/);
    await assert.rejects(record(ids,null,{void:entry.id}),/สิ้นสุด/);
    await assert.rejects(db.query('DELETE FROM public.planting_rounds WHERE id=$1',[ids.round]));
    const permissions=await db.query("SELECT has_function_privilege('authenticated','public.record_plant_loss(uuid,uuid,uuid,uuid,date,integer,text,uuid,text,text,uuid)','execute') AS allowed");
    assert.equal(permissions.rows[0].allowed,false);
  });
});
