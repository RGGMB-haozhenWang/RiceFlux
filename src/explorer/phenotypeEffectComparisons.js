import {sourceHaplotypeKey} from './haplotypeIdentity.js';

const ratioUnits=new Set(['mm','cm','m','g','kg','天','day','days','%','粒/穗','g/株','kg/小区']);
const finite=value=>Number.isFinite(value)?value:null;

function groupStats(rows,key) {
  const matches=rows.filter(row=>row.key===key);
  if(matches.length!==1)return {n:0,median:null};
  const row=matches[0];
  const n=Number.isInteger(row.n)&&row.n>=0?row.n:0;
  return {n,median:n?finite(row.median):null};
}

export function phenotypeEffectComparisons(claims,traitId,mapping,rows,unit) {
  return claims.filter(claim=>traitId&&claim.trait_id===traitId).flatMap(claim=>{
    const literature=Array.isArray(claim.quantitativeEffects)?claim.quantitativeEffects:[];
    const comparator=Boolean(claim.definition_id&&claim.control_definition_id&&claim.control_label);
    if(!literature.length&&!comparator)return [];
    const find=id=>id?mapping?.bySource.get(sourceHaplotypeKey(claim.doi,id)):undefined;
    const targetSource=find(claim.definition_id||claim.marker_state);
    const controlSource=find(claim.control_definition_id);
    const relation=targetSource?.status;
    const targetKeys=relation==='exact'||relation==='extension'?targetSource.groupKeys:[];
    const controlKey=controlSource?.status==='exact'?controlSource.groupKeys[0]:null;
    const result={claim,literature,targetKeys,controlKey,relation,observed:null};
    if(!comparator)return [result];
    const observed={status:relation==='extension'?'extension':'unmatched',targetN:null,controlN:null,targetMedian:null,controlMedian:null,
      difference:null,differenceUnit:unit==='%'?'百分点':unit||null,relative:null};
    result.observed=observed;
    const targetKey=targetKeys[0];
    if(relation!=='exact'||!controlKey||targetKey===controlKey)return [result];
    const target=groupStats(rows,targetKey),control=groupStats(rows,controlKey);
    Object.assign(observed,{status:'insufficient',targetN:target.n,controlN:control.n,targetMedian:target.median,controlMedian:control.median});
    if(target.n>=10&&control.n>=10&&target.median!==null&&control.median!==null){
      observed.status='ready';
      observed.difference=finite(target.median-control.median);
      if(control.median>0&&ratioUnits.has(unit)&&observed.difference!==null)
        observed.relative=finite(observed.difference/control.median*100);
    }
    return [result];
  });
}
