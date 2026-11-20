import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBreederPlan,planSources} from './breederPlan.js';

const sample=id=>({id,name:id,dataset_id:'rice',source_sample_id:id,kind:'modern cultivar'});
const data={individuals:[sample('D10'),sample('D106'),sample('D112')],
  genes:[{id:'LOC_Os07g41200',name:'GL7'},{id:'Os07g0695100',name:'DTH7'}],
  traits:[{id:'length',name:'粒长',environments:[{}]}]};

test('sentence plan uses exact accession boundaries and requires expressed parent roles',()=>{
  const plan=makeBreederPlan('以 D106 为母本、D112 为父本，比较 GL7 的后代型别。',data);
  assert.equal(plan.scenario,'parents');
  assert.deepEqual(plan.materials.map(s=>s.id),['D106','D112']);
  assert.equal(plan.female,'["rice","D106"]');
  assert.equal(plan.male,'["rice","D112"]');
  assert.deepEqual(plan.genes.map(g=>g.name),['GL7']);
  const unspecified=makeBreederPlan('比较 D106 × D112 的后代',data);
  assert.equal(unspecified.female,'');
  assert.equal(unspecified.male,'');
  assert.equal(makeBreederPlan('查已有杂交组合的粒长表型',data).scenario,'traits');
  assert.ok(makeBreederPlan('GL70 和 DTH7 聚合',data).issues.includes('GL70'));
});

test('sentence range binds to one measurement context and catches unit mismatch',()=>{
  const plan=makeBreederPlan('查公主岭 2022 年粒长在 8.20–8.25 mm 的单倍型和材料。',data);
  assert.deepEqual(plan.goal,{min:'8.20',max:'8.25',unit:'mm'});
  const axis=(key,site,year,unit)=>({key,trait_id:'length',source:{site,year},unit});
  const axes=[axis('G22','Gongzhuling','2022','mm'),axis('G23','Gongzhuling','2023','mm'),
    axis('W22','Wuhan','2022','mm'),axis('different_unit','Gongzhuling','2022','cm')];
  assert.deepEqual(planSources(plan,axes).choices.map(r=>r.key),['G22']);
  assert.equal(makeBreederPlan('查粒长 8.2 cm 至 8.25 mm 的单倍型',data).goal.invalid,true);
  assert.equal(makeBreederPlan('查粒长大于 8.20 mm 的单倍型',data).goal.invalid,true);
});
