import React,{useMemo,useRef,useState} from 'react';
import {geneSchemes,jointCalls,statusText} from './jointHaplotypes.js';
import {formats,downloadTable,materialRow,matchesMaterial} from './formats.js';

const kinds={literature:'文献命名型',input:'导入状态型',observed:'群体纯合标记型'};
const pct=(n,d)=>d?(100*n/d).toFixed(1)+'%':'—';
const displayCall=c=>c.status==='called'?c.label:statusText[c.status]+(c.label?' · '+c.label:'');
function schemeTitle(s){
  const title=kinds[s.kind]+' · '+s.positions.length+' 位点';
  return title+(s.definitions.length?' · '+s.definitions[0].label+(s.definitions.length>1?' 等':''):'')+(!s.ready?'（无法完整判型）':'');
}
function Definition({gene,schemes,current,onChange}){
  return <div className="joint-definition"><label><strong>{gene.name}</strong>
    <select aria-label={gene.name+' 判型方案'} value={current.id} onChange={e=>onChange(e.target.value)}>
      {schemes.map(s=><option key={s.id} value={s.id}>{schemeTitle(s)}</option>)}</select></label>
    <details><summary>位点顺序与型名依据</summary>
      <p>{gene.chromosome} · {current.positions.join(' → ')||'暂无可用位置'}</p>
      {current.doi.map(d=><a key={d} href={'https://doi.org/'+d} target="_blank" rel="noreferrer">{d} </a>)}
      {current.definitions.length?<ul>{current.definitions.map((d,i)=><li key={i}>{d.label} · {d.sequence}{!d.valid&&'（状态未解析）'}</li>)}</ul>:
      <p>按本面板已有标记的坐标顺序，用实测纯合碱基序列命名。单个位点仅显示单标记型。</p>}
    </details></div>;
}

export function JointPanel({data,genes,cohort,records}){
  const [chosen,setChosen]=useState({}),[selection,setSelection]=useState('all'),[query,setQuery]=useState('');
  const [limit,setLimit]=useState(24),[comboLimit,setComboLimit]=useState(24);
  const menus=useMemo(()=>{
    return genes.map(g=>geneSchemes(g,data.evidence,records.filter(r=>r.gene===g)));
  },[data.evidence,genes,records]);
  const methods=useMemo(()=>menus.map((menu,i)=>menu.find(s=>s.id===chosen[genes[i].id])||menu[0]),[menus,genes,chosen]);
  const result=useMemo(()=>jointCalls(cohort,methods),[cohort,methods]);
  const popIds=data.populations.map(p=>p.id).filter(id=>result.population.has(id));
  const memberHeading=useRef(null);
  const mode=selection==='unresolved'?'unresolved':selection==='all'?'all':'group';
  const term=query.trim().toLowerCase();
  const rows=result.members.filter(({sample,key})=>(mode==='all'||(mode==='unresolved'?key===null:key===selection))&&
    matchesMaterial(sample,term));
  const statsLabel=mode==='group'?JSON.parse(selection).join(' × '):mode==='unresolved'?'未完整判型':'全部材料';
  function filterMembers(key){setSelection(key);setLimit(24);setQuery('');}
  const definitionFields=genes.map(g=>'definition|'+g.id);
  const schemeValues=Object.fromEntries(methods.map((s,i)=>[definitionFields[i],JSON.stringify({mode:s.kind,chr:genes[i].chromosome,positions:s.positions,refs:s.markers.map(v=>v?.ref??null),doi:s.doi,definitions:s.definitions})]));
  function exportGroups(){
    const geneFields=genes.map(g=>g.name+'|'+g.id);
    const fields=formats.jointCombinations.columns.flatMap(key=>{
      if(key==='{gene}|{gene_id}')return geneFields;
      return key==='definition|{gene_id}'?definitionFields:[key];
    });
    const out=[];
    for(const [pop,n,typed] of [['ALL',cohort.length,result.assigned],...popIds.map(p=>[p,result.population.get(p).all,result.population.get(p).assigned])]){
      for(const group of result.groups){
        const count=pop==='ALL'?group.n:group.pops.get(pop)||0;
        out.push({...Object.fromEntries(group.labels.map((l,i)=>[geneFields[i],l])),source_group:pop,population_n:n,joint_typed_n:typed,joint_unresolved_n:n-typed,member_n:count,frequency_within_typed:typed?count/typed:null,...schemeValues});
      }
      if(!result.groups.length)out.push({source_group:pop,population_n:n,joint_typed_n:typed,joint_unresolved_n:n-typed,...schemeValues});
    }
    downloadTable(formats.jointCombinations,out,fields);
  }
  function exportMembers(){
    const cols=genes.flatMap(g=>formats.jointMaterials.columnPatterns.map(key=>key.replace('{gene_id}',g.id)));
    const out=rows.map(({sample:s,calls,key})=>{
      const values=calls.flatMap(c=>[c.label,c.status,c.bases]);
      return {...materialRow(s),joint_status:key?'called':'unresolved',
        ...Object.fromEntries(cols.map((k,i)=>[k,values[i]]))};
    });
    downloadTable(formats.jointMaterials,out,[...formats.jointMaterials.columns,...cols]);
  }
  return <div className="joint-panel">
    <div className="joint-definitions">{genes.map((gene,i)=><Definition key={gene.id} gene={gene} schemes={menus[i]} current={methods[i]} onChange={id=>{setChosen({...chosen,[gene.id]:id});filterMembers('all');setComboLimit(24);}}/>)}</div>
    <div className="joint-counters" aria-label="联合判型统计">
      {[['当前材料',cohort.length],['完整判型',result.assigned],['未完整判型',cohort.length-result.assigned],['观察到的组合',result.groups.length]].map(([label,n])=><div key={label}><span>{label}</span><strong>{n.toLocaleString()}</strong></div>)}
    </div>
    <h3>单倍型组合与群体分布</h3>
    <p>每行是一种实际观察到的组合。各来源群体格内为份数和组内频率，分母是该群体在全部所选基因均已判型的材料数。</p>
    <div className="matrix-scroll"><table className="individual-table joint-summary"><thead><tr>
      {genes.map(g=><th key={g.id}>{g.name}</th>)}<th>合计 / 频率</th>
      {popIds.map(id=><th key={id}>{id}<small>已判 {result.population.get(id).assigned} / {result.population.get(id).all}</small></th>)}<th>成员</th></tr></thead>
      <tbody>{result.groups.slice(0,comboLimit).map(g=><tr key={g.key} className={g.key===selection?'joint-selected':''}>
        {g.labels.map((l,i)=><td key={genes[i].id}>{l}</td>)}<td><strong>{g.n.toLocaleString()}</strong><small>{pct(g.n,result.assigned)}</small></td>
        {popIds.map(id=><td key={id}>{g.pops.get(id)||0}<small>{pct(g.pops.get(id)||0,result.population.get(id).assigned)}</small></td>)}
        <td><button onClick={()=>{filterMembers(g.key);memberHeading.current?.focus();}}>查看成员</button></td></tr>)}</tbody></table></div>
    {!result.groups.length&&<p>当前材料及判型方案下没有完整组合。可在材料明细查看各基因的判型状态。</p>}
    <div className="compare-tools">{result.groups.length>comboLimit&&<button onClick={()=>setComboLimit(comboLimit+48)}>更多组合</button>}
      <button onClick={exportGroups}>导出组合与群体频率</button></div>
    <h3 tabIndex={-1} ref={memberHeading}>群体内逐材料分型</h3>
    <div className="compare-tools"><button onClick={()=>filterMembers('all')}>全部材料</button><button onClick={()=>filterMembers('unresolved')}>未完整判型材料</button>
      <input aria-label="检索组合成员" type="search" placeholder="材料编号或名录品种名" value={query} onChange={e=>{setQuery(e.target.value);setLimit(24);}}/>
      <button onClick={exportMembers}>导出当前成员分型</button></div>
    <p className="joint-member-count">{statsLabel} · {rows.length.toLocaleString()} 份</p>
    <div className="matrix-scroll"><table className="individual-table joint-members"><thead><tr><th>材料</th><th>来源群体 / 类别</th>{genes.map(g=><th key={g.id}>{g.name}</th>)}</tr></thead>
      <tbody>{rows.slice(0,limit).map(({sample:s,calls})=><tr key={s.id}><td>{s.id}<small>{s.name}</small></td><td>{s.population_id}<small>{s.kind==='landrace'?'地方品种':'现代品种'}</small></td>
        {calls.map((c,i)=><td key={genes[i].id}>{displayCall(c)}<small>{c.bases||'—'}</small></td>)}</tr>)}</tbody></table></div>
    {rows.length>limit&&<button onClick={()=>setLimit(limit+48)}>查看更多组合成员</button>}
  </div>;
}
