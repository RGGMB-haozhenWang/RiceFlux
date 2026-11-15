import fs from 'node:fs';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {observedDataset} from '../src/explorer/observed.js';
import {attachCatalog,callOf} from '../src/explorer/catalog.js';
import {writeTSV} from '../src/explorer/formats.js';
const root=path.resolve(import.meta.dirname,'../public');
const read=name=>JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'prior',name))));
const cohort=read('cohort.json.gz');
const data=attachCatalog(observedDataset(cohort,read('ontology.jsonld.gz')),read('v4_catalog.json.gz'),read('v4_marker_calls.json.gz'),read('evidence.json.gz'));
const out=path.join(root,'datasets/rice6044-v1');fs.mkdirSync(out,{recursive:true});
function put(file,bytes){const dest=path.join(root,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest+'.partial',bytes);fs.renameSync(dest+'.partial',dest);}
const files={},sha256={};
function table(key,fields,rows,zip=false){const text=writeTSV(fields,rows),file=key+'.tsv'+(zip?'.gz':'');put('datasets/rice6044-v1/'+file,zip?gzipSync(text):text);files[key]=file;sha256[key]=createHash('sha256').update(text).digest('hex');}
table('samples',['sample_id','name','source_group','subspecies','region','material_type','ped_id','legacy'],data.individuals.map(s=>({sample_id:s.id,name:s.name,source_group:s.population_id,subspecies:s.subspecies,region:'NA',material_type:s.kind,ped_id:s.ped,legacy:String(s.legacy)})));
const variants=data.genes.flatMap(g=>g.variants.map(v=>({g,v})));
table('variants',['marker_id','gene_id','chr','position','ref','alt'],variants.map(({g,v})=>({marker_id:v.id,gene_id:g.catalog.msu||g.id,chr:g.chromosome,position:v.pos,ref:v.ref,alt:v.alt??'NA'})));
table('genotypes',['sample_id',...variants.map(({v})=>v.id)],data.individuals.map(s=>Object.fromEntries([['sample_id',s.id],...variants.map(({v})=>[v.id,callOf(s,v).map(a=>a===null?'.':a===0?v.ref:v.alt).join('/')])])),true);
const envs=data.traits.flatMap(t=>(t.environments||[]).map(e=>({environment_id:e.id,trait_id:t.id,trait_name:t.name,unit:e.unit,category:t.category,family:t.family,assay:e.assay,site:e.source.site,year:e.source.year})));
table('environments',['environment_id','trait_id','trait_name','unit','category','family','assay','site','year'],envs);
table('phenotypes',['sample_id',...envs.map(e=>e.environment_id)],data.individuals.map(s=>({sample_id:s.id,...Object.fromEntries(envs.map(e=>[e.environment_id,s.phenotypes[e.environment_id]??'NA']))})),true);
const manifest={schema:'RiceFlux tables 1.0',id:'rice6044',name:'RiceAtlas 6044',version:'2026-11-14.1',assembly:'IRGSP-1.0/MSU7',source:data.meta.source,genotype_evidence:'G_chip',files,sha256,counts:{samples:data.individuals.length,variants:variants.length,environments:envs.length},notes:'region 未单独核定，保留 NA；来源组及登记亚种原样保留。基因型为正链、未分相二倍体 SNP，. 表示缺失。SHA256 对解压后的 UTF-8 文本计算。'};
put('datasets/rice6044-v1/manifest.json',JSON.stringify(manifest,null,2)+'\n');
put('datasets/index.tsv',writeTSV(['id','name','version','manifest'],[{id:manifest.id,name:manifest.name,version:manifest.version,manifest:'rice6044-v1/manifest.json'}]));
const {individuals,populations,...reference}=data;
put('datasets/reference.json.gz',gzipSync(JSON.stringify(reference)));
const summaries=[];
for(const g of data.genes){
 const c=g.catalog;
 const siteRows=g.variants.map(v=>data.evidence.sites[v.id]).filter(Boolean);
 const doi=[...new Set([...c.geneDOI,...c.backgroundDOI,...c.events.flatMap(e=>e.doi),...siteRows.flatMap(e=>[...e.primary,...e.event])])];
 for(const d of doi){
  const effect=c.events.find(e=>e.doi.includes(d)&&e.effect);
  const site=siteRows.find(e=>[...e.primary,...e.event].includes(d)&&e.note);
  const event=c.events.find(e=>e.doi.includes(d));
  const text=effect?.effect||site?.note||data.evidence.papers[d]||(event?g.name+'：该文献在本库对应'+(event.type||'变异')+'记录“'+(event.label||event.key)+'”'+(event.trait?'，涉及'+event.trait:'')+'。':null);
  if(!text)continue;
  const sentence=text.replace(/[\r\n\t]+/g,' ').replace(/[。！？]\s*(?=.)/gu,'；');
  summaries.push({gene_id:c.msu||g.id,doi:d,summary:sentence,scope:effect?'已整理事件概述':site?'已整理位点概述':data.evidence.papers[d]?'论文题名':'先验记录概述',event_id:effect?.key||event?.key||'NA'});
 }
}
put('datasets/literature.tsv',writeTSV(['gene_id','doi','summary','scope','event_id'],summaries));
console.log(JSON.stringify({samples:manifest.counts.samples,variants:variants.length,environments:envs.length,genes:data.genes.length,summaries:summaries.length}));

execFileSync('python3',['-c',`from pathlib import Path
import zipfile,sys
root=Path(sys.argv[1]);dest=root/'datasets/rice6044-v1.zip'
with zipfile.ZipFile(str(dest)+'.partial','w',zipfile.ZIP_DEFLATED) as z:
 for f in sorted((root/'datasets/rice6044-v1').iterdir()):z.write(f,'rice6044-v1/'+f.name)
 z.write(root/'datasets/README.txt','README.txt')
Path(str(dest)+'.partial').replace(dest)
`,root]);
