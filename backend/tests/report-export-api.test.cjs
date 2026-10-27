const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),ts=require('typescript');
function setup(rows={},failure=null){
 const routes=new Map(),middleware=[],requests=[],auth=()=>{},admin=()=>{},expiry=()=>{};
 const router={use:(...handlers)=>middleware.push(...handlers),get:(path,handler)=>routes.set(path,handler)};
 const db={from(table){const q={select(fields){requests.push({table,fields});return q;},order(){return q;},in(){return q;},async range(start,end){return {data:(rows[table]||[]).slice(start,end+1),error:failure===table?{message:'query failed'}:null};}};return q;}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/routes/admin/reports.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,console:{error(){}},require(name){if(name==='express')return{Router:()=>router};if(name.endsWith('/supabase.js'))return{supabaseAdmin:db};if(name.endsWith('/auth.js'))return{requireAuth:auth,requireAdmin:admin};if(name.endsWith('/orderExpiry.js'))return{reconcileOrderExpiry:expiry};throw Error(name);}});
 return{middleware,auth,admin,expiry,requests,async get(){const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;}};await routes.get('/export-data')({},res);return res;}};
}
test('complete exports require admin authentication and reconciliation, and page every source beyond 1,000 rows',async()=>{
 const rows=Array.from({length:1205},(_,id)=>({id}));const app=setup({orders:rows,planting_rounds:rows,plant_losses:rows,audit_logs:rows});
 assert.deepEqual(app.middleware,[app.auth,app.admin,app.expiry]);const res=await app.get();assert.equal(res.statusCode,200);
 for(const key of ['orders','rounds','losses','audits'])assert.equal(res.body[key].length,1205);
 assert.match(app.requests.find(r=>r.table==='orders').fields,/planting_rounds!orders_round_id_fkey/);
 assert.doesNotMatch(app.requests.find(r=>r.table==='plant_losses').fields,/image_path/);
});
test('a failed history source aborts the whole export rather than exporting partial data as zero',async()=>{
 const app=setup({orders:[{id:'o'}]},'round_unsold_items');const res=await app.get();assert.equal(res.statusCode,500);assert.match(res.body.error,/ไม่ครบ/);assert.equal(res.body.orders,undefined);
});
