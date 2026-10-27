// Explicit opt-in smoke checks of GET handlers. Writes/RPC mutations are blocked.
if(process.env.HYDROFARM_READONLY_AUDIT!=='1')throw Error('Set HYDROFARM_READONLY_AUDIT=1 for the read-only production audit');
const {supabaseAdmin}=require('./dist/config/supabase.js');
const originalFrom=supabaseAdmin.from.bind(supabaseAdmin);
supabaseAdmin.from=table=>{const query=originalFrom(table);for(const method of ['insert','upsert','update','delete'])query[method]=()=>{throw Error('Read-only audit blocked '+method);};return query;};
supabaseAdmin.rpc=()=>{throw Error('Read-only audit blocked RPC');};
(async()=>{
 const {data:rounds,error}=await supabaseAdmin.from('planting_rounds').select('id').limit(1);if(error)throw Error(error.code);
 const roundId=rounds?.[0]?.id;
 const entries=[...['crops','rounds','farm','plots','orders','customers','admins','settings','audit'].map(name=>['admin/'+name,'/',{}]),
  ['admin/reports','/export-data',{}],['equipment','/products',{}],['equipment','/shipping',{}],['equipment','/payment-settings',{}],
  ['equipment','/admin/products',{}],['equipment','/admin/orders',{}],['equipment','/admin/reports',{}],['equipment','/admin/reports/export',{}],
  ['rounds','/catalog',{}],['rounds','/open',{}],['settings','/contact',{}],['districts','/',{}],
  ...(roundId?[['admin/rounds','/:id',{id:roundId}],['admin/plantLosses','/:id/losses',{id:roundId}],['admin/unsoldRounds','/:id/unsold',{id:roundId}],['admin/stock','/:id/stock',{id:roundId}]]:[])];
 let failures=0;
 for(const [module,route,params]of entries){let status=200,completed=false;const router=require('./dist/routes/'+module+'.js').default;
  const layer=router.stack.find(layer=>layer.route?.path===route&&layer.route.methods.get);if(!layer)throw Error('Unknown GET '+module+' '+route);
  const req={params,query:module==='equipment'&&route==='/admin/reports/export'?{period:'all'}:{},headers:{},user:{id:'readonly-audit',email:'readonly-audit',isAdmin:true}};
  const res={status(code){status=code;return this;},json(body){completed=true;console.log(JSON.stringify({module,route,status,rows:Array.isArray(body)?body.length:undefined}));if(status>=400)failures++;
    if(module==='admin/reports'&&status===200){const closed=new Set(body.rounds.filter(r=>['completed','cancelled'].includes(r.status)).map(r=>r.id));
      const activeOnClosed=body.orders.filter(o=>!['completed','cancelled','no_show'].includes(o.status)&&(closed.has(o.round_id)||(o.order_items||[]).some(i=>closed.has(i.round_items?.round_id))));
      const amountMismatch=body.orders.filter(o=>Math.abs(Number(o.total_amount)-(o.order_items||[]).reduce((sum,i)=>sum+Math.round(Number(i.qty_kg)*Number(i.price_per_kg)*100)/100-Number(i.discount_amount||0),0))>0.011);
      const missingCompletionDate=body.orders.filter(o=>o.status==='completed'&&!o.completed_at);
      console.log(JSON.stringify({dataIntegrity:{activeOrdersOnClosedRounds:activeOnClosed.length,orderTotalsNotMatchingItems:amountMismatch.length,completedOrdersMissingCompletionDate:missingCompletionDate.length}}));
    }
  }};
  try{await layer.route.stack.at(-1).handle(req,res);}catch{failures++;console.log(JSON.stringify({module,route,status:'exception'}));}
  if(!completed&&status===200)throw Error('GET did not respond');
 }
 console.log(JSON.stringify({checked:entries.length,failures}));if(failures)process.exitCode=1;
})().catch(error=>{console.error('Readonly audit failed',error.message);process.exitCode=1;});
