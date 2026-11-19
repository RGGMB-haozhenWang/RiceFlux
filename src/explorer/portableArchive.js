import {decompress} from './assets.js';

// The supplied portable ZIPs use the classic ZIP directory and stored or deflated members.
export async function archiveEntry(bytes,name){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16=offset=>view.getUint16(offset,true),u32=offset=>view.getUint32(offset,true);
  let footer=bytes.length-22;
  const min=Math.max(0,footer-65535);
  while(footer>=min&&(u32(footer)!==0x06054b50||footer+22+u16(footer+20)!==bytes.length))footer--;
  if(footer<min||u16(footer+4)!==0||u16(footer+6)!==0)throw Error('TSV 归档目录无效');
  let at=u32(footer+16);
  const decode=new TextDecoder();
  for(let i=0;i<u16(footer+10);i++){
    if(at+46>footer||u32(at)!==0x02014b50)throw Error('TSV 归档目录无效');
    const length=u16(at+28),end=at+46+length;
    if(end>footer)throw Error('TSV 归档目录无效');
    if(decode.decode(bytes.subarray(at+46,end))===name){
      const local=u32(at+42),size=u32(at+20),method=u16(at+10);
      if(local+30>at||u32(local)!==0x04034b50||u16(at+8)&1)throw Error('TSV 归档成员无效');
      const start=local+30+u16(local+26)+u16(local+28);
      if(start+size>at||![0,8].includes(method))throw Error('TSV 归档成员无效');
      const raw=bytes.subarray(start,start+size);
      const body=method===0?raw:await decompress(raw,'deflate-raw');
      if(body.length!==u32(at+24))throw Error('TSV 归档成员长度不符');
      return body;
    }
    at=end+u16(at+30)+u16(at+32);
  }
  throw Error('TSV 归档缺少 '+name);
}
