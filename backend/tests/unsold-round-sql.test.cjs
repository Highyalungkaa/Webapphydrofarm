const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
test('closing with unsold produce is atomic and preserves inventory and order history',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA storage;
    CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT);CREATE TABLE public.admin_users(email TEXT PRIMARY KEY);
    CREATE FUNCTION public.is_admin() RETURNS BOOLEAN LANGUAGE SQL AS 'SELECT true';
    CREATE TABLE storage.buckets(id TEXT PRIMARY KEY,name TEXT,public BOOLEAN,file_size_limit BIGINT,allowed_mime_types TEXT[]);
    CREATE TABLE storage.objects(bucket_id TEXT,name TEXT);
    CREATE TABLE public.plots(id UUID PRIMARY KEY,name TEXT);
    CREATE TABLE public.crops(id UUID PRIMARY KEY,name TEXT,slots_per_kg NUMERIC);
    CREATE TABLE public.planting_rounds(id UUID PRIMARY KEY,status TEXT,current_step INTEGER,notes TEXT,seed_date DATE,
      created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now(),sold_out_date DATE,completed_date DATE,harvest_sale_date DATE,
      booking_opens_at TIMESTAMPTZ,booking_closes_at TIMESTAMPTZ);
    CREATE TABLE public.round_items(id UUID PRIMARY KEY,round_id UUID REFERENCES public.planting_rounds,crop_id UUID REFERENCES public.crops,
      plant_count INTEGER,estimated_qty_kg NUMERIC,bookable_qty_kg NUMERIC,actual_qty_kg NUMERIC);
    CREATE TABLE public.orders(id UUID PRIMARY KEY,round_id UUID REFERENCES public.planting_rounds,status TEXT,payment_status TEXT);
    CREATE TABLE public.order_items(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID REFERENCES public.orders,
      round_item_id UUID REFERENCES public.round_items,qty_kg NUMERIC,fulfillment_source TEXT,fulfilled_qty_kg NUMERIC);
    CREATE TABLE public.audit_logs(actor_id UUID,actor_email TEXT,entity_type TEXT,entity_id TEXT,action TEXT,old_data JSONB,new_data JSONB);`);
  for(const file of ['031_plant_loss_history.sql','032_close_round_with_unsold.sql','032_close_round_with_unsold.sql']) await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',file),'utf8'));
  const actor=randomUUID();await db.query('INSERT INTO auth.users VALUES($1,$2)',[actor,'admin@example.com']);await db.query('INSERT INTO public.admin_users VALUES($1)',['admin@example.com']);
  const today=(await db.query("SELECT (now() AT TIME ZONE 'Asia/Bangkok')::DATE::TEXT AS d")).rows[0].d;
  async function setup(){const round=randomUUID(),item=randomUUID(),crop=randomUUID();
    await db.query('INSERT INTO public.crops VALUES($1,$2,5)',[crop,'Oak']);
    await db.query(`INSERT INTO public.planting_rounds(id,status,current_step,seed_date,harvest_sale_date,booking_opens_at)
      VALUES($1,'booking_open',7,$2::DATE-20,$2::DATE-3,now()-interval '10 days')`,[round,today]);
    await db.query('INSERT INTO public.round_items(id,round_id,crop_id,plant_count,estimated_qty_kg,bookable_qty_kg) VALUES($1,$2,$3,500,100,100)',[item,round,crop]);return{round,item};}
  const input=(ids,count=500,other=0)=>[{round_item_id:ids.item,unsold_plant_count:count,other_sales_kg:other,disposition:'discard',note:''}];
  async function close(ids,items=input(ids),options={}){return(await db.query('SELECT public.close_round_unsold($1,$2,$3,$4,$5,$6) AS result',[ids.round,options.actor||actor,options.request||randomUUID(),options.date||today,options.note||'',JSON.stringify(items)])).rows[0].result;}
  async function state(ids){return(await db.query('SELECT * FROM public.planting_rounds WHERE id=$1',[ids.round])).rows[0];}
  async function addOrder(ids,status='confirmed',qty=20,sub=0){const id=randomUUID();await db.query('INSERT INTO public.orders VALUES($1,$2,$3,$4)',[id,ids.round,status,status==='completed'?'paid':'unpaid']);await db.query('INSERT INTO public.order_items(order_id,round_item_id,qty_kg,fulfillment_source,fulfilled_qty_kg) VALUES($1,$2,$3,$4,$5)',[id,ids.item,qty,sub?'substitute':'own',sub]);return id;}
  await t.test('no orders: record 500 unsold plants, close booking and release the round without sold_out_date',async()=>{
    const ids=await setup();await close(ids);const r=await state(ids);assert.equal(r.status,'completed');assert.equal(r.current_step,8);assert.equal(r.closure_reason,'unsold');assert.equal(r.sold_out_date,null);assert.ok(r.booking_closes_at);
    const row=(await db.query('SELECT * FROM public.round_unsold_items WHERE round_id=$1',[ids.round])).rows[0];assert.equal(row.unsold_plant_count,500);assert.equal(Number(row.unsold_estimated_kg),100);
    assert.equal((await db.query('SELECT count(*) AS n FROM public.plant_losses WHERE round_id=$1',[ids.round])).rows[0].n,0);
  });
  await t.test('pending delivery and legacy unpaid completed orders block closure without writing partial history',async()=>{
    const ids=await setup();const order=await addOrder(ids);await assert.rejects(close(ids),/ออเดอร์ค้าง/);
    assert.equal((await state(ids)).status,'booking_open');assert.equal((await db.query('SELECT count(*) AS n FROM public.round_unsold_closures WHERE round_id=$1',[ids.round])).rows[0].n,0);
    await db.query("UPDATE public.orders SET status='completed' WHERE id=$1",[order]);await assert.rejects(close(ids),/ค้างชำระ/);
    await db.query("UPDATE public.orders SET payment_status='paid' WHERE id=$1",[order]);await close(ids,input(ids,400));
  });
  await t.test('completed own produce excludes substitutions; other sales are counted separately',async()=>{
    const ids=await setup();await addOrder(ids,'completed',20,5);
    await assert.rejects(close(ids,input(ids,450)),/เกินผลผลิต/);
    await close(ids,input(ids,400,5));const row=(await db.query('SELECT * FROM public.round_unsold_items WHERE round_id=$1',[ids.round])).rows[0];
    assert.equal(Number(row.delivered_own_kg),15);assert.equal(Number(row.other_sales_kg),5);assert.equal(Number(row.unsold_estimated_kg),80);
  });
  await t.test('no-show produce remains available and plant damage stays a separate ledger',async()=>{
    const ids=await setup();await addOrder(ids,'no_show',100);
    await db.query("SELECT public.record_plant_loss($1,$2,$3,$4,$5,50,'root rot',NULL,NULL,NULL,NULL)",[ids.round,ids.item,actor,randomUUID(),today]);
    await close(ids,input(ids,450));assert.equal((await db.query('SELECT lost_plant_count FROM public.round_items WHERE id=$1',[ids.item])).rows[0].lost_plant_count,50);
    assert.equal(Number((await db.query('SELECT unsold_estimated_kg FROM public.round_unsold_items WHERE round_id=$1',[ids.round])).rows[0].unsold_estimated_kg),90);
  });
  await t.test('closure requires harvest confirmation, valid dates, complete unique items and at least one unsold plant',async()=>{
    const ids=await setup();await db.query('UPDATE public.planting_rounds SET harvest_sale_date=NULL WHERE id=$1',[ids.round]);await assert.rejects(close(ids),/พร้อมเก็บ/);
    await db.query('UPDATE public.planting_rounds SET harvest_sale_date=$2::DATE-3 WHERE id=$1',[ids.round,today]);
    await assert.rejects(close(ids,input(ids),{date:'2999-01-01'}),/วันที่/);await assert.rejects(close(ids,input(ids),{date:'2000-01-01'}),/วันที่/);
    await assert.rejects(close(ids,[]),/ทุกชนิด/);await assert.rejects(close(ids,[...input(ids),...input(ids)]),/หนึ่งรายการ/);
    await assert.rejects(close(ids,input(ids,0)),/อย่างน้อย/);await assert.rejects(close(ids,input(ids,501)),/จำนวนผัก/);
    await assert.rejects(close(ids,[{...input(ids)[0],disposition:'other',note:''}]),/รายละเอียด/);
    await assert.rejects(close(ids,input(ids),{actor:randomUUID()}),/ไม่มีสิทธิ์/);
    assert.equal((await state(ids)).status,'booking_open');
  });
  await t.test('safe retry; closed rounds cannot reopen, receive late bookings or change historical quantities',async()=>{
    const ids=await setup();const order=await addOrder(ids,'completed',20);const request=randomUUID();const payload=input(ids,400);
    await close(ids,payload,{request});await close(ids,payload,{request});assert.equal((await db.query('SELECT count(*) AS n FROM public.round_unsold_items WHERE round_id=$1',[ids.round])).rows[0].n,1);
    await assert.rejects(close(ids,payload),/สิ้นสุดแล้ว/);
    await assert.rejects(db.query("UPDATE public.planting_rounds SET status='booking_open' WHERE id=$1",[ids.round]),/ไม่สามารถเปิดใหม่/);
    await assert.rejects(addOrder(ids,'confirmed',1),/สิ้นสุดแล้ว/);
    await assert.rejects(db.query("UPDATE public.orders SET status='confirmed' WHERE id=$1",[order]),/สิ้นสุดแล้ว/);
    await assert.rejects(db.query('UPDATE public.order_items SET qty_kg=21 WHERE order_id=$1',[order]),/ไม่สามารถเปลี่ยนปริมาณ/);
    const priv=await db.query("SELECT has_function_privilege('authenticated','public.close_round_unsold(uuid,uuid,uuid,date,text,jsonb)','execute') AS allowed");assert.equal(priv.rows[0].allowed,false);
  });
});
