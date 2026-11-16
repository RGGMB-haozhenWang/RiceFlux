import {callOf} from './catalog.js';
import {chromNum} from './exchange.js';

// Descriptive statistics: no trait direction, significance test or causal score.
export function percentile(value,values){
  const xs=values.filter(Number.isFinite);
  if(!Number.isFinite(value)||!xs.length)return null;
  return 100*(xs.filter(x=>x<value).length+xs.filter(x=>x===value).length/2)/xs.length;
}
export function dosage(sample,marker){
  if(!marker)return null;
  const [a,b]=callOf(sample,marker);
  return a===null||b===null?null:a+b;
}
export function linkage(cohort,a,b){
  const pairs=cohort.map(s=>[dosage(s,a),dosage(s,b)]).filter(p=>p.every(Number.isFinite));
  const n=pairs.length,mx=pairs.reduce((s,p)=>s+p[0],0)/n,my=pairs.reduce((s,p)=>s+p[1],0)/n;
  let xx=0,yy=0,xy=0;
  for(const [x,y] of pairs){xx+=(x-mx)**2;yy+=(y-my)**2;xy+=(x-mx)*(y-my);}
  const status=n<3?'too_few':!xx||!yy?'fixed':'estimated';
  return {n,total:cohort.length,missing:cohort.length-n,maf_a:n?Math.min(mx/2,1-mx/2):null,maf_b:n?Math.min(my/2,1-my/2):null,
    r2:status==='estimated'?Math.min(1,Math.max(0,xy*xy/(xx*yy))):null,status,
    distance_bp:a&&b&&chromNum(a.chromosome)===chromNum(b.chromosome)?Math.abs(a.pos-b.pos):null};
}
export function linkageRows(cohort,genes,markers){
  const strata=new Map();
  for(const s of cohort){const key=JSON.stringify([s.dataset_id||'',s.source_group||s.population_id]);if(!strata.has(key))strata.set(key,[]);strata.get(key).push(s);}
  const rows=[];
  for(let i=0;i<markers.length;i++)for(let j=i+1;j<markers.length;j++)if(markers[i]&&markers[j]){
    for(const [key,samples] of strata){const [dataset_id,source_group]=JSON.parse(key);rows.push({dataset_id,source_group,gene_a:genes[i].name,gene_b:genes[j].name,marker_a:markers[i].id,marker_b:markers[j].id,...linkage(samples,markers[i],markers[j])});}
  }
  return rows;
}
export function phenotypeAxes(data){
  return data.traits.flatMap(t=>(t.environments||[]).map(e=>({...e,trait_id:t.id,trait_name:t.name,label:[t.name,e.assay,e.source.site,e.source.year,e.unit].join(' · ')})));
}
export function radarRows(samples,reference,axes){
  return axes.flatMap(e=>{
    const values=reference.map(s=>s.phenotypes[e.id]).filter(Number.isFinite);
    return samples.map(s=>({sample_id:s.id,name:s.name,dataset_id:s.dataset_id,trait_id:e.trait_id,environment_id:e.id,assay:e.assay,site:e.source.site,year:e.source.year,unit:e.unit,
      value:s.phenotypes[e.id]??null,percentile:percentile(s.phenotypes[e.id],values),reference_n:values.length,direction:'unspecified'}));
  });
}
export function stateSummary(cohort,marker,environment){
  return [0,1,2].map(d=>{const xs=cohort.filter(s=>dosage(s,marker)===d).map(s=>s.phenotypes[environment]).filter(Number.isFinite);return {dosage:d,n:xs.length,mean:xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null};});
}
