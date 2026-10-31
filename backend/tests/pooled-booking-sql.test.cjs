const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const migration=name=>fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',name),'utf8');

test('pooled crop stock and FIFO orders',async t=>{
 const db=new PGlite();t.after(()=>db.close());const previousWeights=false;
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
    CREATE TABLE public.crops(id UUID PRIMARY KEY,name TEXT,slots_per_kg NUMERIC,growing_days INTEGER,is_active BOOLEAN DEFAULT TRUE,image_url TEXT);
    CREATE TABLE public.planting_rounds(id UUID PRIMARY KEY,status TEXT,current_step INTEGER,notes TEXT,seed_date DATE,
      created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now(),sold_out_date DATE,completed_date DATE,harvest_sale_date DATE,
      booking_opens_at TIMESTAMPTZ,booking_closes_at TIMESTAMPTZ,transplant_date DATE,expected_harvest_date DATE,fulfillment_date DATE,growing_days INTEGER);
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
    '031_plant_loss_history.sql','032_close_round_with_unsold.sql','033_admin_chat_orders.sql',...(previousWeights?['034_weighed_orders_and_extra_stock.sql']:[]),'035_manual_orders_and_purchase_limits.sql','035_manual_orders_and_purchase_limits.sql','036_round_order_limits.sql','036_round_order_limits.sql','037_per_crop_order_limits.sql','037_per_crop_order_limits.sql','038_projected_crop_weight.sql','039_allow_backdated_plant_losses.sql']){try{await db.exec(migration(name));}catch(e){throw new Error(name+': '+e.message+' '+(e.internalQuery||'').slice(3000,5400));}}
  // The payment completion trigger is also installed in production (migration 030).
  const payment=migration('030_protect_orders_and_payment_completion.sql');
  await db.exec(payment.slice(payment.indexOf('CREATE OR REPLACE FUNCTION public.require_payment_before_completion()'),payment.indexOf('DROP TRIGGER IF EXISTS require_payment_before_completion ON public.equipment_orders;')));
  const actor=randomUUID(),customer=randomUUID();
  await db.query('INSERT INTO auth.users VALUES($1,$2),($3,$4)',[actor,'admin@example.com',customer,'member@example.com']);
  await db.query('INSERT INTO public.admin_users VALUES($1)',['admin@example.com']);await db.query("INSERT INTO public.profiles(id,full_name) VALUES($1,'Member')",[customer]);
  const today=(await db.query("SELECT (now() AT TIME ZONE 'Asia/Bangkok')::DATE::TEXT AS d")).rows[0].d;

  await db.exec(migration('040_pooled_crop_booking.sql'));
  await db.exec(migration('040_pooled_crop_booking.sql'));
  async function setup(){
    const crop=randomUUID(),a=randomUUID(),b=randomUUID(),ia=randomUUID(),ib=randomUUID();
    await db.query("INSERT INTO crops(id,name,slots_per_kg,growing_days) VALUES($1,'Oak',5,30)",[crop]);
    for(const [id,day] of [[a,1],[b,8]])await db.query("INSERT INTO planting_rounds(id,status,current_step,expected_harvest_date,booking_opens_at) VALUES($1,'booking_open',5,$2::DATE+$3::INTEGER,now()-interval '1 day')",[id,today,day]);
    for(const [id,round,price] of [[ia,a,50],[ib,b,60]])await db.query('INSERT INTO round_items(id,round_id,crop_id,plant_count,price_per_kg) VALUES($1,$2,$3,50,$4)',[id,round,crop,price]);
    return {crop,a,b,ia,ib};
  }
  const payload=(crop,qty)=>({items:[{crop_id:crop,qty_kg:qty}],fulfillment_method:'pickup',contact_phone:'0812345678',accepted_substitution_terms:true});
  const book=async(crop,qty,request=randomUUID(),data=null)=>(await db.query('SELECT public.create_pooled_order($1,$2,$3) AS result',[customer,request,JSON.stringify(data||payload(crop,qty))])).rows[0].result;
  const stock=async id=>(await db.query('SELECT * FROM booking_sources WHERE id=$1',[id])).rows[0];
  await t.test('one order spans rounds FIFO and keeps source prices and dates',async()=>{
    const x=await setup(),o=await book(x.crop,15);
    const lines=(await db.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY price_per_kg',[o.order_id])).rows;
    assert.equal(lines.length,2);assert.equal(Number(lines[0].qty_kg),10);assert.equal(Number(lines[1].qty_kg),5);
    assert.equal(Number(o.total_amount),800);assert.equal(Number((await stock(x.ia)).available_qty_kg),0);assert.equal(Number((await stock(x.ib)).available_qty_kg),5);
    const row=(await db.query('SELECT * FROM orders WHERE id=$1',[o.order_id])).rows[0];assert.equal(row.round_id,x.a);assert.equal(row.is_pooled,true);assert.ok(row.harvest_end_date>row.harvest_start_date);
    await assert.rejects(book(x.crop,5.01),/สต๊อก/);await book(x.crop,5);assert.equal(Number((await stock(x.ib)).available_qty_kg),0);
  });
  await t.test('partial source under 0.5 kg can finish a crop of at least 0.5 kg; minimum applies to customer total',async()=>{
    const x=await setup();await book(x.crop,9.8);const o=await book(x.crop,0.5);
    const lines=(await db.query('SELECT qty_kg FROM order_items WHERE order_id=$1 ORDER BY qty_kg',[o.order_id])).rows;
    assert.deepEqual(lines.map(l=>Number(l.qty_kg)),[0.2,0.3]);await assert.rejects(book(x.crop,0.49),/0.5/);
  });
  await t.test('closing first round removes only that remaining stock and advances date window',async()=>{
    const x=await setup();await book(x.crop,3);await db.query("UPDATE planting_rounds SET status='booking_closed' WHERE id=$1",[x.a]);
    assert.equal(await stock(x.ia),undefined);assert.equal(Number((await stock(x.ib)).available_qty_kg),10);
    const o=await book(x.crop,2);assert.equal((await db.query('SELECT round_id FROM orders WHERE id=$1',[o.order_id])).rows[0].round_id,x.b);
  });
  await t.test('cancellation returns each source and reactivation cannot oversell',async()=>{
    const x=await setup(),o=await book(x.crop,12);
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1",[o.order_id]);assert.equal(Number((await stock(x.ia)).available_qty_kg),10);assert.equal(Number((await stock(x.ib)).available_qty_kg),10);
    await book(x.crop,20);await assert.rejects(db.query("UPDATE orders SET status='confirmed' WHERE id=$1",[o.order_id]),/สต๊อก/);
    assert.equal((await db.query('SELECT status FROM orders WHERE id=$1',[o.order_id])).rows[0].status,'cancelled');
  });
  await t.test('retry is idempotent and changed payload cannot reuse request ID',async()=>{
    const x=await setup(),request=randomUUID(),a=await book(x.crop,2,request),b=await book(x.crop,2,request);
    assert.equal(a.order_id,b.order_id);assert.equal(Number((await stock(x.ia)).available_qty_kg),8);await assert.rejects(book(x.crop,3,request),/รหัสคำขอ/);
  });
  await t.test('per-source kilogram and order caps apply, and cancellation restores quotas',async()=>{
    const x=await setup();for(const [round,item] of [[x.a,x.ia],[x.b,x.ib]]){
      await db.query('SELECT set_round_purchase_limits($1,$2,true,$3)',[actor,round,JSON.stringify([{id:item,max_qty_per_order_kg:2}])]);
      await db.query('SELECT set_round_item_order_limits($1,$2,$3)',[actor,round,JSON.stringify([{id:item,remaining:1}])]);
    }
    await assert.rejects(book(x.crop,4.01),/สต๊อก/);const o=await book(x.crop,4);await assert.rejects(book(x.crop,1),/สต๊อก/);
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1",[o.order_id]);assert.equal((await stock(x.ia)).order_limit_remaining,1);assert.equal((await stock(x.ib)).order_limit_remaining,1);
    await db.query("UPDATE orders SET status='confirmed' WHERE id=$1",[o.order_id]);assert.equal((await stock(x.ia)).order_limit_remaining,0);
  });
  await t.test('legacy whole-round quotas count all contributing rounds once',async()=>{
    const x=await setup();for(const round of [x.a,x.b])await db.query('SELECT set_round_order_limit($1,$2,1)',[actor,round]);
    const o=await book(x.crop,12);assert.equal((await stock(x.ib)).round_order_limit_remaining,0);
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1",[o.order_id]);assert.equal((await stock(x.ia)).round_order_limit_remaining,1);assert.equal((await stock(x.ib)).round_order_limit_remaining,1);
    await db.query("UPDATE orders SET status='confirmed' WHERE id=$1",[o.order_id]);assert.equal((await stock(x.ib)).round_order_limit_remaining,0);
  });
  await t.test('failed multi-crop booking rolls everything back',async()=>{
    const x=await setup(),y=await setup(),data=payload(x.crop,2);data.items.push({crop_id:y.crop,qty_kg:21});
    await assert.rejects(book(x.crop,2,randomUUID(),data),/สต๊อก/);assert.equal(Number((await stock(x.ia)).available_qty_kg),10);
  });
  await t.test('legacy website and admin chat cannot bypass inventory',async()=>{
    const x=await setup();
    await assert.rejects(db.query("SELECT create_order($1,$2,$3,'pickup',NULL,NULL,'0812345678',NULL,true)",[x.a,customer,JSON.stringify([{round_item_id:x.ia,qty_kg:11}])]),/สต๊อก/);
    await assert.rejects(db.query('SELECT create_admin_chat_order($1,$2,$3)',[actor,randomUUID(),JSON.stringify({round_id:x.a,customer_name:'Guest',contact_phone:'0812345678',fulfillment_method:'pickup',accepted_substitution_terms:true,items:[{round_item_id:x.ia,qty_kg:11}]})]),/สต๊อก/);
  });
  await t.test('a non-anchor round cannot close as unsold while its pooled order needs fulfillment',async()=>{
    const x=await setup(),o=await book(x.crop,12);
    await db.query('UPDATE planting_rounds SET current_step=7,harvest_sale_date=$1::DATE-1 WHERE id=$2',[today,x.b]);
    await assert.rejects(db.query('SELECT close_round_unsold($1,$2,$3,$4,$5,$6)',[x.b,actor,randomUUID(),today,'Close',JSON.stringify([{round_item_id:x.ib,unsold_plant_count:1,unsold_qty_kg:1,other_sales_kg:0,disposition:'donate'}])]),/ออเดอร์/);
    assert.equal((await stock(x.ib)).round_id,x.b);
    const sources=(await db.query('SELECT source_round_ids FROM orders WHERE id=$1',[o.order_id])).rows[0].source_round_ids;
    assert.deepEqual([...sources].sort(),[x.a,x.b].sort());
  });
  await t.test('fulfillment is blocked when an additional source round has ended',async()=>{
    const x=await setup(),o=await book(x.crop,12);await db.query("UPDATE planting_rounds SET status='completed' WHERE id=$1",[x.b]);
    const lines=(await db.query('SELECT id,qty_kg FROM order_items WHERE order_id=$1',[o.order_id])).rows;
    await assert.rejects(db.query('SELECT save_admin_order_allocation($1,$2,$3)',[actor,o.order_id,JSON.stringify({allocation_items:lines.map(i=>({id:i.id,own_qty_kg:Number(i.qty_kg),substitute_qty_kg:0,substitute_total_cost:0,discount_amount:0}))})]),/สิ้นสุด/);
  });
  await t.test('harvest order follows per-crop dates rather than round creation order',async()=>{
    const x=await setup();await db.query("UPDATE planting_rounds SET transplant_date=$1::DATE-25,notes=$2,growing_days=45 WHERE id=$3",[today,JSON.stringify({cropGrowingDays:{[x.crop]:30}}),x.a]);
    await db.query('UPDATE planting_rounds SET expected_harvest_date=$1::DATE+2 WHERE id=$2',[today,x.b]);
    const o=await book(x.crop,2);assert.equal((await db.query('SELECT round_item_id FROM order_items WHERE order_id=$1',[o.order_id])).rows[0].round_item_id,x.ib);
  });
  await t.test('booking windows and disabled crops are excluded; losses reduce reservable weight',async()=>{
    const x=await setup();await db.query('UPDATE round_items SET lost_plant_count=5 WHERE id=$1',[x.ia]);assert.equal(Number((await stock(x.ia)).available_qty_kg),9);
    await db.query("UPDATE planting_rounds SET booking_closes_at=now()-interval '1 hour' WHERE id=$1",[x.a]);assert.equal(await stock(x.ia),undefined);
    await db.query('UPDATE crops SET is_active=false WHERE id=$1',[x.crop]);await assert.rejects(book(x.crop,1),/สต๊อก/);
  });

  await t.test('retired limits cannot block new orders, while physical stock is still protected',async()=>{
    const x=await setup();
    await db.query('UPDATE planting_rounds SET purchase_limit_enabled=true,order_limit_remaining=0 WHERE id IN($1,$2)',[x.a,x.b]);
    await db.query('UPDATE round_items SET max_qty_per_order_kg=0.5,order_limit_remaining=0 WHERE id IN($1,$2)',[x.ia,x.ib]);
    await db.exec(migration('052_remove_booking_limits.sql'));await db.exec(migration('052_remove_booking_limits.sql'));
    const o=await book(x.crop,11);assert.ok(o.order_id);
    await book(x.crop,1);await book(x.crop,1);
    await assert.rejects(book(x.crop,8),/สต๊อก/);
    await db.query('UPDATE planting_rounds SET purchase_limit_enabled=true,order_limit_remaining=0 WHERE id=$1',[x.a]);
    await db.query('UPDATE round_items SET max_qty_per_order_kg=0.5,order_limit_remaining=0 WHERE id=$1',[x.ia]);
    const r=(await db.query('SELECT purchase_limit_enabled,order_limit_remaining FROM planting_rounds WHERE id=$1',[x.a])).rows[0];
    assert.equal(r.purchase_limit_enabled,false);assert.equal(r.order_limit_remaining,null);
    const i=(await db.query('SELECT max_qty_per_order_kg,order_limit_remaining FROM round_items WHERE id=$1',[x.ia])).rows[0];
    assert.equal(i.max_qty_per_order_kg,null);assert.equal(i.order_limit_remaining,null);
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1",[o.order_id]);
    await book(x.crop,10);
  });

});
