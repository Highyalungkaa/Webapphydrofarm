const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const migration=name=>fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations',name),'utf8');
const identity=`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE SCHEMA storage;
 CREATE TABLE auth.users(id UUID PRIMARY KEY,email TEXT);CREATE TABLE public.admin_users(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),email TEXT UNIQUE);
 CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::UUID$$;
 CREATE FUNCTION public.is_admin() RETURNS BOOLEAN LANGUAGE SQL AS $$SELECT false$$;
 CREATE TYPE public.payment_status AS ENUM('unpaid','paid');
 CREATE TABLE public.profiles(id UUID PRIMARY KEY REFERENCES auth.users(id),email TEXT,no_show_count INTEGER DEFAULT 0,updated_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE public.audit_logs(id UUID DEFAULT gen_random_uuid(),actor_id UUID,actor_email TEXT,entity_type TEXT,entity_id TEXT,action TEXT,old_data JSONB,new_data JSONB,created_at TIMESTAMPTZ DEFAULT now());`;

test('account and no-show guards run in PostgreSQL with real roles and rollback',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(identity+`
 CREATE TABLE public.orders(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),customer_id UUID REFERENCES profiles(id),status TEXT,payment_status public.payment_status DEFAULT 'unpaid',note TEXT,updated_at TIMESTAMPTZ DEFAULT now(),created_at TIMESTAMPTZ DEFAULT now());
 CREATE TABLE public.order_items(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID REFERENCES orders(id));
 GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role;GRANT ALL ON profiles,orders,order_items TO authenticated,service_role;
 ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;CREATE POLICY owner_profile ON profiles TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());
 ALTER TABLE orders ENABLE ROW LEVEL SECURITY;CREATE POLICY owner_order ON orders TO authenticated USING(customer_id=auth.uid()) WITH CHECK(customer_id=auth.uid());`);
 const customer=randomUUID(),order=randomUUID();await db.query("INSERT INTO auth.users VALUES($1,'customer@example.com')",[customer]);await db.query('INSERT INTO profiles(id,email) VALUES($1,$2)',[customer,'customer@example.com']);await db.query("INSERT INTO orders(id,customer_id,status) VALUES($1,$2,'confirmed')",[order,customer]);
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[customer]);await db.exec('SET ROLE authenticated');
 // Demonstrate the original policy allows owner edits of protected payment fields.
 await db.query("UPDATE orders SET payment_status='paid' WHERE id=$1",[order]);await db.exec('RESET ROLE');
 await db.exec(migration('043_audit_account_and_order_guards.sql'));await db.exec(migration('043_audit_account_and_order_guards.sql'));
 await t.test('a customer may read owned rows but cannot forge payment, insert orders or reset no-shows directly',async()=>{
  await db.exec('SET ROLE authenticated');assert.equal((await db.query('SELECT * FROM orders')).rows.length,1);
  for(const sql of ["UPDATE orders SET payment_status='paid'",'UPDATE profiles SET no_show_count=0',`INSERT INTO orders(customer_id,status) VALUES('${customer}','confirmed')`])await assert.rejects(db.exec(sql),/permission denied/);
  await db.exec('RESET ROLE');
 });
 await t.test('a no-show is counted only once even after repeated saves and status corrections',async()=>{
  for(const status of ['no_show','no_show','confirmed','no_show'])await db.query('UPDATE orders SET status=$1 WHERE id=$2',[status,order]);
  assert.equal((await db.query('SELECT no_show_count FROM profiles WHERE id=$1',[customer])).rows[0].no_show_count,1);
 });
 await t.test('a failed status update rolls back the no-show counter and two orders increment without lost writes',async()=>{
  const a=randomUUID(),b=randomUUID();await db.query("INSERT INTO orders(id,customer_id,status) VALUES($1,$3,'confirmed'),($2,$3,'confirmed')",[a,b,customer]);
  await db.exec(`CREATE FUNCTION fail_order_update() RETURNS TRIGGER LANGUAGE plpgsql AS $$BEGIN IF NEW.note='fail' THEN RAISE EXCEPTION 'simulated failure';END IF;RETURN NEW;END$$;
   CREATE TRIGGER z_fail_order_update BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION fail_order_update();`);
  await assert.rejects(db.query("UPDATE orders SET status='no_show',note='fail' WHERE id=$1",[a]),/simulated failure/);
  assert.equal((await db.query('SELECT no_show_count FROM profiles WHERE id=$1',[customer])).rows[0].no_show_count,1);
  await Promise.all([a,b].map(id=>db.query("UPDATE orders SET status='no_show' WHERE id=$1",[id])));
  assert.equal((await db.query('SELECT no_show_count FROM profiles WHERE id=$1',[customer])).rows[0].no_show_count,3);
 });
 await t.test('bulk or sequential removal cannot delete the final administrator',async()=>{
  await db.query("INSERT INTO admin_users(email) VALUES('a@example.com'),('b@example.com')");
  await assert.rejects(db.exec('DELETE FROM admin_users'),/อย่างน้อย 1/);assert.equal((await db.query('SELECT count(*) AS n FROM admin_users')).rows[0].n,2);
  await db.exec("DELETE FROM admin_users WHERE email='a@example.com'");await assert.rejects(db.exec('DELETE FROM admin_users'),/อย่างน้อย 1/);
 });
});

test('round closure and plot/farm capacity guards execute against stored source rounds and allocations',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE app_settings(key TEXT PRIMARY KEY,value JSONB);
 CREATE TABLE plots(id UUID PRIMARY KEY,name TEXT,slot_capacity INTEGER,crop_id UUID,crop_ids UUID[]);
 CREATE TABLE planting_rounds(id UUID PRIMARY KEY,status TEXT,current_step INTEGER DEFAULT 4,notes TEXT,completed_date DATE,sold_out_date DATE);
 CREATE TABLE round_items(id UUID PRIMARY KEY,round_id UUID,crop_id UUID,plant_count INTEGER,plot_ids UUID[]);
 CREATE TABLE orders(id UUID PRIMARY KEY,round_id UUID,status TEXT,payment_status TEXT);
 CREATE TABLE order_items(id UUID PRIMARY KEY,order_id UUID,round_item_id UUID);`);
 await db.exec(migration('045_audit_round_and_plot_capacity.sql'));await db.exec(migration('045_audit_round_and_plot_capacity.sql'));
 const plot=randomUUID(),crop=randomUUID(),round=randomUUID(),source=randomUUID(),item=randomUUID(),order=randomUUID();
 await db.exec("INSERT INTO app_settings VALUES('farm_total_slots','100'::JSONB)");await db.query('INSERT INTO plots(id,slot_capacity,crop_id,crop_ids) VALUES($1,100,$2,ARRAY[$2::UUID])',[plot,crop]);
 await db.query("INSERT INTO planting_rounds(id,status,notes) VALUES($1,'growing',$3),($2,'booking_open','{}')",[round,source,JSON.stringify({cropPlotAllocations:{[crop]:{[plot]:100}}})]);
 await db.query('INSERT INTO round_items VALUES($1,$2,$3,100,ARRAY[$4::UUID])',[item,round,crop,plot]);
 await db.query("INSERT INTO orders VALUES($1,$2,'confirmed','unpaid')",[order,source]);await db.query('INSERT INTO order_items VALUES($1,$2,$3)',[randomUUID(),order,item]);
 await t.test('closing any source of an unfinished pooled order is rejected, even when it is not the anchor',async()=>{
  for(const id of [round,source])await assert.rejects(db.query("UPDATE planting_rounds SET status='completed' WHERE id=$1",[id]),/ออเดอร์ค้าง/);
  await db.query("UPDATE orders SET status='completed' WHERE id=$1",[order]);await assert.rejects(db.query("UPDATE planting_rounds SET status='completed' WHERE id=$1",[round]),/ยังไม่รับเงิน/);
  await db.query("UPDATE orders SET status='confirmed' WHERE id=$1",[order]);
 });
 await t.test('in-use plots cannot be deleted or shrunk below their recorded planted count',async()=>{
  await assert.rejects(db.query('DELETE FROM plots WHERE id=$1',[plot]),/ใช้งานอยู่/);
  await assert.rejects(db.query('UPDATE plots SET slot_capacity=99 WHERE id=$1',[plot]),/ลดความจุ/);
 });
 await t.test('farm settings cannot undercut allocated plots and a second capacity allocation cannot exceed the quota',async()=>{
  await assert.rejects(db.exec("UPDATE app_settings SET value='99'::JSONB WHERE key='farm_total_slots'"),/เกินความจุ/);
  await assert.rejects(db.query('INSERT INTO plots(id,slot_capacity) VALUES($1,1)',[randomUUID()]),/เกินความจุ/);
 });
 await t.test('terminal settled orders allow closure, then the plot may be removed if there is no history FK',async()=>{
  await db.query("UPDATE orders SET status='completed',payment_status='paid' WHERE id=$1",[order]);
  await db.query("UPDATE planting_rounds SET status='completed' WHERE id=ANY($1::UUID[])",[[round,source]]);
  await db.query('DELETE FROM plots WHERE id=$1',[plot]);assert.equal((await db.query('SELECT count(*) AS n FROM plots')).rows[0].n,0);
 });
});

test('equipment stock, retries, shipping and cancellation are transactional in PostgreSQL',async t=>{
 const db=new PGlite();t.after(()=>db.close());await db.exec(identity+`
 CREATE FUNCTION public.uuid_generate_v4() RETURNS UUID LANGUAGE SQL AS $$SELECT gen_random_uuid()$$;
 CREATE TABLE public.app_settings(key TEXT PRIMARY KEY,value JSONB,description TEXT);
 CREATE TABLE storage.buckets(id TEXT PRIMARY KEY,name TEXT,public BOOLEAN,file_size_limit BIGINT,allowed_mime_types TEXT[]);
 CREATE TABLE storage.objects(bucket_id TEXT,name TEXT);`);
 for(const name of ['016_equipment_store.sql','018_equipment_shipping_fee_and_cod.sql','020_equipment_shipping_updates.sql','028_equipment_transfer_payment.sql'])await db.exec(migration(name));
 const payment=migration('030_protect_orders_and_payment_completion.sql');await db.exec(payment.slice(payment.indexOf('CREATE OR REPLACE FUNCTION public.require_payment_before_completion()'),payment.indexOf('DROP TRIGGER IF EXISTS require_payment_before_completion ON public.orders;')));
 await db.exec('CREATE TRIGGER require_payment_before_completion BEFORE INSERT OR UPDATE ON equipment_orders FOR EACH ROW EXECUTE FUNCTION require_payment_before_completion()');
 await db.exec(migration('044_audit_equipment_transactions.sql'));await db.exec(migration('044_audit_equipment_transactions.sql'));
 const customer=randomUUID(),admin=randomUUID(),product=randomUUID();await db.query("INSERT INTO auth.users VALUES($1,'member@example.com'),($2,'admin@example.com')",[customer,admin]);
 await db.query("INSERT INTO profiles(id) VALUES($1)",[customer]);await db.exec("INSERT INTO admin_users(email) VALUES('admin@example.com')");
 await db.query("INSERT INTO equipment_products(id,name,category,sku,price,stock_quantity) VALUES($1,'Pot','Tools','POT',100,100)",[product]);await db.exec("INSERT INTO app_settings(key,value) VALUES('equipment_shipping_fee','20'::jsonb)");
 const read=async id=>(await db.query('SELECT *,updated_at::TEXT AS version FROM equipment_orders WHERE id=$1',[id])).rows[0];
 const stock=async()=>(await db.query('SELECT stock_quantity FROM equipment_products WHERE id=$1',[product])).rows[0].stock_quantity;
 const create=async(request=randomUUID(),items=[{product_id:product,quantity:3}],actor=customer)=>(await db.query("SELECT create_equipment_order($1,$2,'123 Bangkok','0812345678','cash_on_delivery',NULL,NULL,$3) AS id",[actor,JSON.stringify(items),request])).rows[0].id;
 const save=async(id,payload,expected,actor=admin)=>(await db.query('SELECT save_equipment_order($1,$2,$3,$4) AS result',[actor,id,expected??(await read(id)).version,JSON.stringify(payload)])).rows[0].result;
 await t.test('retrying an identical checkout returns one order and deducts stock exactly once',async()=>{
  const request=randomUUID(),before=await stock(),a=await create(request),b=await create(request);assert.equal(a,b);assert.equal(await stock(),before-3);assert.equal(Number((await read(a)).total_amount),320);
  await assert.rejects(create(request,[{product_id:product,quantity:4}]),/ข้อมูลอื่น/);
 });
 await t.test('repeated products, insufficient stock and missing transfer receipts do not create partial orders',async()=>{
  const before=await stock();await assert.rejects(create(undefined,[{product_id:product,quantity:1},{product_id:product,quantity:1}]),/ซ้ำ/);
  await assert.rejects(create(undefined,[{product_id:product,quantity:999}]),/ไม่เพียงพอ/);
  await assert.rejects(db.query("SELECT create_equipment_order($1,$2,'123 Bangkok','0812345678','transfer',NULL,NULL,$3)",[customer,JSON.stringify([{product_id:product,quantity:1}]),randomUUID()]));assert.equal(await stock(),before);
 });
 await t.test('an outdated displayed price or shipping fee rolls back both the order and stock deduction',async()=>{
  const before=await stock();await assert.rejects(db.query("SELECT create_equipment_order($1,$2,'123 Bangkok','0812345678','cash_on_delivery',NULL,NULL,$3,1)",[customer,JSON.stringify([{product_id:product,quantity:3}]),randomUUID()]),/ราคาสินค้าหรือค่าส่งเปลี่ยน/);assert.equal(await stock(),before);
 });
 await t.test('a cancelled order cannot be revived by another admin with an outdated form',async()=>{
  const id=await create(),version=(await read(id)).version,before=await stock();await save(id,{status:'cancelled'},version);assert.equal(await stock(),before+3);
  await assert.rejects(save(id,{status:'confirmed'},version),/หน้าอื่น/);await assert.rejects(db.query("UPDATE equipment_orders SET status='confirmed' WHERE id=$1",[id]),/ข้ามขั้น/);
  await save(id,{status:'cancelled'});assert.equal(await stock(),before+3);
 });
 await t.test('a later save failure rolls back cancellation and its inventory refund',async()=>{
  const id=await create(),before=await stock();await assert.rejects(save(id,{status:'cancelled',payment_status:'invalid'}));assert.equal((await read(id)).status,'pending_confirmation');assert.equal(await stock(),before);
 });
 await t.test('shipping requires complete proof, completion requires payment, and paid dates stay stable',async()=>{
  const id=await create();await assert.rejects(save(id,{status:'shipped'}),/ข้ามขั้น/);await save(id,{status:'confirmed'});await save(id,{status:'processing'});
  await assert.rejects(save(id,{status:'shipped',tracking_number:'TRACK'}),/หลักฐาน/);
  await save(id,{status:'shipped',tracking_number:'TRACK',delivery_update_image_url:'https://example.com/proof.png',delivery_update_message:'Sent'});
  await assert.rejects(save(id,{tracking_number:null}),/เลขพัสดุ/);await assert.rejects(save(id,{status:'completed'}),/ชำระเงิน/);
  await save(id,{status:'completed',payment_status:'paid'});const paid=(await read(id)).paid_at;await save(id,{payment_status:'paid'});assert.equal((await read(id)).paid_at.toISOString(),paid.toISOString());
  await assert.rejects(save(id,{payment_status:'unpaid'}),/ชำระเงิน/);await assert.rejects(save(id,{tracking_number:'OTHER'},undefined,customer),/ไม่มีสิทธิ์/);
 });
});
