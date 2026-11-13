export const columns = ['QTG','Trait','Function','MSU_ID','Chr','Position','Ref','Hap'];
// IRGSP-1.0/MSU7 reference FASTA index, chromosomes 1 through 12.
export const lengths = [0,43270923,35937250,36413819,35502694,29958434,31248787,29697621,28443022,23012720,23207287,29021106,27531856];
export function chromNum(label) {
  const match = /^(?:chr)?0*(\d+)$/i.exec(label ?? '');
  return match ? Number(match[1]) : 0;
}
const missing = x => !x || x === 'NA' || x === '.';
export function readPrior(text) {
  const lines = text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  if (lines.shift() !== columns.join('\t')) throw Error('表头须使用模板的八列及原顺序');
  if (!lines.length) throw Error('文件缺少数据行');
  return lines.map((line,index) => {
    const cells = line.split('\t');
    const invalid = message => {throw Error('第 '+(index+2)+' 行：'+message);};
    if (cells.length!==8 || missing(cells[0].trim())) invalid('需要八列和基因名 QTG');
    const row=Object.fromEntries(columns.map((k,i)=>[k,cells[i].trim()]));
    const chromosome=chromNum(row.Chr);
    if (!missing(row.Chr) && !lengths[chromosome]) invalid('Chr 需为水稻染色体 1–12');
    const positions=row.Position.split(',').map(x=>x.trim());
    const refs=row.Ref.split(',').map(x=>x.trim());
    if (!missing(row.Ref) && positions.length!==refs.length) invalid('Ref 应与 Position 逐项对应');
    const sites=positions.map((v,j)=>{
      const ref=missing(row.Ref)||missing(refs[j])?null:refs[j].toUpperCase();
      if (ref && !/^[ACGTN]+$/.test(ref)) invalid('Ref 应为正链参考序列或 NA');
      if (missing(v)) return {pos:null,ref};
      const pos=Number(v);
      if (!/^\d+$/.test(v)||!Number.isSafeInteger(pos)||!lengths[chromosome]||pos<1||pos>lengths[chromosome]) invalid('Position 超出参考染色体或缺少 Chr');
      return {pos,ref};
    });
    return {row,sites,chromosome};
  });
}
export function writeTSV(keys,rows) {
  const cell=value=>String(value??'').replace(/[\r\n\t]/g,' ');
  return [keys.join('\t'),...rows.map(row=>keys.map(k=>cell(row[k])).join('\t'))].join('\n')+'\n';
}
export function resolvePrior(record,genes) {
  const row=record.row, normalize=s=>String(s??'').trim().toLowerCase();
  const byName=genes.filter(g=>[g.name,g.id,...(g.catalog?.aliases||[])].flatMap(s=>s.split(/[;；/]/).concat(s)).some(s=>normalize(s)===normalize(row.QTG)));
  const byId=missing(row.MSU_ID)?[]:genes.filter(g=>[g.id,g.catalog?.msu,g.catalog?.sourceId].includes(row.MSU_ID));
  if(!missing(row.MSU_ID)) {
    if(byId.length!==1 || (byName.length && !byName.includes(byId[0])))return null;
    return byId[0];
  }
  return byName.length===1?byName[0]:null;
}
export function matchMarker(gene,record,site) {
  if(!gene || !site.pos || !site.ref || chromNum(gene.chromosome)!==record.chromosome)return null;
  return gene.variants.find(v=>v.pos===site.pos && v.ref===site.ref)??null;
}
export function saveFile(name,content,type='text/tab-separated-values;charset=utf-8') {
  const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
