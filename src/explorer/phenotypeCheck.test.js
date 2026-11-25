import test from 'node:test';
import assert from 'node:assert/strict';
import {checkObservation,validatePhenotypeCheck} from './phenotypeCheck.js';

const sample={dataset_id:'D1',phenotypes:{'2023/HF/length':8,'2022/HF/length':3,'2023/HF/score':0}};
const endpoint={id:'2023/HF/length',unit:'mm',source:{dataset_id:'D1'}};

test('a check uses the exact dataset and trial, including true zero observations',()=>{
  assert.deepEqual(checkObservation(sample,endpoint,5),{value:8,band:[7.6,8.4]});
  assert.deepEqual(checkObservation(sample,{...endpoint,id:'2022/HF/length'},0),{value:3,band:null});
  assert.deepEqual(checkObservation(sample,{...endpoint,id:'2023/HF/score',unit:'级'},5),{value:0,band:null});
  assert.equal(checkObservation(sample,{...endpoint,id:'2023/NN/length'},5),null);
  assert.equal(checkObservation(sample,{...endpoint,source:{dataset_id:'D3'}},5),null);
  assert.equal(checkObservation(sample,null,5),null);
});

test('ordinal scale check displays its value without a fractional band',()=>{
  assert.deepEqual(checkObservation(sample,{...endpoint,unit:'级'},10),{value:8,band:null});
  assert.deepEqual(checkObservation(sample,{...endpoint,scale_id:'RF:scale:ordinal'},10),{value:8,band:null});
});

test('workspaces accept legacy absence and preserve dataset-qualified check keys',()=>{
  assert.doesNotThrow(()=>validatePhenotypeCheck());
  assert.doesNotThrow(()=>validatePhenotypeCheck({key:'["D1","0001"]',bandPct:0}));
  assert.throws(()=>validatePhenotypeCheck({key:'"0001"',bandPct:5}));
  assert.throws(()=>validatePhenotypeCheck({key:'["D1","0001"]',bandPct:-1}));
});
