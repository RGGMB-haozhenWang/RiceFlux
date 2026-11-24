import {isCross,materialKey} from './breeder.js';
import {siteName} from './regions.js';
import {traitTerms} from './terms.js';

export const planExamples=[
  {title:'亲本改良',prompt:'以 D106 为母本、D112 为父本，比较 LOC_Os07g41200 的后代型别。',promptEn:'Compare F1 genotypes for LOC_Os07g41200 with D106 as maternal parent and D112 as paternal parent.'},
  {title:'性状与单倍型',prompt:'查看公主岭 2022 年的粒长单倍型和材料。',promptEn:'Show grain length haplotypes for Gongzhuling in 2022.'},
  {title:'查共同携带',prompt:'聚合 LOC_Os07g49460 和 LOC_Os07g41200，找同时携带的材料。',promptEn:'Pyramid LOC_Os07g49460 and LOC_Os07g41200 and find carriers.'},
  {title:'材料体检',prompt:'给一份新材料做体检，检查位点覆盖和缺测。',promptEn:'Check coverage and missing calls for a new accession.'},
];

export const queryTraits=data=>data.traits.filter(t=>t.environments?.length||t.category==='V4 文献性状'&&t.id!=='v4_unspecified');
export const traitSearchLabels=trait=>[trait.name,trait.id,traitTerms[trait.name]].filter(Boolean);
const normalize=text=>String(text??'').normalize('NFKC').trim().toLowerCase();
const latin=/[a-z0-9_]/;
const units={毫米:'mm',厘米:'cm',米:'m',日:'天',天:'天',克:'g',d:'天',day:'天',days:'天'};
const unitOf=unit=>units[normalize(unit)]??normalize(unit);

export function planScenario(text){
  if(/体检|质控|新材料.*(?:覆盖|缺测)|\b(?:check|screen)\b.*\b(?:coverage|missing calls|new accession)\b/i.test(text))return 'check';
  if(/母本|父本|亲本|后代|杂交(?!组合)|配组|\bf[1-9]\b|\b(?:maternal|paternal|parents?|progeny|offspring)\b/i.test(text))return 'parents';
  if(/聚合|叠加|同时携带|堆叠|基因组合|基因的组合|\b(?:pyramid(?:ing)?|joint genotypes|co-carriers)\b/i.test(text))return 'stack';
  if(/表型|单倍型|分型|达标|优良|筛选|实测|查.*(?:材料|杂交组合|性状|粒长|粒宽|抽穗期)|\b(?:phenotypes?|haplotypes?|target range)\b/i.test(text))return 'traits';
  return null;
}

function mentionCandidates(text,data){
  const matches=[];
  function add(type,item,aliases){
    for(const key of new Set(aliases.map(normalize).filter(k=>k.length>1&&!/^\d+$/.test(k)))){
      let start=text.indexOf(key);
      while(start>=0){
        const end=start+key.length;
        if(!(latin.test(key[0])&&latin.test(text[start-1]??''))&&
           !(latin.test(key.at(-1))&&latin.test(text[end]??''))){
          matches.push({type,item,start,end,label:text.slice(start,end)});
        }
        start=text.indexOf(key,start+key.length);
      }
    }
  }
  for(const s of data.individuals)add('material',s,[s.id,s.source_sample_id,s.name]);
  for(const g of data.genes)add('gene',g,[g.id,g.name,g.catalog?.msu,g.catalog?.rap,...(g.catalog?.aliases??[])]);
  for(const t of queryTraits(data))add('trait',t,traitSearchLabels(t));
  matches.sort((a,b)=>a.start-b.start||b.end-a.end);
  const spans=[];
  for(const m of matches){
    const last=spans.at(-1);
    if(last&&m.start<last.end){
      if(m.start===last.start&&m.end===last.end&&!last.matches.some(x=>x.type===m.type&&x.item.id===m.item.id))last.matches.push(m);
    }else spans.push({...m,matches:[m]});
  }
  return spans;
}

function readGoal(text){
  const number='(-?\\d+(?:\\.\\d+)?)',unit='(mm|cm|m|g|%|days?|d|毫米|厘米|米|克|天|日|级)';
  const interval=text.match(new RegExp(number+'\\s*'+unit+'?\\s*(?:至|到|[-–—~～]|to +)\\s*'+number+'\\s*'+unit+'(?![a-z])'));
  if(interval){
    const [,min,firstUnit,max,lastUnit]=interval;
    return firstUnit&&unitOf(firstUnit)!==unitOf(lastUnit)?{invalid:true}:{min,max,unit:unitOf(lastUnit)};
  }
  const low=text.match(new RegExp('(?:不低于|至少|at least|≥|>=)\\s*'+number+'\\s*'+unit));
  const high=text.match(new RegExp('(?:不高于|不超过|至多|at most|≤|<=)\\s*'+number+'\\s*'+unit));
  if(low&&high&&unitOf(low[2])!==unitOf(high[2]))return {invalid:true};
  if(low||high)return {min:low?.[1]??'',max:high?.[1]??'',unit:unitOf((low??high)[2])};
  return /(?:大于|小于|不低于|至少|不高于|不超过|至多|[≥≤<>])\s*-?\d/.test(text)?{invalid:true}:null;
}

function roleAt(text,hit){
  const before=text.slice(Math.max(0,hit.start-36),hit.start);
  const after=text.slice(hit.end,hit.end+36);
  const english=after.match(/^\s+(?:as\s+(?:the\s+)?)(maternal|paternal)\s+parent\b/)?.[1]??
    before.match(/\b(maternal|paternal)\s+parent\s*(?:is|:)?\s*$/)?.[1];
  if(english)return english==='maternal'?'母本':'父本';
  return after.match(/^\s*(?:作为|作|为|当|是|做)\s*(母本|父本)/)?.[1]??
    before.match(/(母本|父本)\s*(?:用|选|为|是|[:：])?\s*$/)?.[1];
}

export function makeBreederPlan(sentence,data){
  const original=sentence.normalize('NFKC').trim(),text=normalize(original),scenario=planScenario(text);
  if(!scenario)return null;
  const hits=mentionCandidates(text,data),materials=new Map(),genes=new Map(),traits=new Map(),issues=[];
  const roles={母本:new Set(),父本:new Set()};
  for(const hit of hits){
    const measured=hit.matches.every(m=>m.type==='trait')?hit.matches.filter(m=>m.item.environments?.length):[];
    const options=measured.length===1?measured:hit.matches;
    if(options.length!==1){issues.push(original.slice(hit.start,hit.end));continue;}
    const {type,item}=options[0];
    if(type==='material'){
      materials.set(materialKey(item),item);
      const role=roleAt(text,hit);
      if(role&&!isCross(item))roles[role].add(materialKey(item));
    }else if(type==='gene')genes.set(item.id,item);
    else traits.set(item.id,item);
  }
  if(scenario!=='check'){
    const unresolved=[...text.matchAll(/[a-z][a-z0-9_.-]*\d[a-z0-9_.-]*/g)].filter(m=>!/^f[1-9]\d*\.?$/.test(m[0])&&
      !hits.some(h=>m.index>=h.start&&m.index<h.end));
    issues.push(...unresolved.map(m=>m[0].toUpperCase()));
  }
  return {sentence,scenario,materials:[...materials.values()],genes:[...genes.values()],traits:[...traits.values()],
    female:roles.母本.size===1?[...roles.母本][0]:'',male:roles.父本.size===1?[...roles.父本][0]:'',
    issues:[...new Set(issues)],goal:readGoal(text),axis:'',ran:false};
}

export function planSources(plan,axes){
  const trait=plan.traits[0];
  const matching=plan.traits.length===1?axes.filter(a=>a.trait_id===trait.id):[];
  const text=normalize(plan.sentence);
  const years=[...text.matchAll(/(?:^|[^a-z0-9])(20\d{2})(?![a-z0-9])/g)].map(m=>m[1]);
  const place=a=>[a.source.original_site,a.source.site,siteName(a.source.original_site??a.source.site)]
    .some(s=>s&&text.includes(normalize(s)));
  const named=axes.some(place);
  const choices=matching.filter(a=>(!years.length||years.includes(String(a.source.year)))&&(!named||place(a))&&
    (!plan.goal?.unit||unitOf(a.unit)===plan.goal.unit));
  return {choices,specified:Boolean(plan.goal||years.length||named)};
}
