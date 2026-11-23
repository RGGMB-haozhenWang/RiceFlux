import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {extendGeneCatalog} from './geneCatalog.js';
import {findGenes,resolveGeneQuery} from './geneSearch.js';
const read=p=>readFileSync(new URL('../../public/'+p,import.meta.url));
const reference=JSON.parse(gunzipSync(read('datasets/reference.json.gz')));
const manifest=JSON.parse(read('datasets/cloned_catalog/manifest.json'));
const text=gunzipSync(read('datasets/cloned_catalog/genes.tsv.gz')).toString();

test('complete workbook records enrich exact legacy identities and retain all unresolved rows',async()=>{
  const data=await extendGeneCatalog(reference,manifest,text);
  assert.equal(data.genes.length,5698);
  assert.equal(new Set(data.genes.map(g=>g.id)).size,data.genes.length);
  assert.equal(data.genes.filter(g=>g.id.startsWith('UNRESOLVED_')).length,162);
  const covered=data.genes.filter(g=>g.catalog?.sourceRows?.length);
  assert.equal(covered.length,5664);
  assert.equal(covered.flatMap(g=>g.catalog.sourceRows).length,5680);
  assert.ok(covered.every(g=>g.catalog.evidenceAbstract&&g.catalog.originalNames.length));
  assert.equal(covered.filter(g=>g.catalog.bibliographyStatus==='missing_doi').length,136);
  for(const old of reference.genes){
    const g=data.genes.find(g=>g.id===old.id);
    assert.equal(g.name,old.name);assert.deepEqual(g.variants,old.variants);
    assert.equal(g.gene_start,old.gene_start);assert.deepEqual(g.records,old.records);
  }
  for(const g of data.genes.filter(g=>g.id.startsWith('UNRESOLVED_'))){
    assert.equal(g.catalog.msu,'');assert.equal(g.catalog.rap,'');assert.equal(g.model,null);
    assert.equal(g.catalog.identityStatus,'unresolved_no_stable_id');
    assert.ok(findGenes(data.genes,g.name).some(x=>x.id===g.id));
  }
  const dcm=covered.find(g=>g.catalog.originalNames.includes('DCM1'));
  assert.match(dcm.catalog.evidenceAbstract,/雄配子体发育/);
  assert.doesNotMatch(dcm.catalog.evidenceAbstract,/雄配子发生发育/);
  await assert.rejects(extendGeneCatalog(reference,{...manifest,sha256:'bad'},text),/哈希/);
  await assert.rejects(extendGeneCatalog(reference,{...manifest,counts:{...manifest.counts,enrichment_entries:0}},text),/条目数/);
});

test('ambiguous aliases and fuzzy suggestions never establish an exact identity',()=>{
  const genes=[{id:'one',name:'OsTEST1',catalog:{aliases:['shared']}},{id:'two',name:'OsTEST2',catalog:{aliases:['shared']}}];
  assert.equal(resolveGeneQuery(genes,'OsTEST1').status,'exact');
  assert.equal(resolveGeneQuery(genes,'shared').status,'ambiguous');
  assert.equal(resolveGeneQuery(genes,'shared').gene,null);
  const fuzzy=resolveGeneQuery(genes,'OsTEST');
  assert.equal(fuzzy.status,'unresolved');assert.equal(fuzzy.gene,null);assert.equal(fuzzy.suggestions.length,2);
});
