export const nameStatus={study_name:'研究用名',source_candidate:'中文候选',multiple_candidates:'名称待消歧',unresolved:'中文名待核'};
export function nameLabel(sample) {
  if(!sample.name_status)return sample.name;
  return sample.name_zh ? sample.name_zh+'（'+nameStatus[sample.name_status]+'） · '+sample.name : (sample.name||sample.id)+' · 中文名待核';
}
export function attachNames(data,text) {
  const [head,...lines]=text.trimEnd().split('\n');
  if(head!=='accession_id\toriginal_name\tname_zh\tname_status\tsource_urls\tsource_record')throw Error('中文名文件表头无效');
  const byId=new Map();
  for(const line of lines){
    const [id,name,zh,status,urls='',source_record='']=line.split('\t');
    if(byId.has(id)||!Object.hasOwn(nameStatus,status))throw Error('中文名索引异常');
    byId.set(id,{name,name_zh:zh,name_status:status,name_record:source_record,name_sources:urls.split(' ').filter(Boolean)});
  }
  if(byId.size!==data.individuals.length)throw Error('中文名与材料数量不符');
  for(const s of data.individuals){const info=byId.get(s.id);if(!info||info.name!==s.name)throw Error('品种原名与材料编号不符');Object.assign(s,info);}
  return {...data,namesById:byId};
}
