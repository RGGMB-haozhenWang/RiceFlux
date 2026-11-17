import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readTable,parseDataset,combineDatasets} from './datasets.js';
import {callOf} from './catalog.js';
import {datasetCalls,geneSupport} from './provenance.js';
import {percentile,radarRows} from './analysis.js';
const base=new URL('../../public/',import.meta.url),bytes=p=>fs.readFileSync(new URL(p,base));
const text=p=>(p.endsWith('.gz')?gunzipSync(bytes(p)):bytes(p)).toString();
const reference=JSON.parse(text('datasets/reference.json.gz'));
const manifest=JSON.parse(text('datasets/ricenavi-v1/manifest.json'));
const texts=Object.fromEntries(Object.entries(manifest.files).map(([key,file])=>[key,text('datasets/ricenavi-v1/'+file)]));
const bundle=parseDataset(manifest,texts,reference);

test('RiceNavi imports all 404 accessions and every admitted allele without certifying source phase or quality',()=>{
  const data=combineDatasets(reference,[bundle]);
  const map=new Map(data.genes.flatMap(g=>g.variants).map(v=>[v.id,v])),samples=new Map(data.individuals.map(s=>[s.id,s]));
  const admission=readTable(text('annotations/ricenavi_admission.tsv')).objects(),ids=new Map(admission.filter(r=>r.status==='admitted').map(r=>[r.external_id,r.marker_id]));
  assert.equal(admission.length,319);assert.equal(ids.size,23);assert.equal(samples.size,404);assert.equal(data.genes.filter(g=>g.variants.length).length,18);
  let checked=0,missing=0,heterozygous=0;
  for(const r of readTable(text('sources/ricenavi-20261025/calls.tsv.gz')).objects())if(ids.has(r.external_id)){
    const v=map.get(ids.get(r.external_id)),raw=JSON.parse(r.decoded_alleles.replace(/^"|"$/g,'').replaceAll('""','"'))||[null,null];
    const expected=raw.map(a=>a===v.ref?v.ref:a===v.alt?v.alt:'.').sort();
    const actual=callOf(samples.get(r.material_id),v).map(a=>a===null?'.':a===0?v.ref:v.alt).sort();
    assert.deepEqual(actual,expected);checked++;
    missing+=Number(actual.every(x=>x==='.'));heterozygous+=Number(!actual.includes('.')&&actual[0]!==actual[1]);
  }
  assert.equal(checked,9292);assert.equal(missing,252);assert.equal(heterozygous,60);
  assert.equal(bundle.environments.length,0);assert.ok(data.individuals.every(s=>Object.keys(s.phenotypes).length===0));
  assert.equal(manifest.confidence,'not_certified');
  for(const [key,value] of Object.entries(texts))assert.equal(createHash('sha256').update(value).digest('hex'),manifest.sha256[key]);
});
test('identity audit retains all genes, MSU gaps and shared aliases; supports do not equate completeness with HC',()=>{
  const identities=readTable(text('annotations/gene_identity.tsv')).objects(),support=readTable(text('annotations/dataset_gene_support.tsv')).objects();
  assert.equal(identities.length,485);assert.equal(new Set(identities.map(r=>r.gene_id)).size,485);
  assert.equal(identities.filter(r=>r.identity_status==='msu_unresolved').length,36);
  assert.equal(identities.filter(r=>r.shared_aliases).length,22);
  const data={...combineDatasets(reference,[bundle]),annotations:{support},datasetBundles:[bundle],datasetRegistry:[{id:'rice6044'},{id:'ricenavi404'}]};
  const gs3=data.genes.find(g=>g.name==='GS3'),row=datasetCalls(data,gs3,data.individuals)[0];
  assert.equal(row.samples,404);assert.equal(row.markers,1);assert.equal(row.total,808);assert.ok(row.complete>0);assert.equal(row.confidence,'not_certified');
  assert.deepEqual(geneSupport(data,gs3).map(r=>r.badge),['D1','D2']);assert.ok(support.every(r=>r.high_confidence_sites==='0'));
});
test('all 66 phenotype columns retain endpoint provenance, including unresolved source spelling and protocols',()=>{
  const envs=readTable(text('annotations/environments.tsv')).objects();assert.equal(envs.length,66);
  const dictionary=new Map(readTable(text('prior/phenotype_dictionary.tsv')).objects().map(r=>[r.column,r]));
  for(const e of envs){const source=dictionary.get(e.column);assert.equal(e.site,source.site);assert.equal(e.year,source.year);assert.equal(e.original_trait,source.trait);assert.equal(e.latitude,'');assert.match(e.method_status,/pending/);}
  assert.ok(envs.some(e=>e.site==='Jinhai'&&e.site_status.includes('unresolved')));assert.ok(envs.some(e=>e.site==='Jinzhai'));
});
test('batched radar ranking equals independent percentile formula for ties, missing and values outside reference',()=>{
  const values=[null,-4,0,2,2,5,5,5,13],reference=values.map((v,i)=>({id:String(i),phenotypes:{e:v}}));
  const requested=[null,-10,-4,1,2,3,5,9,13,90].map((v,i)=>({id:'S'+i,phenotypes:{e:v}}));
  const rows=radarRows(requested,reference,[{id:'e',source:{site:'S',year:'2023'}}]);
  assert.equal(rows.length,10);rows.forEach((r,i)=>assert.equal(r.percentile,percentile(requested[i].phenotypes.e,values)));
});
