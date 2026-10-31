const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/053_rollback_planting_step.sql'),'utf8');
test('rollback clears confirmed dates atomically and refuses unsafe or stale requests',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT);CREATE TABLE admin_users(email TEXT);
 CREATE TYPE round_status AS ENUM('draft','growing','booking_open','booking_closed','harvested','completed','cancelled');
 CREATE TABLE planting_rounds(id UUID PRIMARY KEY,status round_status,current_step INTEGER,updated_at TIMESTAMPTZ DEFAULT now(),notes TEXT,
 seed_date DATE,fertilizing_date DATE,planting_start_date DATE,transplant_date DATE,planted_at DATE NOT NULL,
 expected_harvest_date DATE NOT NULL,fulfillment_date DATE NOT NULL,booking_opens_at TIMESTAMPTZ NOT NULL,booking_closes_at TIMESTAMPTZ,
 harvest_sale_date DATE,sold_out_date DATE,completed_date DATE,closure_reason TEXT);
 CREATE TABLE round_items(id UUID PRIMARY KEY,round_id UUID,crop_id UUID,plot_ids UUID[]);
 CREATE TABLE orders(id UUID PRIMARY KEY,round_id UUID,status TEXT DEFAULT 'confirmed');CREATE TABLE order_items(order_id UUID,round_item_id UUID);
 CREATE TABLE plant_losses(round_id UUID,voided_at TIMESTAMPTZ);
 CREATE TABLE plots(id UUID PRIMARY KEY,crop_id UUID,crop_ids UUID[]);
 CREATE TABLE audit_logs(actor_id UUID,actor_email TEXT,entity_type TEXT,entity_id TEXT,action TEXT,old_data JSONB,new_data JSONB);`);
 await db.exec(migration);await db.exec(migration);
 const actor=randomUUID(),outsider=randomUUID();await db.query("INSERT INTO auth.users VALUES($1,'admin@example.com'),($2,'other@example.com')",[actor,outsider]);await db.exec("INSERT INTO admin_users VALUES('admin@example.com')");
 const create=async(step,status='draft')=>{const id=randomUUID();await db.query(`INSERT INTO planting_rounds(id,current_step,status,seed_date,fertilizing_date,planting_start_date,transplant_date,planted_at,expected_harvest_date,fulfillment_date,booking_opens_at,harvest_sale_date,notes)
 VALUES($1,$2,$3,'2026-10-01','2026-10-08','2026-10-15','2026-10-16','2026-10-16','2026-11-16','2026-11-16','2026-10-20','2026-11-16',$4)`,[id,step,status,JSON.stringify({bookingCreated:true,cropPlotIds:{},note:'keep this note'})]);return id;};
 const version=async id=>(await db.query('SELECT updated_at::TEXT AS v FROM planting_rounds WHERE id=$1',[id])).rows[0].v;
 const rollback=async(id,who=actor,v=null)=>(await db.query('SELECT rollback_planting_step($1,$2,$3) AS r',[who,id,v||await version(id)])).rows[0].r;
 await t.test('returning to step one clears this step and later dates but keeps notes',async()=>{const id=await create(2);const r=await rollback(id);assert.equal(r.current_step,1);for(const k of ['seed_date','fertilizing_date','planting_start_date','transplant_date','planted_at','expected_harvest_date','fulfillment_date','booking_opens_at','harvest_sale_date','sold_out_date'])assert.equal(r[k],null,k);assert.equal(JSON.parse(r.notes).note,'keep this note');});
 await t.test('returning to actual planting clears its date and derived schedules',async()=>{const id=await create(5,'growing'),r=await rollback(id);assert.equal(r.current_step,4);assert.equal(r.status,'draft');assert.equal(r.transplant_date,null);assert.equal(r.expected_harvest_date,null);assert.equal(r.planting_start_date,'2026-10-15');});
 await t.test('booking confirmation can be undone before orders exist',async()=>{const id=await create(6,'booking_open'),r=await rollback(id);assert.equal(r.current_step,5);assert.equal(r.booking_opens_at,null);assert.equal(r.status,'growing');assert.equal(JSON.parse(r.notes).bookingCreated,false);});
 await t.test('orders and loss history prevent undoing their prerequisites',async()=>{const id=await create(6,'booking_open');await db.query('INSERT INTO orders VALUES($1,$2)',[randomUUID(),id]);await assert.rejects(rollback(id),/คำสั่งจอง/);const planted=await create(5,'growing');await db.query('INSERT INTO plant_losses VALUES($1,NULL)',[planted]);await assert.rejects(rollback(planted),/ผักเสียหาย/);});
 await t.test('repeated confirmation and unauthorized or finished rounds are rejected',async()=>{const id=await create(3),v=await version(id);await assert.rejects(rollback(id,outsider),/ไม่มีสิทธิ์/);await rollback(id,actor,v);await assert.rejects(rollback(id,actor,v),/เปลี่ยนแปลง/);await assert.rejects(rollback(await create(8,'completed')),/สิ้นสุด/);});
 await t.test('ready-to-harvest date is removed when returning from step seven',async()=>{const r=await rollback(await create(7,'booking_open'));assert.equal(r.current_step,6);assert.equal(r.harvest_sale_date,null);assert.notEqual(r.transplant_date,null);});
 await t.test('sold-out undo preserves harvest date but refuses plots reused by another active round',async()=>{const id=await create(7,'booking_closed');await db.query("UPDATE planting_rounds SET sold_out_date='2026-11-17' WHERE id=$1",[id]);const r=await rollback(id);assert.equal(r.current_step,7);assert.equal(r.sold_out_date,null);assert.equal(r.status,'booking_open');assert.notEqual(r.harvest_sale_date,null);
 const crop=randomUUID(),plot=randomUUID(),other=await create(4);await db.query('INSERT INTO plots VALUES($1,$2,ARRAY[$2::UUID])',[plot,crop]);for(const round of [id,other])await db.query('INSERT INTO round_items VALUES($1,$2,$3,ARRAY[$4::UUID])',[randomUUID(),round,crop,plot]);await db.query("UPDATE planting_rounds SET sold_out_date='2026-11-17' WHERE id=$1",[id]);await assert.rejects(rollback(id),/ถูกใช้ในรอบอื่น/);});
});
