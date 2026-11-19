import {datasetCalls,geneSupport,identityFor} from './provenance.js';
import {writeTSV,materialRow} from './formats.js';
import {callOf} from './catalog.js';
import {alleleStats,gtToken,genotypeGroups,retainedVariants} from './model.js';
import {analysisSites} from './siteSelection.js';
import {phenotypeAxes} from './analysis.js';
import {evidenceRows,evidenceColumns} from './evidence.js';

// Small uncompressed ZIP writer for independently readable UTF-8 tables.
export function zipTables(files){
  const enc=new TextEncoder(),parts=[],central=[];let offset=0;
  const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
  for(const [name,text] of Object.entries(files)){
    const n=enc.encode(name),b=enc.encode(text),sum=crc(b),h=new Uint8Array(30+n.length),v=new DataView(h.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,sum,true);v.setUint32(18,b.length,true);v.setUint32(22,b.length,true);v.setUint16(26,n.length,true);h.set(n,30);
    const c=new Uint8Array(46+n.length),d=new DataView(c.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint32(16,sum,true);d.setUint32(20,b.length,true);d.setUint32(24,b.length,true);d.setUint16(28,n.length,true);d.setUint32(42,offset,true);c.set(n,46);central.push(c);parts.push(h,b);offset+=h.length+b.length;
  }
  const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,central.length,true);v.setUint16(10,central.length,true);v.setUint32(12,central.reduce((n,b)=>n+b.length,0),true);v.setUint32(16,offset,true);
  return new Blob([...parts,...central,end],{type:'application/zip'});
}
export function materialTables(rows,reference,axes){
  return {
    'README.txt':'RiceFlux material comparison 1.0\nAll selected accessions, not just the visible page. Join phenotypes.environment_id to reference_members.environment_id for the exact percentile denominator. Percentiles use finite values and tie midranks; no favourable direction. IDs are text.\n',
    'phenotypes.tsv':writeTSV(['sample_id','name','dataset_id','trait_id','environment_id','assay','site','year','unit','value','percentile','reference_n','direction'],rows),
    'reference_members.tsv':writeTSV(['environment_id','sample_id','dataset_id'],axes.flatMap(e=>reference.filter(s=>Number.isFinite(s.phenotypes[e.id])).map(s=>({environment_id:e.id,sample_id:s.id,dataset_id:s.dataset_id})))),
  };
}
export function geneTables(data,gene,cohort,variants,config){
  const table=(keys,rows)=>'\ufeff'+writeTSV(keys,rows),samples=cohort.map(materialRow),axes=phenotypeAxes(data),rows=evidenceRows(gene,data.evidence,data.literature,data.abstracts);
  const selected=analysisSites(cohort,gene,config.siteSelections?.[gene.id],config.minMaf??0,config.maxMissing??1);
  const qc=new Set(retainedVariants(cohort,gene,config.minMaf??0,config.maxMissing??1).map(v=>v.id));
  const groups=selected.ready?genotypeGroups(cohort,variants):[],membership=new Map(groups.flatMap((g,i)=>g.members.map(s=>[s.id,{group_id:'G'+String(i+1).padStart(2,'0'),genotype_vector:g.key}])));
  const definitions=(gene.records||[]).flatMap(r=>r.components.map((c,i)=>({event_id:r.id,label:r.label,mode:r.mode,component:i+1,...c})));
  return {
    'identity.tsv':table(['gene_id','msu_id','rap_id','display_name','original_name','aliases','identity_status','shared_aliases','identity_source','review_scope'],[identityFor(data,gene)||{}]),
    'dataset_support.tsv':table(['dataset_id','badge','gene_id','marker_count','functional_sites','haplotype_components','marker_ids','high_confidence_sites','confidence_status'],geneSupport(data,gene)),
    'call_provenance.tsv':table(['dataset_id','name','version','source','genotype_evidence','samples','markers','complete','heterozygous','called','total','confidence','assay'],datasetCalls(data,gene,cohort)),
    'population_dictionary.tsv':table(['dataset_id','code','label_zh','label_en','n','source','interpretation'],data.annotations?.populations||[]),
    'README.txt':'RiceFlux gene export 1.3\nUTF-8 TSV; Excel: import as tab-delimited text, accession IDs as text. Blank = missing, never reference. Frequencies count called alleles, including partially missing calls. Missing uses expected alleles as its denominator. MAF is the frequency of the second most common allele. AF is total non-REF frequency and allele_frequencies records each allele. Genotype combinations require complete calls across analysis_sites.tsv in its listed order. Manual subsets are unphased genotype combinations, not literature-named haplotypes. Empty or unavailable selections yield no complete groups. Gene-wide tables include all loaded markers; qc_retained labels current thresholds, selected_for_analysis labels the actual selection. No favourable direction or overall cultivar score.\n',
    'context.tsv':table(['key','value'],Object.entries({schema:'RiceFlux gene export 1.3',assembly:gene.assembly,gene_id:gene.id,gene_name:gene.name,msu_id:gene.catalog?.msu,...Object.fromEntries(Object.entries(config).map(([k,v])=>[k,JSON.stringify(v)])),datasets:JSON.stringify(data.meta.datasets),grouping:data.meta.groupBy}).map(([key,value])=>({key,value}))),
    'datasets.tsv':table(['dataset_id','version','source','genotype_evidence','input_text_sha256'],(data.datasetBundles||[]).map(b=>({dataset_id:b.manifest.id,version:b.manifest.version,source:b.manifest.source,genotype_evidence:b.manifest.genotype_evidence,input_text_sha256:JSON.stringify(b.manifest.sha256||{})}))),
    'combinations.tsv':table(['group_id','genotype_vector','population_id','n','group_total','all_complete','fraction_of_combination'],groups.flatMap((g,i)=>data.populations.map(p=>({group_id:'G'+String(i+1).padStart(2,'0'),genotype_vector:g.key,population_id:p.id,n:g.members.filter(s=>s.population_id===p.id).length,group_total:g.members.length,all_complete:groups.reduce((n,x)=>n+x.members.length,0),fraction_of_combination:g.members.filter(s=>s.population_id===p.id).length/g.members.length})))),
    'combination_members.tsv':table(['sample_id','group_id','genotype_vector','status'],cohort.map(s=>({sample_id:s.id,...membership.get(s.id),status:membership.has(s.id)?'complete':'unresolved'}))),
    'materials.tsv':table(Object.keys(materialRow(cohort[0]||{id:'',name:''})),samples),
    'analysis_sites.tsv':table(['order','marker_id','assembly','chr','position','ref','alt','mode','status'],selected.markerIds.map((id,i)=>{const v=gene.variants.find(v=>v.id===id);return {order:i+1,marker_id:id,assembly:config.siteSelections?.[gene.id]?.assembly||gene.assembly,chr:gene.chromosome,position:v?.pos,ref:v?.ref,alt:v?.alt,mode:selected.mode,status:selected.assemblyMismatch?'assembly_mismatch':v?'available':'uncovered'};})),
    'variants.tsv':table(['marker_id','chr','position','ref','alt','feature','qc_retained','selected_for_analysis','evidence_class','marker_type'],gene.variants.map(v=>({marker_id:v.id,chr:gene.chromosome,position:v.pos,ref:v.ref,alt:v.alt,feature:v.feature,qc_retained:qc.has(v.id),selected_for_analysis:variants.includes(v),evidence_class:data.evidence?.sites[v.id]?.level||v.classified||'unclassified',marker_type:v.markerType||'SNP'}))),
    'genotypes.tsv':table(['sample_id',...gene.variants.map(v=>v.id)],cohort.map(s=>Object.fromEntries([['sample_id',s.id],...gene.variants.map(v=>[v.id,gtToken(callOf(s,v),v).replaceAll('·','.')])]))),
    'allele_frequencies.tsv':table(['marker_id','group','n','alt','called','total','af','maf','missing','allele_frequencies'],gene.variants.flatMap(v=>data.populations.map(p=>{
      const stats=alleleStats(cohort.filter(s=>s.population_id===p.id),v);
      return {marker_id:v.id,group:p.id,...stats,allele_frequencies:JSON.stringify(stats.alleleCounts)};
    }))),
    'phenotypes.tsv':table(['sample_id',...axes.map(e=>e.id)],cohort.map(s=>({sample_id:s.id,...s.phenotypes}))),
    'environments.tsv':table(['environment_id','trait_id','trait_name','ontology_id','mapping_status','method_id','scale_id','growth_stage','assay','unit','site','year','source_table','source_locator','source_doi','source_note','site_status','coordinate_literal','latitude','longitude','method_description','method_en','method_status','protocol_locator','standard','field_design','quality_control','protocol_gap'],axes.map(e=>({...e,...e.source.provenance,environment_id:e.id,trait_id:e.trait_id,trait_name:e.trait_name,assay:e.assay,unit:e.unit,site:e.source.site,year:e.source.year}))),
    'evidence.tsv':table(evidenceColumns,rows),
    'definitions.tsv':table(['event_id','label','mode','component','pos','ref','state'],definitions),
  };
}
