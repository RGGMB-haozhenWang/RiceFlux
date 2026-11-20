import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {readTable,parseDataset,combineDatasets} from './datasets.js';
import {callOf} from './catalog.js';
import {datasetCalls,geneEvidence,geneSupport,geneTraits,phenotypeSupport} from './provenance.js';
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
  assert.deepEqual(phenotypeSupport(data,gs3),[]);
});
test('P follows curated gene–trait links and observed values in the active datasets',()=>{
  const dth7=reference.genes.find(g=>g.name==='DTH7'),alk=reference.genes.find(g=>g.name==='ALK');
  const trait=(id,n)=>({id,environments:[{source:{n}}]});
  const heading=trait('heading',1),sheath=trait('sheath',1),extra=trait('custom_exploration',1);
  const data={meta:{synthetic:false},reference,traits:[heading,sheath,extra]};
  assert.deepEqual(phenotypeSupport(data,{...dth7,trait_ids:[...dth7.trait_ids,extra.id]}),[heading]);
  assert.deepEqual(phenotypeSupport(data,alk),[]);
  assert.deepEqual(phenotypeSupport({...data,traits:[trait('heading',0),sheath,extra]},dth7),[]);
  assert.deepEqual(phenotypeSupport({...data,meta:{synthetic:true}},dth7),[]);
});
test('InDel evidence requires an observed ALT in the current dataset version',()=>{
  const gene={id:'g'}, version='v2', dataset_id='calls';
  const variant=(id,markerType='InDel')=>({id,markerType,gene:gene.id});
  const variants=[variant('reference'),variant('missing'),variant('deletion'),variant('snp','SNP')];
  const columns=new Map([['reference',Uint8Array.of(0,20)],['missing',Uint8Array.of(24)],
    ['deletion',Uint8Array.of(0,6)],['snp',Uint8Array.of(6)]]);
  const data={datasetRegistry:[{id:dataset_id,version}],datasetBundles:[{manifest:{id:dataset_id,version},variants,columns}],
    annotations:{variantCoverage:[{dataset_id,dataset_version:'v1',gene_id:gene.id,indel_sites:5}]}};
  assert.equal(geneEvidence(data,gene,dataset_id).indel,true);
  assert.equal(geneSupport(data,gene)[0].indel_sites,1);
  const referenceOnly={...data,datasetBundles:[{...data.datasetBundles[0],variants:variants.filter(v=>v.id!=='deletion')}]};
  assert.equal(geneEvidence(referenceOnly,gene,dataset_id).indel,false);
});
test('gene trait display links exact curated terms to available endpoints and retains unmeasured terms',()=>{
  const gl7=reference.genes.find(g=>g.name==='GL7'),dth7=reference.genes.find(g=>g.name==='DTH7');
  const qgl7=reference.genes.find(g=>g.name==='qGL7'),alk=reference.genes.find(g=>g.name==='ALK');
  const observed={source:{n:2,dataset_id:'rice6044'}};
  const width={id:'width',name:'粒宽',family:'width',environments:[observed]};
  const data={meta:{synthetic:false},reference,traits:[...reference.traits.filter(t=>t.id!=='width').map(({environments,...t})=>t),width]};
  assert.ok(!gl7.trait_ids.includes('width'));
  assert.ok(geneTraits(data,gl7).includes(width));
  assert.deepEqual(phenotypeSupport(data,gl7,'rice6044'),[width]);
  assert.deepEqual(phenotypeSupport(data,gl7,'ricenavi404'),[]);
  assert.ok(geneTraits(data,dth7).some(t=>t.id==='prior_株高'&&!t.environments));
  assert.ok(!geneTraits(data,dth7).some(t=>t.id==='sheath'||t.id.startsWith('v4_')));
  assert.deepEqual(geneTraits(data,qgl7).map(t=>t.id),['length']);
  const quality={id:'quality',name:'米质／糊化',family:'quality',environments:[observed]};
  assert.deepEqual(geneTraits({...data,traits:[...data.traits,quality]},alk).map(t=>t.id),['quality']);
});
test('existing phenotype columns retain provenance and all new grain counts bind to declared workbook columns',()=>{
  const all=readTable(text('annotations/environments.tsv')).objects();
  const envs=all.filter(e=>e.trait_id!=='grains_per_panicle');assert.equal(envs.length,66);
  const grain=all.filter(e=>e.trait_id==='grains_per_panicle');assert.equal(grain.length,13);
  assert.equal(new Set(grain.map(e=>e.site)).size,7);
  assert.equal(grain.find(e=>e.column==='BJ').site,'Hefei');
  for(const e of grain){assert.equal(e.unit,'粒/穗');assert.match(e.source_locator,/调整顺序-确定!B[A-Z]1:B[A-Z]3609/);}
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
