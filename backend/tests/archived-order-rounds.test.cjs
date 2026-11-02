const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const React=require('node:module').createRequire(path.resolve(__dirname,'../../frontend/package.json'))('react');
function load(file,requireMock){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:requireMock});return exports;}
const helper=load('../../frontend/src/lib/archivedOrderRounds.ts'),report=load('../../frontend/src/lib/orderReport.ts');
const rounds=[{id:'a',name:'Round A'},{id:'b',name:'Round B'}];
const line=(round,discount=0)=>({round_items:{round_id:round,planting_rounds:rounds.find(r=>r.id===round)},discount_amount:discount});
const orders=[{id:'pooled',round_id:'a',status:'completed',order_items:[line('a',5),line('a'),line('b')]},{id:'legacy',round_id:'a',status:'completed',order_items:[]},{id:'cancelled',round_id:'b',status:'cancelled',order_items:[line('b')]}];
test('round counts use actual pooled sources once, with legacy anchor fallback',()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(helper.archivedOrderRoundOptions(orders,rounds))),[{id:'a',name:'Round A',count:2},{id:'b',name:'Round B',count:2}]);
 const moved={round_id:'obsolete-anchor',order_items:[line('b')]};assert.deepEqual([...helper.archivedOrderRoundIds(moved)],['b']);
 assert.equal(helper.archivedOrderRoundOptions([moved],[])[0].name,'Round B');
 assert.equal(helper.archivedOrderRoundOptions([{round_id:'unknown-round',order_items:[]}],[])[0].count,1);
});
test('history round dropdown filters cards and totals together with discount and text filters',()=>{
 let index=0;const states=[[],[],orders,rounds,'',false,'','','all','all','orders'];
 const {AdminRoundsHistoryPage}=load('../../frontend/src/pages/admin/AdminRoundsHistoryPage.tsx',name=>{
  if(name==='react')return{...React,useEffect(){},useState(initial){const n=index++;if(!(n in states))states[n]=typeof initial==='function'?initial():initial;return[states[n],value=>{states[n]=value;}];}};
  if(name==='react-router-dom')return{useSearchParams:()=>[new URLSearchParams('section=orders')],Link:()=>null};
  if(name.endsWith('/archivedOrderRounds.js'))return helper;if(name.endsWith('/orderReport.js'))return report;
  if(name.endsWith('/useLiveRefresh.js'))return{useLiveRefresh(){}};
  return new Proxy({},{get:()=>()=>null});
 });
 const render=()=>{index=0;return AdminRoundsHistoryPage();};
 const nodes=element=>!element||typeof element!=='object'?[]:[element,...React.Children.toArray(element.props?.children).flatMap(nodes)];
 const text=element=>typeof element==='string'||typeof element==='number'?String(element):!element?.props?'':React.Children.toArray(element.props.children).map(text).join('');
 const cards=tree=>nodes(tree).filter(node=>node.type?.name==='ArchivedOrderCard').map(node=>node.props.order.id);
 let tree=render();assert.deepEqual(cards(tree),['pooled','legacy','cancelled']);
 nodes(tree).find(node=>node.props?.id==='archived-order-round').props.onChange({target:{value:'b'}});
 tree=render();assert.deepEqual(cards(tree),['pooled','cancelled']);assert.match(text(nodes(tree).find(node=>node.props?.role==='status')),/Round B · พบ 2 ออเดอร์/);
 const discount=nodes(tree).find(node=>node.type==='select'&&React.Children.toArray(node.props.children).some(option=>option.props?.value==='discounted'));
 discount.props.onChange({target:{value:'discounted'}});tree=render();assert.deepEqual(cards(tree),['pooled']);assert.match(text(nodes(tree).find(node=>node.props?.role==='status')),/พบ 1 ออเดอร์/);
 nodes(tree).find(node=>node.type==='input'&&node.props.type==='text').props.onChange({target:{value:'not-found'}});
 tree=render();assert.deepEqual(cards(tree),[]);assert.match(text(nodes(tree).find(node=>node.props?.role==='status')),/พบ 0 ออเดอร์/);
});
