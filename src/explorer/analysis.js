import {callOf} from './catalog.js';
import {chromNum} from './exchange.js';
import {alleleNames} from './alleles.js';
import {gtToken} from './model.js';

// Descriptive statistics: no trait direction, significance test or causal score.
export function percentile(value,values){
  const xs=values.filter(Number.isFinite);
  if(!Number.isFinite(value)||!xs.length)return null;
  return 100*(xs.filter(x=>x<value).length+xs.filter(x=>x===value).length/2)/xs.length;
}
export function dosage(sample,marker,alleleIndex=1){
  if(!marker)return null;
  const [a,b]=callOf(sample,marker);
  return a===null||b===null?null:Number(a===alleleIndex)+Number(b===alleleIndex);
}
export function linkage(cohort,a,b,alleleA=1,alleleB=1){
  const pairs=cohort.map(s=>[dosage(s,a,alleleA),dosage(s,b,alleleB)]).filter(p=>p.every(Number.isFinite));
  const n=pairs.length,mx=pairs.reduce((s,p)=>s+p[0],0)/n,my=pairs.reduce((s,p)=>s+p[1],0)/n;
  let xx=0,yy=0,xy=0;
  for(const [x,y] of pairs){xx+=(x-mx)**2;yy+=(y-my)**2;xy+=(x-mx)*(y-my);}
  const status=n<3?'too_few':!xx||!yy?'fixed':'estimated';
  return {n,total:cohort.length,missing:cohort.length-n,maf_a:n?Math.min(mx/2,1-mx/2):null,maf_b:n?Math.min(my/2,1-my/2):null,
    r2:status==='estimated'?Math.min(1,Math.max(0,xy*xy/(xx*yy))):null,status,
    distance_bp:a&&b&&chromNum(a.chromosome)===chromNum(b.chromosome)?Math.abs(a.pos-b.pos):null};
}
export function linkageRows(cohort,genes,markers,alleleIndices=[]){
  const strata=new Map();
  for(const s of cohort){const key=JSON.stringify([s.dataset_id||'',s.source_group||s.population_id]);if(!strata.has(key))strata.set(key,[]);strata.get(key).push(s);}
  const rows=[];
  for(let i=0;i<markers.length;i++)for(let j=i+1;j<markers.length;j++)if(markers[i]&&markers[j]){
    const a=alleleIndices[i]||1,b=alleleIndices[j]||1;
    for(const [key,samples] of strata){const [dataset_id,source_group]=JSON.parse(key);rows.push({dataset_id,source_group,gene_a:genes[i].name,gene_b:genes[j].name,marker_a:markers[i].id,marker_b:markers[j].id,allele_a:alleleNames(markers[i])[a],allele_b:alleleNames(markers[j])[b],...linkage(samples,markers[i],markers[j],a,b)});}
  }
  return rows;
}
export function phenotypeAxes(data){
  return data.traits.flatMap(t=>(t.environments||[]).map(e=>({...e,trait_id:t.id,trait_name:t.name,label:[t.name,e.assay,e.source.site,e.source.year,e.unit].join(' · ')})));
}
export function radarRows(samples,reference,axes){
  return axes.flatMap(e=>{
    const values=reference.map(s=>s.phenotypes[e.id]).filter(Number.isFinite).sort((a,b)=>a-b);
    const ranks=new Map();
    for(let i=0;i<values.length;){let j=i+1;while(j<values.length&&values[j]===values[i])j++;ranks.set(values[i],100*(i+(j-i)/2)/values.length);i=j;}
    const rank=value=>{if(!Number.isFinite(value)||!values.length)return null;if(ranks.has(value))return ranks.get(value);
      let lo=0,hi=values.length;while(lo<hi){const mid=(lo+hi)>>>1;if(values[mid]<value)lo=mid+1;else hi=mid;}return 100*lo/values.length;};
    return samples.map(s=>({sample_id:s.id,name:s.name,dataset_id:s.dataset_id,trait_id:e.trait_id,environment_id:e.id,assay:e.assay,site:e.source.site,year:e.source.year,unit:e.unit,
      value:s.phenotypes[e.id]??null,percentile:rank(s.phenotypes[e.id]),reference_n:values.length,direction:'unspecified'}));
  });
}
export function stateSummary(cohort,marker,environment){
  const alleles=alleleNames(marker),states=new Map();
  for(let a=0;a<alleles.length;a++)for(let b=a;b<alleles.length;b++)states.set(gtToken([a,b],marker),{n:0,sum:0,dosage:alleles.length===2?a+b:null});
  for(const s of cohort){const pair=callOf(s,marker),value=s.phenotypes[environment];
    if(pair.includes(null)||!Number.isFinite(value))continue;
    const state=states.get(gtToken(pair,marker));state.n++;state.sum+=value;
  }
  return [...states].map(([genotype,{n,sum,dosage}])=>({genotype,dosage,n,mean:n?sum/n:null}));
}
