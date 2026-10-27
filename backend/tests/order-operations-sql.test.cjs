const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const migration=name=>fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',name),'utf8');

test('confirmation expiry and atomic order amendments',async t=>{
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

  for(const name of ['041_order_confirmation_deadlines.sql','042_amend_order_items.sql','041_order_confirmation_deadlines.sql','042_amend_order_items.sql'])await db.exec(migration(name));
  await db.exec(migration('043_audit_account_and_order_guards.sql'));
  await db.exec(`ALTER TABLE plots ADD COLUMN zone_name TEXT,ADD COLUMN slot_capacity INTEGER,ADD COLUMN crop_id UUID,ADD COLUMN crop_ids UUID[],ADD COLUMN is_active BOOLEAN DEFAULT true;
    ALTER TABLE round_items ADD COLUMN created_at TIMESTAMPTZ DEFAULT now(),ADD COLUMN plot_ids UUID[];`);
  await db.exec(migration('046_atomic_planting_rounds.sql'));
  await db.exec(migration('046_atomic_planting_rounds.sql'));
  async function setup(){const crop=randomUUID(),a=randomUUID(),b=randomUUID(),ia=randomUUID(),ib=randomUUID();
    await db.query("INSERT INTO crops(id,name,slots_per_kg,growing_days) VALUES($1,'Oak',5,30)",[crop]);
    for(const [id,day] of [[a,1],[b,8]])await db.query("INSERT INTO planting_rounds(id,status,current_step,expected_harvest_date,booking_opens_at) VALUES($1,'booking_open',5,$2::DATE+$3::INTEGER,now()-interval '1 day')",[id,today,day]);
    for(const [id,round,price] of [[ia,a,50],[ib,b,60]])await db.query('INSERT INTO round_items(id,round_id,crop_id,plant_count,price_per_kg) VALUES($1,$2,$3,50,$4)',[id,round,crop,price]);
    return{crop,a,b,ia,ib};
  }
  async function book(x,qty=5){return(await db.query('SELECT create_pooled_order($1,$2,$3) AS r',[customer,randomUUID(),JSON.stringify({items:[{crop_id:x.crop,qty_kg:qty}],fulfillment_method:'pickup',contact_phone:'0812345678',accepted_substitution_terms:true})])).rows[0].r.order_id;}
  async function read(id){return(await db.query('SELECT * FROM orders WHERE id=$1',[id])).rows[0];}
  async function amend(id,items,preview=false,request=randomUUID(),expected=null,who=actor){const o=await read(id);const body={items,reason:'Customer requested change',expected_updated_at:expected||o.updated_at.toISOString()};
    const call=async show=>(await db.query('SELECT amend_order_items($1,$2,$3,$4,$5) AS r',[who,id,request,JSON.stringify(body),show])).rows[0].r;
    if(!preview)body.preview_token=(await call(true)).preview_token;
    return call(preview);
  }
  const qty=async id=>Number((await db.query('SELECT available_qty_kg FROM booking_sources WHERE id=$1',[id])).rows[0].available_qty_kg);
  await t.test('allocation status changes count a no-show once after migration, without a second RPC increment',async()=>{
    const before=(await db.query('SELECT no_show_count FROM profiles WHERE id=$1',[customer])).rows[0].no_show_count;
    const x=await setup(),id=await book(x);const item=(await db.query('SELECT id FROM order_items WHERE order_id=$1',[id])).rows[0];
    await db.query('SELECT save_admin_order_allocation($1,$2,$3)',[actor,id,JSON.stringify({status:'no_show',allocation_items:[{id:item.id,own_qty_kg:null,substitute_qty_kg:0,substitute_total_cost:0,discount_amount:0}]})]);
    assert.equal((await db.query('SELECT no_show_count FROM profiles WHERE id=$1',[customer])).rows[0].no_show_count,before+1);
    await db.query('UPDATE profiles SET no_show_count=$1 WHERE id=$2',[before,customer]);
  });
  await t.test('preview does not mutate; saving reduces reservations and keeps original source price',async()=>{
    const x=await setup(),o=await book(x,15);await db.query('UPDATE round_items SET price_per_kg=99 WHERE id=$1',[x.ia]);
    const preview=await amend(o,[{crop_id:x.crop,qty_kg:6}],true);assert.equal(Number(preview.total_amount),300);assert.equal(await qty(x.ia),0);
    await amend(o,[{crop_id:x.crop,qty_kg:6}]);assert.equal(await qty(x.ia),4);assert.equal(await qty(x.ib),10);assert.equal(Number((await read(o)).total_amount),300);
  });
  await t.test('adding a crop changes anchor safely and preserves each source quota once',async()=>{
    const x=await setup(),y=await setup();for(const r of [x.a,y.a])await db.query('SELECT set_round_order_limit($1,$2,2)',[actor,r]);
    const o=await book(x,5);await amend(o,[{crop_id:y.crop,qty_kg:3}]);assert.equal((await read(o)).round_id,y.a);assert.equal(await qty(x.ia),10);assert.equal(await qty(y.ia),7);
    const a=(await db.query('SELECT order_limit_remaining FROM planting_rounds WHERE id=$1',[x.a])).rows[0];assert.equal(a.order_limit_remaining,2);
    assert.equal((await db.query('SELECT order_limit_remaining FROM planting_rounds WHERE id=$1',[y.a])).rows[0].order_limit_remaining,1);
    await db.query("UPDATE orders SET status='cancelled' WHERE id=$1",[o]);assert.equal((await db.query('SELECT order_limit_remaining FROM planting_rounds WHERE id=$1',[y.a])).rows[0].order_limit_remaining,2);
  });
  await t.test('failed changes roll back stock, price and items; stale and unauthorized changes fail',async()=>{
    const x=await setup(),o=await book(x);await assert.rejects(amend(o,[{crop_id:x.crop,qty_kg:21}]),/สต๊อก/);assert.equal(await qty(x.ia),5);
    await assert.rejects(amend(o,[{crop_id:x.crop,qty_kg:6}],false,randomUUID(),'2000-01-01T00:00:00Z'),/โหลดข้อมูล/);
    await assert.rejects(amend(o,[{crop_id:x.crop,qty_kg:6}],false,randomUUID(),null,customer),/ไม่มีสิทธิ์/);
  });
  await t.test('paid, completed, weighed and expired orders cannot be amended',async()=>{
    for(const condition of ['paid','weighed','expired']){const x=await setup(),o=await book(x);
      if(condition==='paid')await db.query("UPDATE orders SET payment_status='paid' WHERE id=$1",[o]);
      if(condition==='weighed')await db.query('UPDATE order_items SET own_qty_kg=0 WHERE order_id=$1',[o]);
      if(condition==='expired')await db.query("UPDATE orders SET confirmation_expires_at=now()-interval '1 minute' WHERE id=$1",[o]);
      await assert.rejects(amend(o,[{crop_id:x.crop,qty_kg:4}]),/รับชำระ|เริ่มจัด|หมดเวลา/);
    }
  });
  await t.test('timeout setting applies to new orders and gives existing untimed orders a full grace period',async()=>{
    await db.query("UPDATE orders SET confirmation_expires_at=NULL WHERE status='pending_confirmation'");
    const x=await setup(),old=await book(x);assert.equal((await read(old)).confirmation_expires_at,null);
    await db.query('SELECT set_order_confirmation_timeout($1,2)',[actor]);assert.ok((await read(old)).confirmation_expires_at>new Date());
    const fresh=await book(x,1);assert.ok((await read(fresh)).confirmation_expires_at>new Date());
    await db.query("UPDATE orders SET confirmation_expires_at=now()-interval '1 minute' WHERE id=$1",[old]);
    const result=await db.query('SELECT expire_pending_orders() AS n');assert.equal(result.rows[0].n,1);assert.equal((await read(old)).status,'cancelled');assert.equal(await qty(x.ia),9);
    assert.equal((await db.query('SELECT expire_pending_orders() AS n')).rows[0].n,0);
    await db.query('SELECT set_order_confirmation_timeout($1,0)',[actor]);assert.equal((await read(fresh)).confirmation_expires_at,null);
  });
  await t.test('expiry leaves paid and already prepared orders for manual attention',async()=>{
    await db.query('SELECT set_order_confirmation_timeout($1,1)',[actor]);
    for(const kind of ['paid','prepared']){const x=await setup(),o=await book(x);
      await db.query("UPDATE orders SET confirmation_expires_at=now()-interval '1 minute' WHERE id=$1",[o]);
      if(kind==='paid')await db.query("UPDATE orders SET payment_status='paid' WHERE id=$1",[o]);else await db.query('UPDATE order_items SET own_qty_kg=0 WHERE order_id=$1',[o]);
      await db.query('SELECT expire_pending_orders()');assert.equal((await read(o)).status,'pending_confirmation');
    }
  });
  await t.test('cash receipt snapshots are independent of subsequent order price updates',async()=>{
    const x=await setup(),o=await book(x);await db.query("UPDATE orders SET payment_status='paid' WHERE id=$1",[o]);assert.equal(Number((await read(o)).received_amount),250);
    await db.query('UPDATE orders SET total_amount=240 WHERE id=$1',[o]);assert.equal(Number((await read(o)).received_amount),250);
  });
  await t.test('crop quotas restore once when a source is removed and later cancellation does not restore it twice',async()=>{
    const x=await setup();for(const [r,i] of [[x.a,x.ia],[x.b,x.ib]])await db.query('SELECT set_round_item_order_limits($1,$2,$3)',[actor,r,JSON.stringify([{id:i,remaining:1}])]);
    const o=await book(x,15);await amend(o,[{crop_id:x.crop,qty_kg:5}]);
    const quota=async id=>(await db.query('SELECT order_limit_remaining FROM round_items WHERE id=$1',[id])).rows[0].order_limit_remaining;
    assert.equal(await quota(x.ia),0);assert.equal(await quota(x.ib),1);await db.query("UPDATE orders SET status='cancelled' WHERE id=$1",[o]);assert.equal(await quota(x.ia),1);assert.equal(await quota(x.ib),1);
  });
  await t.test('save requires the same previewed price and is idempotent on network retries',async()=>{
    const x=await setup(),y=await setup(),o=await book(x),request=randomUUID(),body={items:[{crop_id:y.crop,qty_kg:2}],reason:'Switch vegetables',expected_updated_at:(await read(o)).updated_at.toISOString()};
    const call=async preview=>(await db.query('SELECT amend_order_items($1,$2,$3,$4,$5) AS r',[actor,o,request,JSON.stringify(body),preview])).rows[0].r;
    body.preview_token=(await call(true)).preview_token;await db.query('UPDATE round_items SET price_per_kg=70 WHERE id=$1',[y.ia]);await assert.rejects(call(false),/ราคาเปลี่ยนแปลง/);assert.equal(await qty(x.ia),5);
    body.preview_token=(await call(true)).preview_token;const first=await call(false),retry=await call(false);assert.deepEqual(first,retry);assert.equal(await qty(y.ia),8);assert.equal((await db.query('SELECT count(*) AS n FROM order_item_amendments WHERE request_id=$1',[request])).rows[0].n,1);
  });
  await t.test('a legacy single-round order can be amended into fractional FIFO source lines',async()=>{
    const x=await setup();const o=(await db.query("SELECT create_order($1,$2,$3,'pickup',NULL,NULL,'0812345678',NULL,true) AS r",[x.a,customer,JSON.stringify([{round_item_id:x.ia,qty_kg:0.5}])])).rows[0].r.order_id;
    await book(x,9.3);await amend(o,[{crop_id:x.crop,qty_kg:1}]);const lines=(await db.query('SELECT qty_kg FROM order_items WHERE order_id=$1 ORDER BY qty_kg',[o])).rows;
    assert.deepEqual(lines.map(i=>Number(i.qty_kg)),[0.3,0.7]);assert.equal((await read(o)).is_pooled,true);
  });

});
