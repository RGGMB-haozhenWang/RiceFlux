import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {readTable,readPackage} from '../src/explorer/datasets.js';
import {chromNum} from '../src/explorer/exchange.js';
import {assetName,packedSchema,packedAxes,openPackedDataset} from '../src/explorer/packedDataset.js';
import {archiveEntry} from '../src/explorer/portableArchive.js';
import {extendGeneCatalog,geneCatalogPath} from '../src/explorer/geneCatalog.js';
import {bundleGeneCoverage,coverageFields,coveragePath} from '../src/explorer/geneCoverage.js';
import {writeTSV} from '../src/explorer/formats.js';

const [input,output,flag]=process.argv.slice(2);
if(!input||!output||flag&&!['--keep-source-tables'].includes(flag)){
  throw Error('Usage: node scripts/pack-datasets.mjs <existing datasets dir> <new datasets dir> [--keep-source-tables]');
}
const source=path.resolve(input),destination=path.resolve(output);
assert.ok(!destination.startsWith(source+path.sep)&&!fs.existsSync(destination),'Output must be a new directory outside the input');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const decode=bytes=>(bytes[0]===31&&bytes[1]===139?gunzipSync(bytes):Buffer.from(bytes)).toString('utf8');
const assertResident=file=>{
  // The input is an already verified release. lstat protects against opening symlinks in its registry.
  assert.ok(fs.lstatSync(file).isFile(),'Expected a regular file: '+file);
};
function file(name){
  const target=path.join(source,name);
  assertResident(target);
  return fs.readFileSync(target);
}
function write(name,bytes){
  const target=path.join(destination,name);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target+'.partial',bytes,{flag:'wx'});
  fs.renameSync(target+'.partial',target);
}
const registry=readTable(decode(file('index.tsv')),['id','version','manifest'],'index').objects();
let reference=JSON.parse(decode(file('reference.json.gz')));
if(fs.existsSync(path.join(source,geneCatalogPath))){
  const catalog=JSON.parse(decode(file(geneCatalogPath)));
  reference=await extendGeneCatalog(reference,catalog,decode(file('cloned_catalog/genes.tsv.gz')));
}
reference.traitRegistry=readTable(fs.readFileSync(path.join(source,'../formats/traits.tsv'),'utf8')).objects();
const omit=new Set();
const receipt=[],coverage=[];
fs.mkdirSync(destination);
function store(raw){
  const sha256=hash(raw),name=assetName(sha256);
  if(!fs.existsSync(path.join(destination,name)))write(name,gzipSync(raw,{level:9}));
  return {sha256,bytes:raw.length};
}
function markerBlocks(markers){
  const grouped=new Map();
  for(const marker of markers){
    if(!grouped.has(marker.gene))grouped.set(marker.gene,[]);
    grouped.get(marker.gene).push(marker);
  }
  const ordered=[...grouped.values()].sort((a,b)=>chromNum(a[0].chromosome)-chromNum(b[0].chromosome)||a[0].pos-b[0].pos);
  const groups=[];
  for(const gene of ordered){
    const last=groups.at(-1);
    if(last&&last[0].chromosome===gene[0].chromosome&&last.length+gene.length<=32)last.push(...gene);
    else for(let at=0;at<gene.length;at+=32)groups.push(gene.slice(at,at+32));
  }
  return groups;
}
for(const row of registry){
  assert.match(row.manifest,/^[-\w]+\/manifest\.json$/);
  const bytes=file(row.manifest),manifest=JSON.parse(decode(bytes));
  assert.equal(manifest.id,row.id);
  assert.equal(manifest.version,row.version);
  const dir=path.dirname(row.manifest),archive=dir+'.zip',archiveBytes=file(archive);
  const bundle=await readPackage(manifest,name=>decode(file(dir+'/'+name)),reference);
  coverage.push(...bundleGeneCoverage(bundle,reference.evidence));
  const member_prefix=await archiveEntry(archiveBytes,dir+'/manifest.json').then(()=>dir+'/',()=>{
    return archiveEntry(archiveBytes,'manifest.json').then(()=>'');
  });
  const legacyFiles=Object.values(manifest.files).map(name=>dir+'/'+name);
  for(const [key,name] of Object.entries(manifest.files)){
    assert.equal(hash(decode(await archiveEntry(archiveBytes,member_prefix+name))),hash(bundle.texts[key]),name+' differs from the portable ZIP');
  }
  const axes=store(Buffer.from(JSON.stringify(Object.fromEntries(packedAxes(manifest).map(key=>[key,bundle.texts[key]])))));
  const blocks=markerBlocks(bundle.variants).map(group=>({
    ...store(Buffer.concat(group.map(v=>bundle.columns.get(v.id)))),
    markers:group.map(v=>v.id),
  }));
  const indexed={...manifest,packed:{schema:packedSchema,axes,blocks,archive,member_prefix}};
  let fetched=[];
  const compiled=await openPackedDataset(indexed,async name=>{
    fetched.push(name);
    return fs.readFileSync(path.join(destination,name));
  },async key=>decode(await archiveEntry(archiveBytes,member_prefix+manifest.files[key])),reference);
  assert.deepEqual(compiled.samples,bundle.samples);
  assert.deepEqual(compiled.variants,bundle.variants);
  assert.deepEqual(compiled.environments,bundle.environments);
  assert.deepEqual(compiled.phenotypes,bundle.phenotypes);
  assert.deepEqual(compiled.pav,bundle.pav);
  assert.deepEqual(compiled.descriptors,bundle.descriptors);
  const dth7=reference.genes.find(g=>g.name==='DTH7')?.id;
  await compiled.loadGenes([dth7]);
  const startupAssets=[...fetched];
  await compiled.loadGenes([...new Set(bundle.variants.map(v=>v.gene))]);
  for(const [id,column] of bundle.columns)assert.deepEqual(compiled.columns.get(id),column,id);
  assert.equal(await compiled.sourceText('genotypes'),bundle.texts.genotypes);
  const packedManifest=JSON.stringify(indexed,null,2)+'\n';
  write(row.manifest,packedManifest);
  omit.add(row.manifest);
  if(flag!=='--keep-source-tables')for(const name of legacyFiles)omit.add(name);
  const stored=files=>[...new Set(files)].reduce((sum,name)=>sum+fs.statSync(path.join(destination,name)).size,0);
  receipt.push({
    id:row.id,version:row.version,manifest_sha256:hash(bytes),source_sha256:manifest.sha256,
    sample_count:bundle.samples.length,marker_count:bundle.variants.length,environment_count:bundle.environments.length,pav_count:bundle.pav.length,
    calls_checked:bundle.samples.length*bundle.variants.length,phenotype_cells_checked:bundle.phenotypes.size*bundle.environments.length,
    legacy_table_bytes:bytes.length+legacyFiles.reduce((sum,name)=>sum+fs.statSync(path.join(source,name)).size,0),
    legacy_decoded_gt_bytes:Buffer.byteLength(bundle.texts.genotypes),packed_payload_bytes:Buffer.byteLength(packedManifest)+stored(fetched),
    dth7_payload_bytes:Buffer.byteLength(packedManifest)+stored(startupAssets),portable_zip_bytes:archiveBytes.length,
    blocks:blocks.length,variants_per_block:Math.max(0,...blocks.map(block=>block.markers.length)),
  });
}
function retain(dir=''){
  for(const entry of fs.readdirSync(path.join(source,dir),{withFileTypes:true})){
    const name=path.join(dir,entry.name);
    if(entry.isDirectory())retain(name);
    else if(!omit.has(name)&&entry.isFile())write(name,file(name));
  }
}
retain();
write(coveragePath,gzipSync(writeTSV(coverageFields,coverage),{level:9}));
console.log(JSON.stringify({schema:packedSchema,keep_source_tables:flag==='--keep-source-tables',catalog_genes:reference.genes.length,
  coverage_rows:coverage.length,datasets:receipt},null,2));
