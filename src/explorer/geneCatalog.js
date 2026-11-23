import {readTable} from './datasets.js';
import {chromNum,lengths} from './exchange.js';
import {sha256Text} from './sha256.js';

export const geneCatalogPath='cloned_catalog/manifest.json';
const msu=/^LOC_Os(?:0[1-9]|1[0-2])g\d{5}$/;
const rap=/^Os(?:0[1-9]|1[0-2])g\d{7}$/;
const doi=/^10\.\d{4,9}\/\S+$/;

export async function extendGeneCatalog(reference,manifest,text){
  if(!['RiceFlux gene catalog 1.0','RiceFlux gene catalog 1.1'].includes(manifest?.schema)||manifest.file!=='genes.tsv.gz'||manifest.assembly!=='IRGSP-1.0/MSU7'||
    typeof manifest.version!=='string'||!manifest.version||await sha256Text(text)!==manifest.sha256)
    throw Error('扩展基因目录的版本、参考组装或哈希无效');
  const required=['gene_id','name','msu','rap','aliases','chr','gene_start','gene_end','strand','transcript','cds','catalog_dois'];
  const existing=new Map(reference.genes.map(g=>[g.id,g]));
  const ids=new Set();
  const extended=manifest.schema==='RiceFlux gene catalog 1.1';
  const genes=readTable(text,required,'扩展基因目录').objects().map(row=>{
    const {gene_id:id,name,chr,strand,transcript}=row;
    if(ids.has(id)||(!existing.has(id)&&id!==(row.msu||row.rap)&&!(extended&&/^UNRESOLVED_row_\d+$/.test(id)&&!row.msu&&!row.rap))||!name||(!msu.test(row.msu)&&row.msu)||(!rap.test(row.rap)&&row.rap)||!id)
      throw Error('扩展基因身份无效或重复：'+id);
    ids.add(id);
    const geneDOI=row.catalog_dois?row.catalog_dois.split(';'):[];
    if(geneDOI.some(d=>!doi.test(d)))throw Error('扩展基因目录 DOI 无效：'+id);
    const old=existing.get(id);
    const array=(field)=>{const value=row[field]?JSON.parse(row[field]):[];if(!Array.isArray(value))throw Error('目录字段必须为数组：'+field);return value;};
    const union=(a=[],b=[])=>[...new Set([...a,...b])];
    const catalog={...old?.catalog,id,sourceId:old?.catalog?.sourceId||id,msu:row.msu||old?.catalog?.msu||'',rap:row.rap||old?.catalog?.rap||'',name:old?.name||name,
      aliases:union(old?.catalog?.aliases,row.aliases?row.aliases.split(';'):[]),
      traits:union(old?.catalog?.traits,array('traits')),geneDOI:union(old?.catalog?.geneDOI,geneDOI),
      events:old?.catalog?.events||[],collection:old?old.catalog?.collection||'prior':'cloned_catalog',
      originalNames:array('original_names'),sourceRows:array('source_rows'),evidenceAbstract:row.evidence_abstract||'',
      sourceAnnotations:array('source_annotations'),identityStatus:row.identity_status||'source_stable_id',
      sourceMsu:array('source_msu'),sourceRap:array('source_rap'),bibliographyStatus:row.bibliography_status||(geneDOI.length?'source_doi_not_independently_reviewed':'missing_doi')};
    if(old)return {...old,catalog,description:old.description||catalog.evidenceAbstract};
    const entry={id,name,catalog,description:catalog.evidenceAbstract,prior:'',variants:[],features:[],records:[],sources:geneDOI.map(d=>'https://doi.org/'+d),trait_ids:['all_prior'],
      assembly:'IRGSP-1.0',chromosome:null,start:null,end:null,gene_start:null,gene_end:null,model:null,promoter:null};
    if(!chr){
      if([row.gene_start,row.gene_end,strand,transcript,row.cds].some(Boolean))throw Error('未定位基因含坐标字段：'+id);
      return entry;
    }
    const chromosome=chromNum(chr),gene_start=Number(row.gene_start),gene_end=Number(row.gene_end);
    if(!lengths[chromosome]||!Number.isSafeInteger(gene_start)||!Number.isSafeInteger(gene_end)||
      gene_start<1||gene_end<gene_start||gene_end>lengths[chromosome]||!['+','-'].includes(strand))
      throw Error('扩展基因参考模型坐标无效：'+id);
    const left=strand==='+'?Math.max(1,gene_start-2000):gene_end+1;
    const right=strand==='+'?gene_start-1:Math.min(lengths[chromosome],gene_end+2000);
    const promoter=left<=right?{start:left,end:right}:null;
    const features=(row.cds?row.cds.split(';'):[]).map(interval=>{
      const [start,end]=interval.split('-').map(Number);
      if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<gene_start||end>gene_end||end<start)
        throw Error('扩展基因 CDS 坐标无效：'+id);
      return {type:'CDS',start,end};
    });
    return {...entry,chromosome:'Chr'+chromosome,gene_start,gene_end,strand,model:transcript||id,promoter,features,
      start:Math.min(gene_start,promoter?.start??gene_start),end:Math.max(gene_end,promoter?.end??gene_end)};
  });
  const totals=manifest.counts;
  const additions=genes.filter(g=>!existing.has(g.id));
  const enrichments=genes.filter(g=>existing.has(g.id));
  if(totals?.legacy_entries!==reference.genes.length||totals.extension_entries!==additions.length||
    totals.catalog_total!==reference.genes.length+additions.length||totals.mapped_new_genes!==additions.filter(g=>g.model).length||
    (extended&&(totals.enrichment_entries!==enrichments.length||totals.table_entries!==genes.length)))
    throw Error('扩展基因目录条目数与清单不一致');
  const enriched=new Map(enrichments.map(g=>[g.id,g]));
  return {...reference,catalogManifest:manifest,genes:[...reference.genes.map(g=>enriched.get(g.id)||g),...additions],
    traits:reference.traits.map(t=>t.id==='all_prior'?{...t,name:'暂无已登记性状'}:t)};
}
