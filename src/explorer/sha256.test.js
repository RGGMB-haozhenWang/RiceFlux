import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {sha256Bytes,sha256Text} from './sha256.js';
test('SHA-256 matches independent Node crypto across padding boundaries, Unicode and large inputs',async()=>{
  for(const size of [0,1,3,55,56,63,64,65,119,120,127,128,129,1024,1000000]){
    const bytes=randomBytes(size);assert.equal(sha256Bytes(bytes),createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(sha256Bytes(new TextEncoder().encode('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const saved=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  try{
    Object.defineProperty(globalThis,'crypto',{value:{},configurable:true});
    for(const text of ['','水稻\tSNP\n🌾','a'.repeat(1000000)])assert.equal(await sha256Text(text),createHash('sha256').update(text).digest('hex'));
  }finally{Object.defineProperty(globalThis,'crypto',saved);}
});
