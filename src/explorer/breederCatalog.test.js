import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {readTable} from './datasets.js';
import {catalogColumns,catalogRows,observationEvidence} from './breederCatalog.js';

const dataset={id:'fixture',version:'1',source:'Synthetic test'};
const axis={id:'env',trait_id:'length',trait_name:'粒长',assay:'直测',unit:'mm',environment:'env',
  dataset:'fixture',version:'1',source:{environment_id:'env',site:'甲地',year:'2026'}};

test('observation identity separates methods/scales and versions trial context',()=>{
  const evidence=observationEvidence(axis,dataset);
  assert.equal(evidence.methodId,'RF:method:length:直测');
  assert.equal(evidence.scaleId,'RF:scale:mm');
  assert.equal(evidence.ontologyId,null);
  assert.equal(evidence.mappingStatus,'unmapped');
  assert.equal(evidence.mappingCaption,'外部性状本体未映射');
  assert.equal(evidence.growthStage,null);
  assert.equal(evidence.source,'Synthetic test');
  assert.match(evidence.caption,/粒长.*直测.*mm.*甲地.*2026/);
  assert.notEqual(observationEvidence({...axis,method_id:'other'},dataset).variableIri,evidence.variableIri);
  assert.notEqual(observationEvidence({...axis,scale_id:'other'},dataset).variableIri,evidence.variableIri);
  const next=observationEvidence({...axis,version:'2'},dataset);
  assert.equal(next.variableIri,evidence.variableIri);
  assert.notEqual(next.environmentIri,evidence.environmentIri);
  assert.equal(observationEvidence(null,dataset),null);
  assert.equal(observationEvidence({...axis,version:null},{id:'other',version:'9'}).environmentIri,null);
});

test('mapping relationship and unknown measurement metadata remain explicit',()=>{
  const evidence=observationEvidence({...axis,ontology_id:'TO:0000384',mapping_status:'related',growth_stage:'maturity'},dataset);
  assert.equal(evidence.mappingCaption,'相关映射 · TO:0000384');
  assert.equal(evidence.growthStage,'maturity');
  const unknown=observationEvidence({trait_id:'unknown',source:{}},dataset);
  assert.equal(unknown.variableIri,null);
  assert.equal(unknown.environmentIri,null);
  assert.match(unknown.environmentCaption,/未登记地点.*未登记年份/);
});

test('catalog keeps the first six headers and exports provenance without filling missing observations',()=>{
  assert.deepEqual(catalogColumns.slice(0,6),['编号','性状','基因','染色体','基因型','表现型']);
  const sample={id:'qualified-id',source_sample_id:'001',dataset_id:'fixture',phenotypes:{env:null}};
  const [row]=catalogRows([sample],dataset,axis,{min:null,max:null},new Map(),[],new Map(),{});
  assert.equal(row.编号,'001');
  assert.equal(row.表现型,null);
  assert.equal(row.表型状态,'缺测');
  assert.equal(row.外部性状本体ID,null);
  assert.equal(row.本体映射状态,'unmapped');
  assert.match(row.材料IRI,/\/accession\/fixture\/001$/);
  assert.match(row.数据版本IRI,/\/dataset\/fixture\/1$/);
  assert.equal(row.观测变量IRI,observationEvidence(axis,dataset).variableIri);
  assert.equal(row.数据来源,dataset.source);
  assert.ok(Object.keys(row).every(key=>catalogColumns.includes(key)));
});

test('packaged observation identifiers resolve to the frozen ontology graph',()=>{
  const root=new URL('../../public/',import.meta.url);
  const graph=JSON.parse(gunzipSync(readFileSync(new URL('formats/ontology/v1/graph.jsonld.gz',root))));
  const nodes=new Map(graph['@graph'].map(node=>[node['@id'],node]));
  const registry=new URL('datasets/index.tsv',root);
  const releases=readTable(readFileSync(registry,'utf8')).objects();
  assert.ok(releases.some(entry=>entry.id==='rice6044'));
  for(const release of releases){
    const manifestUrl=new URL(release.manifest,registry);
    const manifest=JSON.parse(readFileSync(manifestUrl));
    const rows=readTable(readFileSync(new URL(manifest.files.environments,manifestUrl),'utf8')).objects();
    for(const row of rows){
      const evidence=observationEvidence({...row,source:{...row},environment:row.environment_id},manifest);
      assert.equal(nodes.get(evidence.traitIri)?.['@type'],'Trait');
      assert.equal(nodes.get(evidence.variableIri)?.['@type'],'ObservationVariable');
      assert.equal(nodes.get(evidence.environmentIri)?.observationVariable['@id'],evidence.variableIri);
    }
  }
});
