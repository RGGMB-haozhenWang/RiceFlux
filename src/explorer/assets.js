export async function fetchBytes(path,signal){
  const response=await fetch(path,{signal});
  if(!response.ok)throw Error('数据读取失败 ('+response.status+')');
  return new Uint8Array(await response.arrayBuffer());
}

export async function decompress(bytes,format){
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function unpackGzip(bytes){
  return bytes[0]===31&&bytes[1]===139?decompress(bytes,'gzip'):bytes;
}

export async function readText(path,signal){
  return new TextDecoder().decode(await unpackGzip(await fetchBytes(path,signal)));
}

