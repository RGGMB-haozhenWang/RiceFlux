import {literalAllele,pavThreshold} from './alleles.js';

// Keep original ALT indices: a different alternate is not evidence of REF.
export function splitIndelAlleles(ref, alts) {
  const shortAlts=[],shortIndexes=[],events=[],unsupportedIndexes=[];
  const valid=literalAllele.test(ref)&&new Set([ref,...alts]).size===alts.length+1;
  for(const [index,alt] of alts.entries()){
    const altIndex=index+1,lengthChange=alt.length-ref.length;
    const anchored=alt.startsWith(ref)||ref.startsWith(alt);
    if(!valid||!literalAllele.test(alt)||(!lengthChange&&ref.length!==1)||(lengthChange&&!anchored)){
      unsupportedIndexes.push(altIndex);continue;
    }
    if(Math.abs(lengthChange)>=pavThreshold)events.push({ref,alt,altIndex,kind:lengthChange>0?'INS':'DEL',lengthChange});
    else {shortAlts.push(alt);shortIndexes.push(altIndex);}
  }
  return {shortAlts,shortIndexes,events,unsupportedIndexes};
}

export function pavIndelState(pair,event) {
  if(!Array.isArray(pair)||pair.length!==2||!Number.isInteger(pair[0])||pair[0]!==pair[1])return '.';
  if(pair[0]!==0&&pair[0]!==event.altIndex)return '.';
  const alternate=pair[0]===event.altIndex;
  return (event.kind==='INS'?alternate:!alternate)?'1':'0';
}

export function pavIndelId(chr,position,ref,alt) {
  return ['rf_pav',chr,position,ref,alt].join('_');
}
