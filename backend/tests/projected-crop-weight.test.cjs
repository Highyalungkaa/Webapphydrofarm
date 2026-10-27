const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('planting forecasts snapshot the catalog rate without becoming order stock',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`CREATE TABLE crops(id integer PRIMARY KEY,slots_per_kg numeric);
 CREATE TABLE round_items(id integer PRIMARY KEY,crop_id integer REFERENCES crops(id),plant_count integer,
 planting_plants_per_kg numeric,estimated_qty_kg numeric DEFAULT 0,bookable_qty_kg numeric DEFAULT 0,actual_qty_kg numeric,lost_plant_count integer DEFAULT 0);
 INSERT INTO crops VALUES(1,5),(2,1.1);
 INSERT INTO round_items(id,crop_id,plant_count,estimated_qty_kg) VALUES(0,1,500,777);`);
 const migration=fs.readFileSync(path.resolve(__dirname,'../../supabase/migrations/038_projected_crop_weight.sql'),'utf8');
 await db.exec(migration);await db.exec(migration);
 assert.equal(Number((await db.query('SELECT estimated_qty_kg FROM round_items WHERE id=0')).rows[0].estimated_qty_kg),777);
 await db.exec('INSERT INTO round_items(id,crop_id,plant_count,estimated_qty_kg) VALUES(1,1,503,999),(2,2,33,999),(3,1,2,999)');
 let row=(await db.query('SELECT * FROM round_items WHERE id=1')).rows[0];
 assert.equal(Number(row.estimated_qty_kg),100);assert.equal(Number(row.planting_plants_per_kg),5);
 assert.equal(Number(row.bookable_qty_kg),0);assert.equal(row.actual_qty_kg,null);
 assert.equal(Number((await db.query('SELECT estimated_qty_kg FROM round_items WHERE id=2')).rows[0].estimated_qty_kg),30);
 assert.equal(Number((await db.query('SELECT estimated_qty_kg FROM round_items WHERE id=3')).rows[0].estimated_qty_kg),0);
 await db.exec('UPDATE crops SET slots_per_kg=10 WHERE id=1; UPDATE round_items SET plant_count=510 WHERE id=1');
 row=(await db.query('SELECT * FROM round_items WHERE id=1')).rows[0];assert.equal(Number(row.estimated_qty_kg),102);assert.equal(Number(row.planting_plants_per_kg),5);
 await db.exec('INSERT INTO round_items(id,crop_id,plant_count) VALUES(4,1,500)');
 assert.equal(Number((await db.query('SELECT estimated_qty_kg FROM round_items WHERE id=4')).rows[0].estimated_qty_kg),50);
 await db.exec('UPDATE round_items SET lost_plant_count=50,actual_qty_kg=87.3 WHERE id=1');
 row=(await db.query('SELECT * FROM round_items WHERE id=1')).rows[0];assert.equal(Number(row.estimated_qty_kg),102);assert.equal(Number(row.actual_qty_kg),87.3);
});
