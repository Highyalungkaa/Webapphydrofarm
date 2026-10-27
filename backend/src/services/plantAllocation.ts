/** Allocate constrained crops first and reroute flexible crops into free selected plots. */
export function allocatePlotSlots(
  plots: {id:string;slot_capacity:number}[],
  items: {selected_plot_ids?:string[];bookable_qty_kg?:number;plant_count?:number|null;crop_id:string}[],
  rates: Record<string,number>, occupied: Record<string,number>,
) {
  type Edge={to:number;reverse:number;capacity:number;initial:number};
  const source=items.length+plots.length,sink=source+1;
  const graph:Edge[][]=Array.from({length:sink+1},()=>[]);
  const edge=(from:number,to:number,capacity:number)=>{
    const forward:Edge={to,reverse:graph[to].length,capacity,initial:capacity};
    const reverse:Edge={to:from,reverse:graph[from].length,capacity:0,initial:0};
    graph[from].push(forward);graph[to].push(reverse);return forward;
  };
  const needs=items.map(item=>Math.max(0,Math.floor(Number(item.plant_count??Math.round(Number(item.bookable_qty_kg||0)*(rates[item.crop_id]||4))))));
  const candidates=items.map(item=>plots.map((p,index)=>item.selected_plot_ids?.includes(p.id)?index:-1).filter(index=>index>=0));
  const priority=items.map((_,index)=>index).sort((a,b)=>candidates[a].length-candidates[b].length||a-b);
  for(const index of priority)edge(source,index,needs[index]);
  const links=items.map((_,index)=>candidates[index].map(plotIndex=>({plotIndex,edge:edge(index,items.length+plotIndex,needs[index])})));
  plots.forEach((p,index)=>edge(items.length+index,sink,Math.max(0,Number(p.slot_capacity)-(occupied[p.id]||0))));
  while(true){
    const parents:Array<{node:number;index:number}|undefined>=Array(graph.length);const queue=[source];parents[source]={node:source,index:0};
    for(let head=0;head<queue.length&&!parents[sink];head++){
      const node=queue[head];graph[node].forEach((e,index)=>{if(e.capacity>0&&!parents[e.to]){parents[e.to]={node,index};queue.push(e.to);}});
    }
    if(!parents[sink])break;
    let amount=Infinity;
    for(let node=sink;node!==source;){const p=parents[node]!;amount=Math.min(amount,graph[p.node][p.index].capacity);node=p.node;}
    for(let node=sink;node!==source;){const p=parents[node]!;const e=graph[p.node][p.index];e.capacity-=amount;graph[e.to][e.reverse].capacity+=amount;node=p.node;}
  }
  const allocatedByItem=links.map(entries=>Object.fromEntries(entries.map(({plotIndex,edge:e})=>[plots[plotIndex].id,e.initial-e.capacity]).filter(([,amount])=>Number(amount)>0)) as Record<string,number>);
  const used={...occupied};const beforeItem:Record<string,number>[]=[];
  allocatedByItem.forEach(allocation=>{beforeItem.push({...used});for(const [id,amount]of Object.entries(allocation))used[id]=(used[id]||0)+amount;});
  const occupiedByOthers=allocatedByItem.map(allocation=>Object.fromEntries(plots.map(p=>[p.id,(used[p.id]||0)-(allocation[p.id]||0)])));
  const unallocatedByItem=needs.map((n,index)=>n-Object.values(allocatedByItem[index]).reduce((sum,n)=>sum+n,0));
  return {beforeItem,allocatedByItem,occupiedByOthers,unallocatedByItem,used};
}

/** Restore saved placement for new rounds; recompute only if its inputs changed. */
export function allocateRecordedPlotSlots(
 plots:{id:string;slot_capacity:number}[],
 items:{selected_plot_ids?:string[];bookable_qty_kg?:number;plant_count?:number|null;crop_id:string}[],
 rates:Record<string,number>,occupied:Record<string,number>,snapshot:Record<string,Record<string,number>>,
){
 const fallback=()=>allocatePlotSlots(plots,items,rates,occupied);
 const used={...occupied};const allocatedByItem:Record<string,number>[]=[];const beforeItem:Record<string,number>[]=[];
 for(const item of items){
  const saved=snapshot[item.crop_id];if(!saved||typeof saved!=='object'||Array.isArray(saved))return fallback();
  const allocation:Record<string,number>={};let count=0;beforeItem.push({...used});
  for(const [id,n]of Object.entries(saved)){
   if(!Number.isSafeInteger(n)||n<0||!plots.some(p=>p.id===id)||!item.selected_plot_ids?.includes(id))return fallback();
   if(n>0)allocation[id]=n;count+=n;used[id]=(used[id]||0)+n;
  }
  const needed=item.plant_count??Math.max(0,Math.round(Number(item.bookable_qty_kg||0)*(rates[item.crop_id]||4)));
  if(count!==needed)return fallback();allocatedByItem.push(allocation);
 }
 if(plots.some(p=>(used[p.id]||0)>Number(p.slot_capacity)))return fallback();
 const occupiedByOthers=allocatedByItem.map(a=>Object.fromEntries(plots.map(p=>[p.id,(used[p.id]||0)-(a[p.id]||0)])));
 return{used,allocatedByItem,beforeItem,occupiedByOthers,unallocatedByItem:items.map(()=>0)};
}
