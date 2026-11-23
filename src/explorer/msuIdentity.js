import {chromNum,lengths} from './exchange.js';
import {literalAllele} from './alleles.js';

const geneId=/^LOC_Os(0[1-9]|1[0-2])g\d{5}$/;
const chromosomeNumber=value=>typeof value==='number'?value:chromNum(value||'');
export const isMsuGeneId=id=>geneId.test(id||'');
export const msuGeneId=gene=>[gene?.catalog?.msu,gene?.id].find(isMsuGeneId)||'';

export function msuSiteId(chromosome,position,ref,kind,alt){
  const chr=chromosomeNumber(chromosome),pos=Number(position);
  if(!lengths[chr]||!Number.isSafeInteger(pos)||pos<1||!literalAllele.test(ref||'')||
    pos+ref.length-1>lengths[chr]||!['SNP','InDel','PAV'].includes(kind)||
    (kind==='PAV'&&!literalAllele.test(alt||'')))return '';
  return ['MSU7','Chr'+String(chr).padStart(2,'0'),pos,ref,kind,...kind==='PAV'?[alt]:[]].join(':');
}

export const identityColumns=['dataset_id','dataset_version','source_gene_id','source_marker_id','msu_gene_id','msu_site_id','kind','status'];
export function datasetIdentityRows(bundle){
  const context={dataset_id:bundle.manifest.id,dataset_version:bundle.manifest.version};
  return [
    ...bundle.variants.map(v=>({...context,source_gene_id:v.input_gene_id||v.gene,
      source_marker_id:v.input_marker_id||v.id,msu_gene_id:v.msu_id,msu_site_id:v.msu_site_id,
      kind:v.markerType,status:v.msu_id&&v.msu_site_id?'mapped':'unresolved_gene'})),
    ...bundle.pav.map(p=>({...context,source_gene_id:p.sourceGene,source_marker_id:p.id,
      msu_gene_id:p.msu_id,msu_site_id:p.event?.msu_site_id||'',kind:p.event?'fragment_PAV':'gene_PAV',
      status:!p.msu_id?'unresolved_gene':p.event?'mapped':'gene_assay'})),
  ];
}
