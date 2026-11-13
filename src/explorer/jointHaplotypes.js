import {callOf} from './catalog.js';
import {chromNum} from './exchange.js';

import supplement from '../../public/formats/literature.json' with { type: 'json' };

export function literatureDefinitions(gene,evidence) {
  const records = gene.records.filter(r => r.mode==='完整多位点型')
    .map(r => ({...r, doi:evidence.events[r.id]?.doi || []}));
  const extra = supplement['@graph'].filter(d => d.gene==='rf:gene_'+gene.id).map(d => ({
    id:d['@id'], label:d.label, doi:d.supportedBy.map(url => url.slice('https://doi.org/'.length)),
    components:d.orderedComponents.map(c => ({pos:c.position, ref:c.reference, state:c.reportedState}))
  }));
  return records.concat(extra);
}

export const statusText={called:'已判型',missing:'分型缺失',heterozygous:'含杂合位点',both:'缺失且含杂合',unmatched:'纯合型未匹配定义',ambiguous:'匹配多个型名',uncovered:'定义位点未覆盖',no_sites:'无分型位点'};

function insertDefinition(sets,gene,entry,kind){
  if(!entry.components.length)return;
  const positions=entry.components.map(c=>c.pos);
  const key=JSON.stringify([kind,entry.doi,entry.components.map(c=>[c.pos,c.ref])]);
  if(!sets.has(key)){
    const markers=entry.components.map(c=>gene.variants.find(v=>v.pos===c.pos&&v.ref===c.ref));
    sets.set(key,{id:key,kind,doi:entry.doi,markers,positions,definitions:[],lookup:new Map(),
      ready:markers.every(Boolean)&&new Set(positions).size===positions.length});
  }
  const scheme=sets.get(key);
  const vector=entry.components.map(c=>c.state);
  const valid=vector.every(a=>typeof a==='string'&&/^[ACGT]$/.test(a));const sequence=vector.join('');
  scheme.definitions.push({label:entry.label,sequence:vector.map(a=>a??'NA').join('·'),valid});
  if(valid){
    if(!scheme.lookup.has(sequence))scheme.lookup.set(sequence,new Set());
    scheme.lookup.get(sequence).add(entry.label);
  }
}

export function geneSchemes(gene,evidence,imported=[]){
  const sets=new Map();
  for(const d of literatureDefinitions(gene,evidence))insertDefinition(sets,gene,d,'literature');
  for(const rec of imported){
    const bases=rec.row.Hap.split(',').map(s=>s.trim().toUpperCase());
    if(bases.length!==rec.sites.length||bases.some(b=>!/^[ACGT]$/.test(b))||chromNum(gene.chromosome)!==rec.chromosome)continue;
    insertDefinition(sets,gene,{label:bases.join(''),doi:rec.inputDOI??[],components:rec.sites.map((s,i)=>({...s,state:bases[i]}))},'input');
  }
  const schemes=[...sets.values()];
  for(const s of schemes)s.ready=s.ready&&s.lookup.size>0;
  const markers=gene.variants.slice().sort((a,b)=>a.pos-b.pos);
  const observed={id:'observed',kind:'observed',positions:markers.map(m=>m.pos),markers,ready:!!markers.length,doi:[],definitions:[]};
  return [...schemes.filter(s=>s.ready),observed,...schemes.filter(s=>!s.ready)];
}

export function typeMaterial(sample,scheme){
  if(!scheme.ready)return {status:scheme.positions.length?'uncovered':'no_sites',label:'',bases:''};
  let missing=false,het=false;
  const bases=scheme.markers.map(v=>{
    const [a,b]=callOf(sample,v);
    const allele=x=>x===null?'·':x===0?v.ref:v.alt;
    if(a===null||b===null){missing=true;return [allele(a),allele(b)].sort().join('/');}
    if(a!==b){het=true;return [allele(a),allele(b)].sort().join('/');}
    return allele(a);
  });
  const vector=bases.join(' ');
  if(missing||het)return {status:missing&&het?'both':missing?'missing':'heterozygous',label:'',bases:vector};
  const sequence=bases.join('');
  if(scheme.kind==='observed')return {status:'called',label:(bases.length===1?'单标记 ':'标记型 ')+sequence,bases:vector};
  const matches=scheme.lookup.get(sequence);
  if(!matches)return {status:'unmatched',label:'',bases:vector};
  if(matches.size!==1)return {status:'ambiguous',label:[...matches].join(' / '),bases:vector};
  return {status:'called',label:[...matches][0],bases:vector};
}

export function jointCalls(cohort,schemes){
  const groups=new Map(),population=new Map(),members=[];
  let assigned=0;
  for(const sample of cohort){
    const pop=sample.population_id;
    if(!population.has(pop))population.set(pop,{all:0,assigned:0});
    population.get(pop).all++;
    const calls=schemes.map(s=>typeMaterial(sample,s));
    let key=null;
    if(calls.length&&calls.every(c=>c.status==='called')){
      const labels=calls.map(c=>c.label);key=JSON.stringify(labels);
      if(!groups.has(key))groups.set(key,{key,labels,n:0,pops:new Map()});
      const g=groups.get(key);g.n++;g.pops.set(pop,(g.pops.get(pop)||0)+1);
      assigned++;population.get(pop).assigned++;
    }
    members.push({sample,calls,key});
  }
  return {members,assigned,population,groups:[...groups.values()].sort((a,b)=>b.n-a.n||a.key.localeCompare(b.key))};
}
