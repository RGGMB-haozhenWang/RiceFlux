import {canonicalTraitKey} from './traitVocabulary.js';

// The menu groups synonyms; each original trait and its trial axes stay intact.
export function measuredTraitChoices(traits){
  const choices=new Map();
  for(const trait of traits){
    const key=canonicalTraitKey(trait.name);
    if(!choices.has(key))choices.set(key,{key,name:trait.name,traits:[]});
    choices.get(key).traits.push(trait);
  }
  return [...choices.values()];
}
export const showFrequencyGroup=stats=>!(stats.called>0&&stats.alt===0);

export function markerDatasetSupport(data,gene,support){
  const loaded=new Set((data.meta?.datasets||[]).map(d=>d.id));
  const markers=new Map();
  function add(id,dataset){
    if(!markers.has(id))markers.set(id,new Map());
    markers.get(id).set(dataset.id,dataset);
  }
  for(const row of support){
    const dataset={id:row.dataset_id,name:row.badge||row.dataset_id,loaded:loaded.has(row.dataset_id)};
    for(const id of (row.marker_ids||'').split(';').filter(Boolean))add(id,dataset);
  }
  for(const bundle of data.datasetBundles||[]){
    const dataset={id:bundle.manifest.id,name:bundle.manifest.badge||bundle.manifest.name,loaded:true};
    for(const marker of bundle.variants||[])if(marker.gene===gene.id)add(marker.id,dataset);
  }
  return markers;
}
