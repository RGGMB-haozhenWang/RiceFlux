import test from 'node:test';
import assert from 'node:assert/strict';
import {measuredTraitChoices,showFrequencyGroup,markerDatasetSupport} from './researcherUi.js';

test('synonyms share a menu choice while original assay, scale, site and time survive',()=>{
  const traits=[{id:'a',name:'抽穗期',environments:[{assay:'days',unit:'d',source:{site:'A',year:2020}}]},
    {id:'b',name:'Days to heading',environments:[{assay:'score',unit:'score',source:{site:'B',year:2021}}]},
    {id:'c',name:'株高'},{id:'d',name:'茎秆长度'}];
  const choices=measuredTraitChoices(traits);
  assert.equal(choices.length,3);
  assert.deepEqual(choices[0].traits,[traits[0],traits[1]]);
  assert.equal(choices[0].traits[1],traits[1]);
});
test('only exact observed ALT zero is hidden; tiny AF and missing remain',()=>{
  assert.equal(showFrequencyGroup({called:20,alt:0}),false);
  assert.equal(showFrequencyGroup({called:0,alt:0}),true);
  assert.equal(showFrequencyGroup({called:200000,alt:1}),true);
});
test('support uses dataset-marker axes including not loaded metadata, never gene totals',()=>{
  const data={meta:{datasets:[{id:'loaded'}]},datasetBundles:[{manifest:{id:'loaded',name:'Loaded'},variants:[{id:'a',gene:'g'},{id:'x',gene:'other'}]}]};
  const support=markerDatasetSupport(data,{id:'g'},[
    {dataset_id:'remote',badge:'Remote',marker_ids:'b;a'},
    {dataset_id:'gene_only',badge:'Unknown markers',marker_count:40}]);
  assert.equal(support.get('a').size,2);
  assert.equal(support.get('a').get('loaded').loaded,true);
  assert.equal(support.get('b').get('remote').loaded,false);
  assert.equal(support.has('x'),false);
  assert.equal([...support.values()].some(ds=>ds.has('gene_only')),false);
});
