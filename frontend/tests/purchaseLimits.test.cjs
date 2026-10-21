const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require(name){if(name.endsWith('/api.js'))return{api:{}};if(!name.startsWith('.'))return require(name);return load(path.resolve(path.dirname(file),name.replace(/\.js$/,'.tsx')));}});return exports;}
const {PurchaseLimitPanel}=load(path.resolve(__dirname,'../src/components/admin/PurchaseLimitPanel.tsx'));
const round={id:'round',status:'booking_open',round_items:[{id:'oak',crop_name:'Green Oak',max_qty_per_order_kg:2.5}]};
const render=(value)=>renderToStaticMarkup(React.createElement(PurchaseLimitPanel,{round:value,onChanged:async()=>{}}));
test('limited rounds clearly identify the per-crop per-order cap without showing derived stock',()=>{const html=render({...round,purchase_limit_enabled:true});assert.match(html,/จำกัดจำนวน/);assert.match(html,/Green Oak สูงสุด 2.5 กก.\/ออเดอร์/);assert.doesNotMatch(html,/กิโลคงเหลือ|น้ำหนักประมาณ/);});
test('a round with limits off offers the explicit action and hides previously stored caps',()=>{const html=render({...round,purchase_limit_enabled:false});assert.match(html,/ยังไม่จำกัดจำนวน/);assert.match(html,/จำกัดจำนวนการซื้อ/);assert.doesNotMatch(html,/สูงสุด 2.5/);});
