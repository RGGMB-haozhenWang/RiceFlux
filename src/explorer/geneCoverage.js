import {packedCall} from './alleles.js';

export const coveragePath='catalog_coverage.tsv.gz';
export const coverageFields=['dataset_id','dataset_version','gene_id','marker_count','indel_sites','functional_sites',
  'haplotype_components','marker_ids','high_confidence_sites','confidence_status'];

export function bundleGeneCoverage(bundle,evidence){
  const {id,version}=bundle.manifest,records=new Map();
  for(const marker of bundle.variants){
    if(!records.has(marker.gene))records.set(marker.gene,{dataset_id:id,dataset_version:version,gene_id:marker.gene,
      indel_sites:0,functional_sites:0,haplotype_components:0,markers:[]});
    const row=records.get(marker.gene);
    row.markers.push(marker.id);
    const level=evidence?.sites?.[marker.id]?.level;
    if(level==='原文功能位点')row.functional_sites++;
    if(level==='文献单倍型组分')row.haplotype_components++;
    if(marker.markerType==='InDel'&&bundle.columns?.get(marker.id)?.some(code=>packedCall(code).some(allele=>allele>0)))
      row.indel_sites++;
  }
  return [...records.values()].map(({markers,...row})=>({...row,marker_count:markers.length,
    marker_ids:markers.join(';'),high_confidence_sites:0,confidence_status:'not_certified'}));
}
