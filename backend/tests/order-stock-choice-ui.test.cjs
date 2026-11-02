const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{randomUUID}=require('node:crypto');
const React=require('node:module').createRequire(path.resolve(__dirname,'../../frontend/package.json'))('react');
test('reducing an order requires a stock choice and changing it invalidates the preview',async()=>{
 const states=[],refs=[],calls=[];let stateIndex=0,refIndex=0,saved=0;
 const order={id:'order',updated_at:'2026-11-03T00:00:00Z',order_items:[{qty_kg:8,round_items:{crops:{id:'crop',name:'Oak'}}}]};
 const exports={};const source=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../frontend/src/components/admin/EditOrderItems.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 vm.runInNewContext(source+'\nexports.EditorForTest=Editor;',{
  exports,crypto:{randomUUID},require:name=>{
   if(name==='react')return{...React,useEffect(){},useState(initial){const index=stateIndex++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return[states[index],next=>{states[index]=typeof next==='function'?next(states[index]):next;}];},useRef(initial){const index=refIndex++;return refs[index]||(refs[index]={current:initial});}};
   if(name.endsWith('/bookingQuantity.js'))return{formatKg:value=>String(value)};
   return{api:{post:async(url,body)=>{calls.push({url,body});return{data:{return_stock:body.return_stock,preview_token:'a'.repeat(32),items:[],stock_adjustments:[],total_amount:250,previous_total_amount:400}};}}};
  },
 });
 const render=()=>{stateIndex=0;refIndex=0;return exports.EditorForTest({order,onClose(){},onSaved:async()=>saved++});};
 function nodes(element){return !element||typeof element!=='object'?[]:[element,...React.Children.toArray(element.props?.children).flatMap(nodes)];}
 const text=element=>typeof element==='string'?element:!element?.props?'':React.Children.toArray(element.props.children).map(text).join('');
 function button(tree,label){const found=nodes(tree).find(node=>node.type==='button'&&text(node)===label);assert.ok(found,label);return found;}
 render();states[0]={crop:'5'};states[1]=[{id:'crop',name:'Oak',available:0}];states[2]='Customer agreed';states[6]=false;
 await button(render(),'ตรวจสอบสต๊อกและยอดใหม่').props.onClick();assert.equal(calls.length,0);assert.match(states[3],/เลือกว่าจะคืนสต็อก/);
 const noReturn=nodes(render()).find(node=>node.type==='button'&&text(node).startsWith('ไม่คืนสต็อก'));noReturn.props.onClick();
 await button(render(),'ตรวจสอบสต๊อกและยอดใหม่').props.onClick();assert.equal(calls[0].body.return_stock,false);assert.ok(states[5]);const firstRequest=calls[0].body.request_id;
 const giveBack=nodes(render()).find(node=>node.type==='button'&&text(node).startsWith('คืนสต็อก'));giveBack.props.onClick();assert.equal(states[5],null);assert.equal(button(render(),'บันทึกการแก้ไขรายการ').props.disabled,true);
 await button(render(),'ตรวจสอบสต๊อกและยอดใหม่').props.onClick();assert.equal(calls[1].body.return_stock,true);assert.notEqual(calls[1].body.request_id,firstRequest);
 await button(render(),'บันทึกการแก้ไขรายการ').props.onClick();assert.equal(calls[2].body.return_stock,true);assert.equal(calls[2].body.preview_token,'a'.repeat(32));assert.equal(saved,1);
});
