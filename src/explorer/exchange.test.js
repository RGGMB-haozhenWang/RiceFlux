import test from 'node:test';
import assert from 'node:assert/strict';
import {columns,readPrior,resolvePrior,matchMarker,writeTSV} from './exchange.js';
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
