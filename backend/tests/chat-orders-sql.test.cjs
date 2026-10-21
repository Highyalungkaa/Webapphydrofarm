const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');

test('admin chat orders share stock, preserve guest identity and record a transactional audit',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
    CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT);CREATE TABLE public.admin_users(email TEXT PRIMARY KEY);
    CREATE TYPE public.fulfillment_method AS ENUM('pickup','delivery');
    CREATE TABLE public.profiles(id UUID PRIMARY KEY REFERENCES auth.users(id),full_name TEXT,no_show_count INTEGER DEFAULT 0);
    CREATE TABLE public.app_settings(key TEXT PRIMARY KEY,value JSONB);
    CREATE TABLE public.planting_rounds(id UUID PRIMARY KEY,status TEXT,closure_reason TEXT,completed_date DATE,booking_opens_at TIMESTAMPTZ,booking_closes_at TIMESTAMPTZ);
    CREATE TABLE public.round_items(id UUID PRIMARY KEY,round_id UUID REFERENCES public.planting_rounds,
      bookable_qty_kg NUMERIC,remaining_estimated_qty_kg NUMERIC,price_per_kg NUMERIC,max_qty_per_order_kg NUMERIC);
    CREATE TABLE public.orders(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),round_id UUID REFERENCES public.planting_rounds,
      customer_id UUID NOT NULL REFERENCES public.profiles(id),fulfillment_method public.fulfillment_method,delivery_address TEXT,contact_phone TEXT,note TEXT,
      status TEXT,payment_status TEXT,total_amount NUMERIC,accepted_substitution_terms_at TIMESTAMPTZ,requires_confirmation BOOLEAN,confirmed_at TIMESTAMPTZ);
    CREATE TABLE public.order_items(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID REFERENCES public.orders,
      round_item_id UUID REFERENCES public.round_items,qty_kg NUMERIC,price_per_kg NUMERIC,fulfillment_source TEXT);
    CREATE TABLE public.audit_logs(actor_id UUID,actor_email TEXT,entity_type TEXT,entity_id TEXT,action TEXT,new_data JSONB);`);
  // Include the production website confirmation trigger: chat orders must be confirmed explicitly.
  await db.exec(fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/022_require_admin_order_confirmation.sql'),'utf8'));
  const sql=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/033_admin_chat_orders.sql'),'utf8');
  await db.exec(sql);await db.exec(sql);
  const actor=randomUUID(),customer=randomUUID();
  await db.query('INSERT INTO auth.users VALUES($1,$2),($3,$4)',[actor,'admin@example.com',customer,'customer@example.com']);
  await db.query('INSERT INTO public.admin_users VALUES($1)',['admin@example.com']);
  await db.query('INSERT INTO public.profiles(id,full_name) VALUES($1,$2)',[customer,'Member']);
  async function setup(){const round=randomUUID(),item=randomUUID();
    await db.query("INSERT INTO public.planting_rounds(id,status,booking_opens_at) VALUES($1,'booking_open',now()-interval '1 day')",[round]);
    await db.query('INSERT INTO public.round_items VALUES($1,$2,100,90,50,NULL)',[item,round]);
    return{round,item};}
  const payload=(ids,qty=10)=>({round_id:ids.round,customer_id:null,customer_name:'Guest from Facebook',contact_phone:'0812345678',
    fulfillment_method:'pickup',delivery_address:'',source_reference:'Facebook name',note:'chat order',accepted_substitution_terms:true,
    items:[{round_item_id:ids.item,qty_kg:qty}]});
  async function create(body,request=randomUUID(),admin=actor){return(await db.query('SELECT public.create_admin_chat_order($1,$2,$3) AS result',[admin,request,JSON.stringify(body)])).rows[0].result;}
  async function count(){return(await db.query('SELECT count(*) AS n FROM public.orders')).rows[0].n;}
  await t.test('guest needs no profile, snapshots price and source, confirmed/unpaid with audit',async()=>{
    const ids=await setup(),result=await create(payload(ids));
    const o=(await db.query('SELECT * FROM public.orders WHERE id=$1',[result.order_id])).rows[0];
    assert.equal(o.customer_id,null);assert.equal(o.customer_name,'Guest from Facebook');assert.equal(o.order_source,'facebook_chat');
    assert.equal(o.created_by,actor);assert.equal(o.status,'confirmed');assert.equal(o.requires_confirmation,false);assert.ok(o.confirmed_at);
    assert.equal(o.payment_status,'unpaid');assert.equal(Number(o.total_amount),500);
    assert.equal((await db.query('SELECT count(*) AS n FROM public.profiles')).rows[0].n,1);
    assert.equal((await db.query('SELECT count(*) AS n FROM public.audit_logs WHERE entity_id=$1',[result.order_id])).rows[0].n,1);
    await db.query('UPDATE public.round_items SET price_per_kg=99 WHERE id=$1',[ids.item]);
    assert.equal(Number((await db.query('SELECT price_per_kg FROM public.order_items WHERE order_id=$1',[o.id])).rows[0].price_per_kg),50);
  });
  await t.test('member can be linked; retries return original order, changed payload rejects',async()=>{
    const ids=await setup(),body={...payload(ids),customer_id:customer},request=randomUUID();
    const first=await create(body,request),before=await count();assert.equal((await create(body,request)).order_id,first.order_id);assert.equal(await count(),before);
    assert.equal((await db.query('SELECT customer_id FROM public.orders WHERE id=$1',[first.order_id])).rows[0].customer_id,customer);
    await assert.rejects(create({...body,note:'different'},request),/บันทึกซ้ำ/);
  });
  await t.test('online and chat orders consume the same stock, including losses; cancellation releases stock',async()=>{
    const ids=await setup();const existing=randomUUID();
    await db.query("INSERT INTO public.orders(id,round_id,customer_id,status) VALUES($1,$2,$3,'confirmed')",[existing,ids.round,customer]);
    await db.query('INSERT INTO public.order_items(order_id,round_item_id,qty_kg,price_per_kg) VALUES($1,$2,85,50)',[existing,ids.item]);
    const before=await count();await assert.rejects(create(payload(ids,6)),/คงเหลือ/);assert.equal(await count(),before);
    await create(payload(ids,5));await assert.rejects(create(payload(ids,0.5)),/คงเหลือ/);
    await db.query("UPDATE public.orders SET status='cancelled' WHERE id=$1",[existing]);await create(payload(ids,85));
  });
  await t.test('closed, scheduled and completed rounds cannot receive chat orders',async()=>{
    for(const update of ["status='booking_closed'","booking_opens_at=now()+interval '1 day'","booking_closes_at=now()-interval '1 minute'","closure_reason='unsold'","completed_date=current_date"]){
      const ids=await setup();await db.query(`UPDATE public.planting_rounds SET ${update} WHERE id=$1`,[ids.round]);await assert.rejects(create(payload(ids)),/ปิดรับจอง/);
    }
  });
  await t.test('validates actor, terms, identity, quantities, crop ownership and per-order limits',async()=>{
    const ids=await setup(),body=payload(ids);
    await assert.rejects(create(body,randomUUID(),customer),/ไม่มีสิทธิ์/);
    for(const change of [{accepted_substitution_terms:false},{customer_name:null},{contact_phone:''},{items:[]},{items:[...body.items,...body.items]},
      {items:[{round_item_id:randomUUID(),qty_kg:1}]},{items:[{round_item_id:ids.item,qty_kg:0.4}]},{items:[{round_item_id:ids.item,qty_kg:1.001}]}]){
      const before=await count();await assert.rejects(create({...body,...change}));assert.equal(await count(),before);
    }
    await db.query('UPDATE public.round_items SET max_qty_per_order_kg=2 WHERE id=$1',[ids.item]);await assert.rejects(create(body),/สูงสุด/);
    await db.query('UPDATE public.profiles SET no_show_count=3 WHERE id=$1',[customer]);
    await db.exec(`INSERT INTO public.app_settings VALUES('no_show_limit','{"value":3}');`);
    await assert.rejects(create({...body,customer_id:customer}),/ไม่มารับ/);
  });
  await t.test('delivery requires address and respects minimum weight; clients cannot call RPC',async()=>{
    const ids=await setup(),body={...payload(ids,1),fulfillment_method:'delivery'};
    await assert.rejects(create(body),/ที่อยู่/);
    await db.exec(`INSERT INTO public.app_settings VALUES('delivery_min_total_kg','{"value":3}');`);
    await assert.rejects(create({...body,delivery_address:'Customer address'}),/อย่างน้อย/);
    await create({...body,items:[{round_item_id:ids.item,qty_kg:3}],delivery_address:'Customer address'});
    for(const role of ['anon','authenticated'])assert.equal((await db.query(`SELECT has_function_privilege('${role}','public.create_admin_chat_order(uuid,uuid,jsonb)','execute') AS allowed`)).rows[0].allowed,false);
    await assert.rejects(db.query("INSERT INTO public.orders(round_id,customer_id) VALUES($1,NULL)",[ids.round]),/orders_customer_identity/);
  });
});
