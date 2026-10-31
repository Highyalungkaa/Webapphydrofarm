const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/054_order_status_steps.sql'),'utf8');
test('order status changes must follow adjacent steps and preserve payment when stepping back',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE TABLE orders(id INTEGER PRIMARY KEY,status TEXT,confirmed_at TIMESTAMPTZ,completed_at TIMESTAMPTZ,requires_confirmation BOOLEAN,payment_status TEXT);INSERT INTO orders VALUES(1,'pending_confirmation',NULL,NULL,true,'paid')`);
 await db.exec(sql);await db.exec(sql);
 for(const status of ['ready','completed','no_show'])await assert.rejects(db.query('UPDATE orders SET status=$1 WHERE id=1',[status]),/ข้ามขั้นตอน|เปลี่ยนสถานะ/);
 for(const status of ['confirmed','ready','completed','ready','confirmed','pending_confirmation'])await db.query('UPDATE orders SET status=$1 WHERE id=1',[status]);
 const row=(await db.query('SELECT * FROM orders WHERE id=1')).rows[0];assert.equal(row.confirmed_at,null);assert.equal(row.completed_at,null);assert.equal(row.payment_status,'paid');
 await db.exec("UPDATE orders SET status='confirmed' WHERE id=1");assert.ok((await db.query('SELECT confirmed_at FROM orders')).rows[0].confirmed_at);
 await assert.rejects(db.exec("UPDATE orders SET status='no_show' WHERE id=1"),/เปลี่ยนสถานะ/);
 await db.exec("UPDATE orders SET status='ready' WHERE id=1;UPDATE orders SET status='no_show' WHERE id=1");await assert.rejects(db.exec("UPDATE orders SET status='ready' WHERE id=1"),/เปิดกลับ/);
 await db.exec("INSERT INTO orders(id,status) VALUES(2,'pending_confirmation');UPDATE orders SET status='cancelled' WHERE id=2");await assert.rejects(db.exec("UPDATE orders SET status='confirmed' WHERE id=2"),/เปิดกลับ/);
});
