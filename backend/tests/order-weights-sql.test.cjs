const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const migration=name=>fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',name),'utf8');

test('weighed order allocations, replacements and extra stock execute atomically in PostgreSQL',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE SCHEMA storage;
    CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT);CREATE TABLE public.admin_users(email TEXT PRIMARY KEY);
    CREATE FUNCTION public.is_admin() RETURNS BOOLEAN LANGUAGE SQL AS 'SELECT true';
    CREATE TYPE public.order_status AS ENUM('pending_confirmation','confirmed','ready','completed','cancelled','no_show');
    CREATE TYPE public.payment_status AS ENUM('unpaid','paid');CREATE TYPE public.payment_method AS ENUM('cash','transfer');
    CREATE TYPE public.fulfillment_method AS ENUM('pickup','delivery');CREATE TYPE public.fulfillment_source AS ENUM('own','substitute');
    CREATE TABLE public.profiles(id UUID PRIMARY KEY REFERENCES auth.users(id),full_name TEXT,address_detail TEXT,no_show_count INTEGER DEFAULT 0,updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE public.app_settings(key TEXT PRIMARY KEY,value JSONB);
    CREATE TABLE storage.buckets(id TEXT PRIMARY KEY,name TEXT,public BOOLEAN,file_size_limit BIGINT,allowed_mime_types TEXT[]);
    CREATE TABLE storage.objects(bucket_id TEXT,name TEXT);CREATE TABLE public.plots(id UUID PRIMARY KEY,name TEXT);
    CREATE TABLE public.crops(id UUID PRIMARY KEY,name TEXT,slots_per_kg NUMERIC);
    CREATE TABLE public.planting_rounds(id UUID PRIMARY KEY,status TEXT,current_step INTEGER,notes TEXT,seed_date DATE,
      created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now(),sold_out_date DATE,completed_date DATE,harvest_sale_date DATE,
      booking_opens_at TIMESTAMPTZ,booking_closes_at TIMESTAMPTZ);
    CREATE TABLE public.round_items(id UUID PRIMARY KEY,round_id UUID REFERENCES public.planting_rounds,crop_id UUID REFERENCES public.crops,
      plant_count INTEGER,estimated_qty_kg NUMERIC,bookable_qty_kg NUMERIC,actual_qty_kg NUMERIC,price_per_kg NUMERIC,max_qty_per_order_kg NUMERIC);
    CREATE TABLE public.orders(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),round_id UUID REFERENCES public.planting_rounds,
      customer_id UUID NOT NULL REFERENCES public.profiles(id),status public.order_status,payment_status public.payment_status,
      payment_method public.payment_method,fulfillment_method public.fulfillment_method,delivery_address TEXT,district_id UUID,contact_phone TEXT,note TEXT,
      requires_confirmation BOOLEAN DEFAULT FALSE,confirmed_at TIMESTAMPTZ,paid_at TIMESTAMPTZ,total_amount NUMERIC DEFAULT 0,accepted_substitution_terms_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,cancel_reason TEXT,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE public.order_items(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID REFERENCES public.orders,
      round_item_id UUID REFERENCES public.round_items,qty_kg NUMERIC,price_per_kg NUMERIC,fulfillment_source public.fulfillment_source,fulfilled_qty_kg NUMERIC,
      substitute_total_cost NUMERIC,substitute_cost_per_kg NUMERIC,discount_amount NUMERIC DEFAULT 0,created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE public.audit_logs(actor_id UUID,actor_email TEXT,entity_type TEXT,entity_id TEXT,action TEXT,old_data JSONB,new_data JSONB);`);
  for(const name of ['011_manual_booking_close_time.sql','012_fix_order_fulfillment_source_enum.sql','022_require_admin_order_confirmation.sql',
    '031_plant_loss_history.sql','032_close_round_with_unsold.sql','033_admin_chat_orders.sql','034_weighed_orders_and_extra_stock.sql','034_weighed_orders_and_extra_stock.sql'])await db.exec(migration(name));
  // The payment completion trigger is also installed in production (migration 030).
  const payment=migration('030_protect_orders_and_payment_completion.sql');
  await db.exec(payment.slice(payment.indexOf('CREATE OR REPLACE FUNCTION public.require_payment_before_completion()'),payment.indexOf('DROP TRIGGER IF EXISTS require_payment_before_completion ON public.equipment_orders;')));
  const actor=randomUUID(),customer=randomUUID();
  await db.query('INSERT INTO auth.users VALUES($1,$2),($3,$4)',[actor,'admin@example.com',customer,'member@example.com']);
  await db.query('INSERT INTO public.admin_users VALUES($1)',['admin@example.com']);await db.query("INSERT INTO public.profiles(id,full_name) VALUES($1,'Member')",[customer]);
  const today=(await db.query("SELECT (now() AT TIME ZONE 'Asia/Bangkok')::DATE::TEXT AS d")).rows[0].d;
  async function setup(){const round=randomUUID(),item=randomUUID(),crop=randomUUID();
    await db.query("INSERT INTO public.crops VALUES($1,'Oak',5)",[crop]);
    await db.query("INSERT INTO public.planting_rounds(id,status,current_step,seed_date,harvest_sale_date,booking_opens_at) VALUES($1,'booking_open',7,$2::DATE-20,$2::DATE-2,now()-interval '1 day')",[round,today]);
    await db.query('INSERT INTO public.round_items(id,round_id,crop_id,plant_count,estimated_qty_kg,bookable_qty_kg,price_per_kg) VALUES($1,$2,$3,500,100,100,50)',[item,round,crop]);return{round,item};}
  async function book(ids,qty=5,chat=false){
    if(chat)return(await db.query('SELECT public.create_admin_chat_order($1,$2,$3) AS result',[actor,randomUUID(),JSON.stringify({round_id:ids.round,customer_id:null,customer_name:'Guest',contact_phone:'0812345678',fulfillment_method:'pickup',accepted_substitution_terms:true,items:[{round_item_id:ids.item,qty_kg:qty}]})])).rows[0].result.order_id;
    return(await db.query("SELECT public.create_order($1,$2,$3,'pickup',NULL,NULL,'0812345678',NULL,true) AS result",[ids.round,customer,JSON.stringify([{round_item_id:ids.item,qty_kg:qty}])])).rows[0].result.order_id;
  }
  async function allocation(order,own,sub=0,change={}){const item=(await db.query('SELECT id FROM public.order_items WHERE order_id=$1',[order])).rows[0];
    return(await db.query('SELECT public.save_admin_order_allocation($1,$2,$3) AS result',[actor,order,JSON.stringify({status:'confirmed',payment_status:'unpaid',allocation_items:[{id:item.id,own_qty_kg:own,substitute_qty_kg:sub,substitute_total_cost:sub*20,discount_amount:0}],...change})])).rows[0].result;}
  async function stock(ids,qty=10,previous=0,request=randomUUID(),reopen=false){return(await db.query('SELECT public.add_round_weighed_stock($1,$2,$3,$4,$5,$6,$7,$8) AS result',[actor,ids.round,ids.item,request,previous,qty,'Weighed remaining produce',reopen])).rows[0].result;}
  async function inventory(ids){return(await db.query(`SELECT ri.estimated_qty_kg,ri.additional_qty_kg,
    COALESCE(ri.actual_qty_kg,ri.remaining_estimated_qty_kg,ri.estimated_qty_kg)+ri.additional_qty_kg-
    (SELECT COALESCE(sum(public.order_item_farm_allocated_kg(oi.own_qty_kg,oi.qty_kg,oi.fulfillment_source::TEXT,oi.fulfilled_qty_kg,o.status::TEXT)),0)
      FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id WHERE oi.round_item_id=ri.id) AS remaining
    FROM public.round_items ri WHERE ri.id=$1`,[ids.item])).rows[0];}
  await t.test('100 estimated minus 5 weighed leaves 95; repeated save does not subtract twice',async()=>{
    const ids=await setup(),order=await book(ids);await allocation(order,5);assert.equal(Number((await inventory(ids)).remaining),95);
    await allocation(order,5);assert.equal(Number((await inventory(ids)).remaining),95);assert.equal(Number((await inventory(ids)).estimated_qty_kg),100);
    await allocation(order,5,0,{status:'ready'});await allocation(order,5,0,{status:'completed',payment_status:'paid',payment_method:'cash'});
    assert.equal(Number((await inventory(ids)).remaining),95);
  });
  await t.test('short farm produce uses replacement; physical stock and reservations stay separate',async()=>{
    const ids=await setup(),order=await book(ids,100);await allocation(order,80,20,{status:'ready'});
    assert.equal(Number((await inventory(ids)).remaining),20);
    const next=await book(ids,20,true);await allocation(next,20);assert.equal(Number((await inventory(ids)).remaining),0);
    await assert.rejects(book(ids,0.5),/คงเหลือ|ไม่เพียงพอ/);
    await assert.rejects(allocation(order,100,0),/ไม่เพียงพอ|คงเหลือไม่พอ/);
  });
  await t.test('scale readings above the booked weight consume their actual stock without silently changing the bill',async()=>{
    const ids=await setup(),order=await book(ids,5);await allocation(order,5.12,0,{status:'ready'});
    assert.equal(Number((await inventory(ids)).remaining),94.88);
    const saved=(await db.query('SELECT total_amount FROM public.orders WHERE id=$1',[order])).rows[0];assert.equal(Number(saved.total_amount),250);
    await assert.rejects(book(ids,95),/คงเหลือ|ไม่เพียงพอ/);
    await book(ids,94.88,true);await assert.rejects(book(ids,0.5),/คงเหลือ|ไม่เพียงพอ/);
  });
  await t.test('partial allocation can be saved; ready requires a real weight and complete fulfillment',async()=>{
    const ids=await setup(),order=await book(ids,5);await allocation(order,3);
    await assert.rejects(allocation(order,3,0,{status:'ready'}),/ครบ/);
    assert.equal(Number((await inventory(ids)).remaining),97);
    await assert.rejects(allocation(order,null,5,{status:'ready'}),/ครบ/);
    await allocation(order,0,5,{status:'ready'});assert.equal(Number((await inventory(ids)).remaining),100);
  });
  await t.test('surplus adds stock once, preserves estimate and enables both online and chat booking',async()=>{
    const ids=await setup(),order=await book(ids,100);await allocation(order,100);
    const request=randomUUID();await stock(ids,10,0,request);await stock(ids,10,0,request);
    assert.equal(Number((await inventory(ids)).additional_qty_kg),10);assert.equal(Number((await inventory(ids)).remaining),10);
    assert.equal(Number((await inventory(ids)).estimated_qty_kg),100);
    await book(ids,5);await book(ids,5,true);await assert.rejects(book(ids,0.5,true),/คงเหลือ/);
    await assert.rejects(stock(ids,20,0,request),/บันทึกซ้ำ/);await assert.rejects(stock(ids,5,0),/ข้อมูลล่าสุด/);
    await stock(ids,5,10);assert.equal(Number((await inventory(ids)).additional_qty_kg),15);
  });
  await t.test('surplus can reopen sold-out round, but completed/unsold-closed history cannot reopen',async()=>{
    const ids=await setup();await db.query("UPDATE public.planting_rounds SET status='booking_closed',sold_out_date=current_date,current_step=8 WHERE id=$1",[ids.round]);
    await stock(ids,10,0,randomUUID(),true);const r=(await db.query('SELECT * FROM public.planting_rounds WHERE id=$1',[ids.round])).rows[0];
    assert.equal(r.status,'booking_open');assert.equal(r.sold_out_date,null);assert.equal(r.current_step,7);
    await db.query("UPDATE public.planting_rounds SET status='completed',completed_date=current_date WHERE id=$1",[ids.round]);await assert.rejects(stock(ids,10,10),/สิ้นสุด/);
  });
  await t.test('invalid fields and payment failure roll back allocation, costs, discounts and audit together',async()=>{
    const ids=await setup(),order=await book(ids,5);await allocation(order,2);
    const before=(await db.query('SELECT count(*) AS n FROM public.audit_logs')).rows[0].n;
    await assert.rejects(allocation(order,5,0,{status:'completed',payment_status:'unpaid'}),/ชำระเงิน/);
    assert.equal(Number((await inventory(ids)).remaining),98);assert.equal((await db.query('SELECT count(*) AS n FROM public.audit_logs')).rows[0].n,before);
    await assert.rejects(allocation(order,5.001),/ไม่ถูกต้อง/);await assert.rejects(allocation(order,4,6),/ไม่ถูกต้อง/);
    await assert.rejects(allocation(order,3,0,{expected_updated_at:'2000-01-01T00:00:00Z'}),/ข้อมูลล่าสุด/);
    for(const role of ['anon','authenticated'])assert.equal((await db.query(`SELECT has_function_privilege('${role}','public.save_admin_order_allocation(uuid,uuid,jsonb)','execute') AS allowed`)).rows[0].allowed,false);
  });
  await t.test('cancellation releases packed stock without requiring replacement; no-show is counted once',async()=>{
    const ids=await setup(),order=await book(ids,5);await allocation(order,5,0,{status:'ready'});await allocation(order,null,0,{status:'cancelled'});
    assert.equal(Number((await inventory(ids)).remaining),100);
    const next=await book(ids,5);await allocation(next,null,0,{status:'no_show'});await allocation(next,null,0,{status:'no_show'});
    assert.equal((await db.query('SELECT no_show_count FROM public.profiles WHERE id=$1',[customer])).rows[0].no_show_count,1);
  });
  await t.test('plant losses reduce capacity; replacement and weighed surplus restore only their own quantities',async()=>{
    const ids=await setup(),order=await book(ids,100);
    await db.query("SELECT public.record_plant_loss($1,$2,$3,$4,$5,50,'Damaged plants',NULL,NULL,NULL,NULL)",[ids.round,ids.item,actor,randomUUID(),today]);
    await assert.rejects(allocation(order,100),/คงเหลือไม่พอ/);
    await allocation(order,80,20,{status:'ready'});await book(ids,10);
    await assert.rejects(book(ids,0.5,true),/คงเหลือ/);
    await stock(ids,10);await book(ids,10,true);
    assert.equal(Number((await inventory(ids)).remaining),20);
  });
  await t.test('unsold closure snapshots weighed farm usage plus surplus and locks historical allocations',async()=>{
    const ids=await setup(),order=await book(ids,100);await allocation(order,80,20,{status:'completed',payment_status:'paid',payment_method:'cash'});await stock(ids,10);
    await db.query('SELECT public.close_round_unsold($1,$2,$3,$4,$5,$6)',[ids.round,actor,randomUUID(),today,'Remaining produce',JSON.stringify([{round_item_id:ids.item,unsold_plant_count:150,other_sales_kg:0,disposition:'discard',note:''}])]);
    const snapshot=(await db.query('SELECT * FROM public.round_unsold_items WHERE round_id=$1',[ids.round])).rows[0];
    assert.equal(Number(snapshot.delivered_own_kg),80);assert.equal(Number(snapshot.farm_yield_kg),110);assert.equal(Number(snapshot.unsold_estimated_kg),30);
    await assert.rejects(stock(ids,5,10),/สิ้นสุด/);await assert.rejects(allocation(order,70,30),/สิ้นสุด/);
    await assert.rejects(db.query('UPDATE public.order_items SET own_qty_kg=70 WHERE order_id=$1',[order]),/สิ้นสุด/);
  });
});
