import test from 'node:test';
import assert from 'node:assert/strict';
import {columns,writeTSV} from './formats.js';
import {readPrior,resolvePrior,matchMarker} from './exchange.js';
test('eight-column priors preserve ordered and missing components and unplaced rows',()=>{
  const body='G\tgrain\ttext\tID1\tChr06\t123,NA,12\tG,NA,A\tHap1';
  const [record]=readPrior('\uFEFF'+columns.join('\t')+'\r\n'+body+'\r\n');
  assert.deepEqual(record.sites,[{pos:123,ref:'G'},{pos:null,ref:null},{pos:12,ref:'A'}]);
  const marker={id:'Chr06:123',pos:123,ref:'G'};
  const gene={name:'G',id:'rap1',chromosome:'Chr6',catalog:{msu:'ID1',aliases:[]},variants:[marker]};
  assert.equal(resolvePrior(record,[gene]),gene);assert.equal(matchMarker(gene,record,record.sites[0]),marker);
  assert.equal(matchMarker(gene,record,{pos:123,ref:'C'}),null);
  assert.equal(resolvePrior({...record,row:{...record.row,MSU_ID:'other'}},[gene]),null);
  assert.equal(writeTSV(columns,[record.row]),columns.join('\t')+'\n'+body+'\n');
  for(const change of ['0,NA,12','31248788,NA,12','12.5,NA,12'])assert.throws(()=>readPrior(columns.join('\t')+'\n'+body.replace('123,NA,12',change)));
  assert.equal(readPrior(columns.join('\t')+'\nG\t\t\t\t\t\t\t')[0].sites[0].pos,null);
});

import {bindPrior,priorResults,comparisonResults,priorGraph} from './exchange.js';
import {formats,materialRow,matchesMaterial,namespace} from './formats.js';
const header = columns.join('\t');
const marker = {id:'Chr06:123',pos:123,ref:'G',alt:'A'};
const gene = {id:'g1',name:'A',chromosome:'Chr6',variants:[marker],catalog:{msu:'ID1'}};
const cohort = [{id:'S1',name:'Registry name',ploidy:2,population_id:'SC',kind:'landrace',genotypes:{'Chr06:123':[1,null]}}];
const evidence = {genes:{g1:['10.0000/background']},sites:{'Chr06:123':{level:'文献单倍型组分',primary:[],event:['10.0000/event'],background:['10.0000/background']}}};

test('TSV and JSON-LD keep input row, ordered unmatched sites, evidence scopes and allele denominators',()=>{
  const body = [
    header+'\tSource_DOI',
    'A\tgrain\tclaim\tID1\t6\t123,NA,124\tG,NA,T\tH1\thttps://doi.org/10.0000/input',
    'Unknown\t\t\t\t\t\t\t\t'
  ].join('\n');
  const rows=bindPrior(readPrior(body),[gene]);
  const result=priorResults(rows,cohort,evidence);
  assert.deepEqual(result.map(r=>[r.Input_row,r.Component,r.Status]),[[2,1,'matched'],[2,2,'position_missing'],[2,3,'site_unmatched'],[3,1,'gene_unresolved']]);
  assert.equal(result[0].Input_DOI,'10.0000/input');
  assert.equal(result[0].Functional_DOI,'');
  assert.equal(result[0].Event_DOI,'10.0000/event');
  assert.equal(result[0].Gene_DOI,'10.0000/background');
  assert.equal(result[0].ALT_frequency,1);
  assert.equal(result[1].Called_copies,undefined);
  const nodes=priorGraph(rows,result,'test.tsv',cohort)['@graph'];
  const event=nodes.find(n=>n.inputRow===2);
  assert.deepEqual(event.orderedComponents['@list'].map(x=>x['@id']),['_:r2c1','_:r2c2','_:r2c3']);
  assert.equal(event.suppliedFields['@value'].Source_DOI,'https://doi.org/10.0000/input');
  const matches=nodes.filter(n=>n['@type']==='ComponentMatch');
  assert.equal(matches[0].matchedSite['@id'],namespace+'site_Chr6_123_G');
  assert.equal(matches[0].altCopies,1);
  assert.equal(matches[1].matchedSite,undefined);
  assert.deepEqual(nodes.find(n=>n['@type']==='Cohort').accessionIds,['S1']);
  assert.equal(priorResults(rows,[],evidence)[0].ALT_frequency,null);
  assert.equal(comparisonResults([{...gene,variants:[]}],[],evidence)[0].Status,'no_typed_site');
  assert.throws(()=>readPrior(body.replace('https://doi.org/10.0000/input','unknown reference')),/Source_DOI/);
  assert.equal(formats.priorResults.columns.includes('Functional_DOI'),true);
});

test('search and material exports use registry identity even if a candidate alias is present',()=>{
  const legacy={...cohort[0],name_zh:'候选别名',name_status:'study_name',ped:'S1-old'};
  assert.ok(matchesMaterial(legacy,'registry'));
  assert.ok(matchesMaterial(legacy,'s1-old'));
  assert.equal(matchesMaterial(legacy,'候选别名'),false);
  assert.deepEqual(Object.keys(materialRow(legacy)),formats.materialMarkers.columns);
  assert.equal(materialRow(legacy).original_name,'Registry name');
});
