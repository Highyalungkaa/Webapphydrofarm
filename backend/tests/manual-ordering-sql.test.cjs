const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const migration=name=>fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',name),'utf8');

for(const previousWeights of [false,true])test('manual ordering with '+(previousWeights?'weight-ledger upgrade':'direct upgrade from 033'),async t=>{
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
    '031_plant_loss_history.sql','032_close_round_with_unsold.sql','033_admin_chat_orders.sql',...(previousWeights?['034_weighed_orders_and_extra_stock.sql']:[]),'035_manual_orders_and_purchase_limits.sql','035_manual_orders_and_purchase_limits.sql','036_round_order_limits.sql','036_round_order_limits.sql','037_per_crop_order_limits.sql','037_per_crop_order_limits.sql','038_projected_crop_weight.sql']){try{await db.exec(migration(name));}catch(e){throw new Error(name+': '+e.message+' '+(e.internalQuery||'').slice(3000,5400));}}
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

  async function limits(ids,enabled,cap=2){return(await db.query('SELECT public.set_round_purchase_limits($1,$2,$3,$4) AS result',[actor,ids.round,enabled,JSON.stringify([{id:ids.item,max_qty_per_order_kg:cap}])])).rows[0].result;}

  async function orderLimit(ids,n){return db.query('SELECT public.set_round_order_limit($1,$2,$3)',[actor,ids.round,n]);}
  async function remaining(ids){return(await db.query('SELECT order_limit_remaining FROM public.planting_rounds WHERE id=$1',[ids.round])).rows[0].order_limit_remaining;}
  await t.test('remaining order quota covers customer and chat orders and rejects a third without partial inserts',async()=>{
    const ids=await setup();await book(ids);await orderLimit(ids,2);
    await book(ids);assert.equal(await remaining(ids),1);await book(ids,5,true);assert.equal(await remaining(ids),0);
    await assert.rejects(book(ids),/รับออเดอร์ครบ/);await assert.rejects(book(ids,5,true),/รับออเดอร์ครบ/);
    assert.equal((await db.query('SELECT count(*) AS n FROM public.orders WHERE round_id=$1',[ids.round])).rows[0].n,3);
  });
  await t.test('failed order rolls quota back and cancellation restores once; reopening consumes it',async()=>{
    const ids=await setup();await limits(ids,true,1);await orderLimit(ids,2);
    await assert.rejects(book(ids,3),/สูงสุด|จำกัด/);assert.equal(await remaining(ids),2);
    const order=await book(ids,1);assert.equal(await remaining(ids),1);
    await db.query("UPDATE public.orders SET status='confirmed' WHERE id=$1",[order]);assert.equal(await remaining(ids),1);
    await db.query("UPDATE public.orders SET status='cancelled' WHERE id=$1",[order]);assert.equal(await remaining(ids),2);
    await db.query("UPDATE public.orders SET status='cancelled' WHERE id=$1",[order]);assert.equal(await remaining(ids),2);
    await db.query("UPDATE public.orders SET status='confirmed' WHERE id=$1",[order]);assert.equal(await remaining(ids),1);
  });
  await t.test('saving a new remaining count ignores old cancellations and zero stops only new orders',async()=>{
    const ids=await setup(),unlimited=await book(ids);await orderLimit(ids,2);const old=await book(ids);
    await orderLimit(ids,0);await db.query("UPDATE public.orders SET status='cancelled' WHERE id=$1",[old]);assert.equal(await remaining(ids),0);
    await db.query("UPDATE public.orders SET status='cancelled' WHERE id=$1",[unlimited]);assert.equal(await remaining(ids),0);
    await assert.rejects(book(ids),/รับออเดอร์ครบ/);
    await orderLimit(ids,null);await book(ids);await book(ids,10,true);assert.equal(await remaining(ids),null);
    await assert.rejects(orderLimit(ids,-1),/จำนวนเต็ม/);
    await assert.rejects(db.query('SELECT public.set_round_order_limit($1,$2,2)',[customer,ids.round]),/ไม่มีสิทธิ์/);
    await db.query("UPDATE public.planting_rounds SET status='completed' WHERE id=$1",[ids.round]);
    await assert.rejects(orderLimit(ids,2),/สิ้นสุด/);
  });
  await t.test('crop quotas count only selected crops and restore each quota once',async()=>{
    const ids=await setup(),secondCrop=randomUUID(),secondItem=randomUUID();
    await db.query("INSERT INTO public.crops VALUES($1,'Cos',5)",[secondCrop]);
    await db.query('INSERT INTO public.round_items(id,round_id,crop_id,plant_count,estimated_qty_kg,bookable_qty_kg,price_per_kg) VALUES($1,$2,$3,500,100,100,50)',[secondItem,ids.round,secondCrop]);
    const setCropLimits=items=>db.query('SELECT public.set_round_item_order_limits($1,$2,$3)',[actor,ids.round,JSON.stringify(items)]);
    const remainingCrop=async id=>(await db.query('SELECT order_limit_remaining FROM public.round_items WHERE id=$1',[id])).rows[0].order_limit_remaining;
    const bookSelected=async selectedItems=>(await db.query("SELECT public.create_order($1,$2,$3,'pickup',NULL,NULL,'0812345678',NULL,true) AS result",[ids.round,customer,JSON.stringify(selectedItems.map(id=>({round_item_id:id,qty_kg:1})))] )).rows[0].result.order_id;
    await setCropLimits([{id:ids.item,remaining:1}]);
    await bookSelected([secondItem]);assert.equal(await remainingCrop(ids.item),1);
    await book(ids,1,true);assert.equal(await remainingCrop(ids.item),0);
    await assert.rejects(bookSelected([ids.item]),/รับออเดอร์ครบ/);
    await bookSelected([secondItem]);
    await setCropLimits([{id:ids.item,remaining:1},{id:secondItem,remaining:1}]);
    const mixed=await bookSelected([ids.item,secondItem]);
    assert.equal(await remainingCrop(ids.item),0);assert.equal(await remainingCrop(secondItem),0);
    await db.query("UPDATE public.orders SET status='cancelled' WHERE id=$1",[mixed]);
    assert.equal(await remainingCrop(ids.item),1);assert.equal(await remainingCrop(secondItem),1);
    await db.query("UPDATE public.orders SET status='cancelled' WHERE id=$1",[mixed]);
    assert.equal(await remainingCrop(ids.item),1);
    await db.query("UPDATE public.orders SET status='confirmed' WHERE id=$1",[mixed]);
    assert.equal(await remainingCrop(ids.item),0);assert.equal(await remainingCrop(secondItem),0);
    await setCropLimits([{id:ids.item,remaining:1},{id:secondItem,remaining:0}]);
    await assert.rejects(bookSelected([ids.item,secondItem]),/รับออเดอร์ครบ/);
    assert.equal(await remainingCrop(ids.item),1);
    await db.query("UPDATE public.orders SET status='cancelled' WHERE id=$1",[mixed]);
    assert.equal(await remainingCrop(ids.item),1);assert.equal(await remainingCrop(secondItem),0);
    await setCropLimits([]);
    assert.equal(await remainingCrop(ids.item),null);
    await bookSelected([ids.item,secondItem]);
  });
  await t.test('orders are accepted without kilogram inventory and regardless of old estimates',async()=>{
    const ids=await setup();await db.query('UPDATE public.round_items SET estimated_qty_kg=0,bookable_qty_kg=0 WHERE id=$1',[ids.item]);
    const a=await book(ids,500),b=await book(ids,700,true);await allocation(a,500,0,{status:'ready'});await allocation(b,700,0,{status:'ready'});
    assert.equal((await db.query('SELECT count(*) AS n FROM public.orders WHERE round_id=$1',[ids.round])).rows[0].n,2);
  });
  await t.test('optional per-crop caps apply to online and chat orders, never a shared round stock pool',async()=>{
    const ids=await setup();await limits(ids,true,1.5);await book(ids,1.5);await book(ids,1.5,true);
    await assert.rejects(book(ids,1.51),/สูงสุด|จำกัด/);await assert.rejects(book(ids,1.51,true),/สูงสุด|จำกัด/);
    await limits(ids,false);await book(ids,50);await book(ids,50,true);
    await limits(ids,true,2);await book(ids,2);await assert.rejects(book(ids,2.01,true),/สูงสุด|จำกัด/);
  });
  await t.test('enabling a cap preserves existing orders and invalid configurations roll back',async()=>{
    const ids=await setup(),order=await book(ids,30);await limits(ids,true,1);
    assert.equal(Number((await db.query('SELECT qty_kg FROM public.order_items WHERE order_id=$1',[order])).rows[0].qty_kg),30);
    await assert.rejects(limits(ids,true,0.4),/0.5/);
    await assert.rejects(db.query('SELECT public.set_round_purchase_limits($1,$2,true,$3)',[actor,ids.round,'[]']),/ทุกชนิด/);
    assert.equal(Number((await db.query('SELECT max_qty_per_order_kg FROM public.round_items WHERE id=$1',[ids.item])).rows[0].max_qty_per_order_kg),1);
  });
  await t.test('plant damage records only plant counts and leaves weight fields uncalculated',async()=>{
    const ids=await setup();await db.query("SELECT public.record_plant_loss($1,$2,$3,$4,$5,50,'Damage',NULL,NULL,NULL,NULL)",[ids.round,ids.item,actor,randomUUID(),today]);
    const entry=(await db.query('SELECT * FROM public.plant_losses WHERE round_id=$1',[ids.round])).rows[0];
    assert.equal(entry.plant_count,50);assert.equal(entry.plants_per_kg,null);assert.equal(entry.estimated_loss_kg,null);
    const row=(await db.query('SELECT * FROM public.round_items WHERE id=$1',[ids.item])).rows[0];assert.equal(row.lost_plant_count,50);assert.equal(row.remaining_estimated_qty_kg,null);
    await book(ids,1000);await book(ids,1000,true);
  });
  await t.test('unsold produce uses manually weighed kilograms and does not compare to old forecast',async()=>{
    const ids=await setup(),order=await book(ids,200);await allocation(order,200,0,{status:'completed',payment_status:'paid',payment_method:'cash'});
    await db.query('SELECT public.close_round_unsold($1,$2,$3,$4,$5,$6)',[ids.round,actor,randomUUID(),today,'Manual remaining produce',JSON.stringify([{round_item_id:ids.item,unsold_plant_count:20,unsold_qty_kg:17.35,other_sales_kg:0,disposition:'donate',note:''}])]);
    const snapshot=(await db.query('SELECT * FROM public.round_unsold_items WHERE round_id=$1',[ids.round])).rows[0];
    assert.equal(Number(snapshot.unsold_actual_kg),17.35);assert.equal(snapshot.unsold_estimated_kg,null);assert.equal(snapshot.farm_yield_kg,null);
    await assert.rejects(limits(ids,true,2),/สิ้นสุด/);
  });
});
