import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {datasetTableKeys,readPackage,readTable} from '../src/explorer/datasets.js';
import {mergePavTables,vcfToTables} from '../src/explorer/dataImport.js';
import {readVcf} from '../src/explorer/vcf.js';

const [vcfFile, observationDir, manifestFile, output,...options]=process.argv.slice(2);
const referencePath=options.find(option=>option.startsWith('--reference='))?.slice('--reference='.length);
const predecessor=options.find(option=>option.startsWith('--append-to='))?.slice('--append-to='.length);
if(!output||options.some(flag=>!/^--(reference|append-to)=.+$/.test(flag)))
  throw Error('Usage: node scripts/intake-vcf.mjs INPUT.vcf[.gz] OBSERVATIONS MANIFEST NEW_DATASET_DIR [--reference=FILE] [--append-to=DATASET]');
const publicDir=path.resolve(import.meta.dirname,'../public');
function readText(file) {
  const bytes=fs.readFileSync(file);
  return (bytes[0]===31&&bytes[1]===139?gunzipSync(bytes):bytes).toString('utf8');
}
const sha=value=>createHash('sha256').update(value).digest('hex');
const reference=JSON.parse(readText(referencePath||path.join(publicDir,'datasets/reference.json.gz')));
reference.traitRegistry=readTable(readText(path.join(publicDir,'formats/traits.tsv'))).objects();
const manifest=JSON.parse(readText(manifestFile)),text=readText(vcfFile);
const samples=readText(path.join(observationDir,'samples.tsv'));
const ids=readTable(samples,['sample_id']).rows.map(row=>row[0]);
const vcf=readVcf(text,reference.genes);
if(vcf.issues.length)throw Error('Preselected regional VCF has unbound records: '+JSON.stringify(vcf.issues.slice(0,12)));
const digest=sha(text);
const pavSourceId='input_vcf_pav_'+digest.slice(0,12);
const {pav:variantPav,...genotypeTables}=vcfToTables(vcf,ids,undefined,pavSourceId);
const tables={samples,...genotypeTables};
for(const key of ['environments','phenotypes','pav','descriptors','pav_summary']){
  const file=path.join(observationDir,key+'.tsv');
  if(fs.existsSync(file))tables[key]=readText(file);
}
if(predecessor){
  const previous=JSON.parse(readText(path.join(predecessor,'manifest.json')));
  if(previous.id!==manifest.id||previous.version===manifest.version)throw Error('Append requires a new version of the same dataset');
  for(const [key,filename] of Object.entries(previous.files)){
    const value=readText(path.join(predecessor,filename));
    if(sha(value)!==previous.sha256[key])throw Error('Prior dataset hash mismatch: '+key);
    if(key==='pav'){
      if(tables.pav&&tables.pav!==value)throw Error('Append changed source PAV rows');
      tables.pav=value;
      continue;
    }
    if(key!=='genotypes'&&key!=='variants'){
      if(tables[key]!==value)throw Error('Append changed a non-genotype source table: '+key);
      continue;
    }
    if(!vcf.records.length){tables[key]=value;continue;}
    if(key==='variants'){
      const firstLineEnd=tables.variants.indexOf('\n');
      if(value.indexOf('\n')!==firstLineEnd||!value.startsWith(tables.variants.slice(0,firstLineEnd+1)))
        throw Error('Incompatible variant table columns');
      tables.variants=value+tables.variants.slice(firstLineEnd+1);
      continue;
    }
    const oldRows=value.trimEnd().split('\n'),newRows=tables.genotypes.trimEnd().split('\n');
    if(oldRows.length!==newRows.length)throw Error('Append changed genotype sample count');
    tables.genotypes=oldRows.map((row,i)=>{
      const oldAxis=row.indexOf('\t'),addition=newRows[i],newAxis=addition.indexOf('\t');
      if(oldAxis===-1||newAxis===-1||row.slice(0,oldAxis)!==addition.slice(0,newAxis))
        throw Error('Append changed genotype row order: '+(i+1));
      return row+addition.slice(newAxis);
    }).join('\n')+'\n';
  }
  delete manifest.counts;
}
if(variantPav){
  tables.pav=mergePavTables(tables.pav,variantPav);
  manifest.provenance??={schema:'RiceFlux provenance 1.0',sources:[]};
  manifest.provenance.sources.push({id:pavSourceId,role:'pav',release:manifest.version,citation:manifest.source,
    method:'VCF GT · ≥50 bp 片段存在/缺失',assembly:manifest.assembly,
    files:[{name:path.basename(vcfFile),sha256:digest,hash_scope:'decoded UTF-8 VCF'}]});
}
manifest.files=Object.fromEntries(Object.keys(tables).map(key=>[key,key+'.tsv'+(Buffer.byteLength(tables[key])>500000?'.gz':'')]));
manifest.sha256=Object.fromEntries(Object.entries(tables).map(([key,table])=>[key,sha(table)]));
manifest.provenance.normalized_vcf={name:path.basename(vcfFile),sha256:digest,hash_scope:'decoded UTF-8 VCF'};
if(datasetTableKeys(manifest).length!==Object.keys(tables).length)throw Error('Unregistered table in observations');
const bundle=await readPackage(manifest,filename=>tables[filename.split('.')[0]],reference);
manifest.counts={samples:bundle.samples.length,variants:bundle.variants.length,environments:bundle.environments.length,
  ...bundle.pav.length&&{pav:bundle.pav.length}};
fs.mkdirSync(output);
for(const [key,filename] of Object.entries(manifest.files)){
  const bytes=filename.endsWith('.gz')?gzipSync(tables[key],{level:6}):tables[key];
  fs.writeFileSync(path.join(output,filename+'.partial'),bytes,{flag:'wx'});
  fs.renameSync(path.join(output,filename+'.partial'),path.join(output,filename));
}
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({...manifest.counts,package:output,sha256:manifest.sha256},null,2));
