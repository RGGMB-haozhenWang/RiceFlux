export const pavStates={'1':'present','0':'absent','.':'unknown','-':'unassayed'};
export const pavNames={present:'存在',absent:'缺失',unknown:'未判定',unassayed:'未覆盖'};
export const pavFields=['pav_id','gene_id','source_gene_id','source_id','states'];
export const pavVariantFields=['event_type','length_change_bp','chr','position','ref','alt','source_record_id'];
export const checkPavFields=['sample_id','gene_id','source_gene_id','status','method','source'];

export function pavState(assay,sample) {
  if(!assay.sampleIndex||sample.dataset_id!==assay.datasetId)return 'unassayed';
  const index=assay.sampleIndex.get(sample.source_sample_id??sample.id);
  return index===undefined?'unassayed':pavStates[assay.states[index]];
}

export function pavCounts(assay,samples) {
  const counts={present:0,absent:0,unknown:0};
  for(const sample of samples){
    const state=pavState(assay,sample);
    if(state!=='unassayed')counts[state]++;
  }
  return {...counts,called:counts.present+counts.absent,total:counts.present+counts.absent+counts.unknown};
}
