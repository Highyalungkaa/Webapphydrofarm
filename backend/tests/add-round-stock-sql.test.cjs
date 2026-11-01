const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const migration=name=>fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',name),'utf8');

test('weighed surplus updates live booking stock atomically with retry and reopening guards',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT);CREATE TABLE admin_users(email TEXT PRIMARY KEY);
 CREATE TYPE round_status AS ENUM('draft','growing','booking_open','booking_closed','harvested','completed','cancelled');
 CREATE TABLE planting_rounds(id UUID PRIMARY KEY,status round_status,current_step INTEGER,closure_reason TEXT,completed_date DATE,
   harvest_sale_date DATE,sold_out_date DATE,booking_opens_at TIMESTAMPTZ,booking_closes_at TIMESTAMPTZ,updated_at TIMESTAMPTZ DEFAULT now(),
   notes TEXT,purchase_limit_enabled BOOLEAN DEFAULT false,order_limit_remaining INTEGER);
 CREATE TABLE plots(id UUID PRIMARY KEY,crop_id UUID,crop_ids UUID[] DEFAULT '{}');
 CREATE TABLE crops(id UUID PRIMARY KEY,name TEXT,slots_per_kg NUMERIC,is_active BOOLEAN DEFAULT true,image_url TEXT);
 CREATE TABLE round_items(id UUID PRIMARY KEY,round_id UUID REFERENCES planting_rounds,crop_id UUID REFERENCES crops,
   plant_count INTEGER,lost_plant_count INTEGER DEFAULT 0,planting_plants_per_kg NUMERIC,estimated_qty_kg NUMERIC,
   price_per_kg NUMERIC,max_qty_per_order_kg NUMERIC,order_limit_remaining INTEGER,plot_ids UUID[] DEFAULT '{}');
 CREATE TABLE orders(id UUID PRIMARY KEY,round_id UUID,status TEXT,is_pooled BOOLEAN DEFAULT true);
 CREATE TABLE order_items(id UUID PRIMARY KEY,order_id UUID REFERENCES orders,round_item_id UUID REFERENCES round_items,qty_kg NUMERIC);
 CREATE TABLE audit_logs(actor_id UUID,actor_email TEXT,entity_type TEXT,entity_id TEXT,action TEXT,old_data JSONB,new_data JSONB);
 CREATE FUNCTION booking_harvest_date(UUID,UUID) RETURNS DATE LANGUAGE SQL AS 'SELECT current_date';`);
 const actor=randomUUID(),outsider=randomUUID();await db.query("INSERT INTO auth.users VALUES($1,'admin@example.com'),($2,'customer@example.com')",[actor,outsider]);await db.exec("INSERT INTO admin_users VALUES('admin@example.com')");
 const sql=migration('057_add_weighed_surplus_for_sale.sql');await db.exec(sql);await db.exec(sql);
 const pooled=migration('040_pooled_crop_booking.sql');
 await db.exec(pooled.slice(pooled.indexOf('CREATE OR REPLACE VIEW public.booking_sources'),pooled.indexOf('-- Whole-round legacy quotas')));
 const create=async()=>{
  const crop=randomUUID(),round=randomUUID(),item=randomUUID(),order=randomUUID();
  await db.query("INSERT INTO crops(id,name,slots_per_kg) VALUES($1,'Oak',2)",[crop]);
  await db.query("INSERT INTO planting_rounds(id,status,current_step,harvest_sale_date,booking_opens_at) VALUES($1,'booking_open',7,current_date,now()-interval '1 day')",[round]);
  await db.query('INSERT INTO round_items(id,round_id,crop_id,plant_count,planting_plants_per_kg,estimated_qty_kg,price_per_kg) VALUES($1,$2,$3,100,2,50,130)',[item,round,crop]);
  await db.query("INSERT INTO orders(id,round_id,status) VALUES($1,$2,'confirmed')",[order,round]);
  await db.query('INSERT INTO order_items VALUES($1,$2,$3,50)',[randomUUID(),order,item]);
  return{crop,round,item,order};
 };
 const add=async(x,{qty=5,previous=0,reopen=false,request=randomUUID(),who=actor,item=x.item}={})=>(await db.query('SELECT add_round_weighed_stock($1,$2,$3,$4,$5,$6,$7,$8) AS result',[who,x.round,item,request,previous,qty,'Extra weighed harvest',reopen])).rows[0].result;
 const remaining=async x=>Number((await db.query('SELECT available_qty_kg FROM booking_sources WHERE id=$1',[x.item])).rows[0]?.available_qty_kg);
 await t.test('50 booked + 5 added exposes exactly 5 more; retries never duplicate the addition',async()=>{
  const x=await create(),request=randomUUID();assert.equal(await remaining(x),0);
  const first=await add(x,{request});assert.equal(await remaining(x),5);
  assert.equal((await add(x,{request})).id,first.id);assert.equal(await remaining(x),5);
  const old=(await db.query('SELECT plant_count,estimated_qty_kg,price_per_kg FROM round_items WHERE id=$1',[x.item])).rows[0];
  assert.equal(old.plant_count,100);assert.equal(Number(old.estimated_qty_kg),50);assert.equal(Number(old.price_per_kg),130);
  await assert.rejects(add(x,{request,qty:6}),/ข้อมูลอื่น/);
  await assert.rejects(add(x),/ข้อมูลล่าสุด/);
  await assert.rejects(db.query('UPDATE planting_rounds SET current_step=5 WHERE id=$1',[x.round]),/ย้อนกลับก่อนขั้นพร้อมเก็บ/);
  await db.query('INSERT INTO order_items VALUES($1,$2,$3,5)',[randomUUID(),x.order,x.item]);assert.equal(await remaining(x),0);
  await assert.rejects(db.query('INSERT INTO order_items VALUES($1,$2,$3,0.5)',[randomUUID(),x.order,x.item]),/สต๊อกผักไม่เพียงพอ/);
 });
 await t.test('invalid actors, wrong items, non-harvest and finished rounds cannot add stock',async()=>{
  const x=await create();await assert.rejects(add(x,{who:outsider}),/ไม่มีสิทธิ์/);
  await assert.rejects(add(x,{item:randomUUID()}),/ไม่อยู่ในรอบ/);
  for(const qty of [0,-1,0.001])await assert.rejects(add(x,{qty}),/ทศนิยม/);
  await db.query('UPDATE planting_rounds SET current_step=5 WHERE id=$1',[x.round]);await assert.rejects(add(x),/พร้อมเก็บ/);
  await db.query("UPDATE planting_rounds SET status='completed',current_step=8 WHERE id=$1",[x.round]);await assert.rejects(add(x),/สิ้นสุด/);
 });
 await t.test('closed bookings require explicit reopening and a recorded harvest day',async()=>{
  const x=await create();await db.query("UPDATE planting_rounds SET status='booking_closed',booking_closes_at=now() WHERE id=$1",[x.round]);
  await assert.rejects(add(x),/เปิดรับจองอีกครั้ง/);await add(x,{reopen:true});assert.equal(await remaining(x),5);
  const r=(await db.query('SELECT status,booking_closes_at,sold_out_date,current_step FROM planting_rounds WHERE id=$1',[x.round])).rows[0];
  assert.equal(r.status,'booking_open');assert.equal(r.booking_closes_at,null);assert.equal(r.current_step,7);
  const early=await create();await db.query("UPDATE planting_rounds SET status='booking_closed',harvest_sale_date=NULL,current_step=6 WHERE id=$1",[early.round]);
  await assert.rejects(add(early,{reopen:true}),/บันทึกวันพร้อมเก็บ/);
 });
 await t.test('reopening sold-out stock does not reclaim a plot already used by another round',async()=>{
  const x=await create(),p=randomUUID(),other=await create();await db.query('INSERT INTO plots(id) VALUES($1)',[p]);
  for(const item of [x.item,other.item])await db.query('UPDATE round_items SET plot_ids=ARRAY[$1::UUID] WHERE id=$2',[p,item]);
  await db.query("UPDATE planting_rounds SET status='booking_closed',sold_out_date=current_date WHERE id=$1",[x.round]);
  await assert.rejects(add(x,{reopen:true}),/ถูกใช้ในรอบอื่น/);
  assert.equal(Number((await db.query('SELECT additional_qty_kg FROM round_items WHERE id=$1',[x.item])).rows[0].additional_qty_kg),0);
 });
 await t.test('audit or save failure rolls back quantity, reopening and history together',async()=>{
  const x=await create();await db.query("UPDATE planting_rounds SET status='booking_closed' WHERE id=$1",[x.round]);
  await db.exec("CREATE FUNCTION fail_surplus_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'audit failed';END$$;CREATE TRIGGER fail_surplus_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION fail_surplus_audit();");
  await assert.rejects(add(x,{reopen:true}),/audit failed/);await db.exec('DROP TRIGGER fail_surplus_audit ON audit_logs');
  assert.equal((await db.query('SELECT status FROM planting_rounds WHERE id=$1',[x.round])).rows[0].status,'booking_closed');
  assert.equal(Number((await db.query('SELECT additional_qty_kg FROM round_items WHERE id=$1',[x.item])).rows[0].additional_qty_kg),0);
  assert.equal(Number((await db.query('SELECT count(*) AS n FROM round_stock_additions WHERE round_id=$1',[x.round])).rows[0].n),0);
 });
 await t.test('browser roles cannot directly add stock or forge history',async()=>{
  const x=await create();await db.exec('SET ROLE authenticated');
  await assert.rejects(add(x),/permission denied/);
  await assert.rejects(db.exec('DELETE FROM round_stock_additions'),/permission denied/);await db.exec('RESET ROLE');
 });
});
