import {phenotypeAxes,radarRows} from './analysis.js';
import {isAssayed} from './catalog.js';
import {typeMaterial} from './jointHaplotypes.js';
import {alleleStats,quantile} from './model.js';

export const isCross = sample => sample.kind === 'hybrid cross';
export const materialKey = sample => JSON.stringify([sample.dataset_id,sample.source_sample_id??sample.id]);
const observedCall=sample=>['G_chip','G_direct'].includes(sample.genotype_evidence);

export function breederAxes(data) {
  const versions=new Map(data.meta.datasets.map(d=>[d.id,d.version]));
  return phenotypeAxes(data).map(axis=>{
    const dataset=axis.source.dataset_id,version=versions.get(dataset);
    const environment=axis.source.environment_id??axis.id;
    const key=JSON.stringify([dataset,version,environment,axis.trait_id,axis.method_id??axis.assay,axis.unit]);
    return {...axis,dataset,version,environment,key};
  });
}

export function targetRange(bounds={}) {
  const parse=value=>{
    const text=String(value??'').trim();
    if(!text)return null;
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)?Number(text):NaN;
  };
  const min=parse(bounds.min),max=parse(bounds.max);
  const invalid=(min!==null&&!Number.isFinite(min))||(max!==null&&!Number.isFinite(max))||
    (min!==null&&max!==null&&min>max);
  return {min:Number.isFinite(min)?min:null,max:Number.isFinite(max)?max:null,invalid,active:!invalid&&(min!==null||max!==null)};
}

export function targetStatus(value,target) {
  if (!Number.isFinite(value)) return 'missing';
  if (target.invalid) return 'invalid';
  if (!target.active) return 'not_set';
  return (target.min===null||value>=target.min)&&(target.max===null||value<=target.max)?'met':'outside';
}

export function reviewAxes(axes,samples,settings,initialTrait) {
  const sources=axes.map(axis=>({...axis,observed:samples.filter(s=>
    s.dataset_id===axis.dataset&&Number.isFinite(s.phenotypes[axis.id])
  ).length}));
  const best=items=>items.reduce((a,b)=>!a||b.observed>a.observed?b:a,null);
  const locked=sources.find(axis=>axis.key===settings.axis);
  const chosen=best(sources.filter(axis=>axis.trait_id===settings.trait));
  const preferred=best(sources.filter(axis=>axis.trait_id===initialTrait));
  return {sources,axis:locked??chosen??(preferred?.observed?preferred:null)??best(sources)};
}

export function traitRows(samples,axis,target,reference=samples) {
  if (!axis) return [];
  const eligible=samples.filter(s=>s.dataset_id===axis.dataset);
  return radarRows(eligible,reference.filter(s=>s.dataset_id===axis.dataset),[axis]).map((row,i)=>({
    ...row,sample:eligible[i],sample_id:eligible[i].source_sample_id??row.sample_id,
    environment_id:axis.environment,site:axis.source.original_site??row.site,
    dataset_version:axis.version,target_min:target.min,target_max:target.max,
    target_status:targetStatus(row.value,target),
  }));
}

export function genotypePhenotypes(rows,scheme,target) {
  const byType=new Map();
  if (!scheme) return [];
  for (const row of rows) {
    if (!Number.isFinite(row.value)||!observedCall(row.sample)) continue;
    const call=typeMaterial(row.sample,scheme);
    if (call.status!=='called') continue;
    if (!byType.has(call.label)) byType.set(call.label,{label:call.label,values:[],met:0});
    const group=byType.get(call.label);
    group.values.push(row.value);
    group.met+=Number(row.target_status==='met');
  }
  const ordinal=rows[0]?.unit==='级';
  return [...byType.values()].map(({label,values,met})=>{
    if(ordinal)values.sort((a,b)=>a-b);
    const q=p=>ordinal?values[Math.ceil(p*values.length)-1]:quantile(values,p);
    return {label,n:values.length,median:q(.5),q1:q(.25),q3:q(.75),
      mean:ordinal?null:values.reduce((sum,value)=>sum+value,0)/values.length,met:target.active?met:null};
  }).sort((a,b)=>b.n-a.n||a.label.localeCompare(b.label));
}

export function evidenceLevel(gene,scheme,groups) {
  const literature=scheme?.kind==='literature'&&scheme.doi.length?'L2':
    (gene.catalog?.geneDOI?.length||gene.sources?.length)?'L1':'L0';
  const phenotype=groups.length>1?'P1':'P0';
  return {literature,phenotype,inference:'I0',grade:literature!=='L0'||phenotype==='P1'?'C1':'C0'};
}

export function markerCoverage(samples,marker) {
  const assayed=samples.filter(s=>isAssayed(s,marker));
  return {...alleleStats(assayed,marker),uncovered:samples.length-assayed.length};
}

export function trackingKey(axis,gene,scheme) {
  return JSON.stringify([axis?.key,gene.id,scheme.id,scheme.markers.map(v=>[v?.id,v?.ref])]);
}

export function parentComparison(female,male,scheme) {
  const a=typeMaterial(female,scheme),b=typeMaterial(male,scheme);
  let status='unresolved';
  if (a.status==='called'&&b.status==='called') {
    const observed=[female,male].every(observedCall);
    status=observed?(a.bases===b.bases?'same':'different'):'inferred';
  }
  const paternal=b.bases.split(' ');
  const f1=(status==='same'||status==='different')?a.bases.split(' ').map((base,i)=>base+'/'+paternal[i]):null;
  return {female:a,male:b,status,f1};
}

export function registeredCrosses(samples,female,male) {
  if (!female||!male) return [];
  const a=materialKey(female),b=materialKey(male);
  return samples.filter(s=>isCross(s)&&JSON.stringify(s.parents?.female)===a&&JSON.stringify(s.parents?.male)===b);
}
