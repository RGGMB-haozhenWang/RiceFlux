import React,{useMemo,useRef,useState} from 'react';
import {targetStatus} from './breeder.js';
import {downloadTable,matchesMaterial} from './formats.js';

export const breedingTasks=[
  {id:'parents',title:'双亲与后代'},
  {id:'traits',title:'材料与性状'},
  {id:'stack',title:'基因型组合'},
  {id:'check',title:'材料体检'},
  {id:'introgression',title:'亲本导入决策'},
];

export function AccessionPicker({label,samples,selected,onPick}){
  const [text,setText]=useState(''),[editing,setEditing]=useState(false);
  const input=useRef(null);
  const hits=useMemo(()=>text.trim()?samples.filter(s=>matchesMaterial(s,text)):[],[samples,text]);
  function pick(sample){onPick(sample);setText('');setEditing(false);}
  return <div className="task-accession">
    <span>{label}</span>
    {!selected||editing?<div className="review-search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setText('');}}>
      <input ref={input} type="search" aria-label={'搜索'+label} placeholder="材料名称或编号" value={text}
        onChange={e=>setText(e.target.value)}
        onKeyDown={e=>{
          if(e.key==='Escape'){setEditing(false);setText('');}
          if(e.key==='Enter'){
            const t=text.trim().toLowerCase();
            const exact=hits.filter(s=>[s.name,s.source_sample_id??s.id].some(v=>v?.toLowerCase()===t));
            const result=exact.length?exact:hits;
            if(result.length===1)pick(result[0]);
          }
        }}/>
      {text.trim()&&<div className="review-matches">
        {hits.slice(0,8).map(s=><button type="button" key={s.id} onClick={()=>pick(s)}>
          <span><strong>{s.name}</strong><small>{s.source_sample_id??s.id} · {s.dataset_name??s.dataset_id}</small></span>
        </button>)}
        {!hits.length&&<p role="status">没有匹配的材料。</p>}
        {hits.length>8&&<p>{hits.length} 份匹配，可继续输入编号。</p>}
      </div>}
    </div>:<div className="task-accession-selected"><div><b>{selected.name}</b><small>{selected.source_sample_id??selected.id} · {selected.dataset_name??selected.dataset_id}</small></div>
      <button className="review-link" type="button" aria-label={'更换'+label} onClick={()=>{setEditing(true);requestAnimationFrame(()=>input.current?.focus());}}>更换</button>
    </div>}
  </div>;
}

export function CarrierList({title,samples,axis,onReview,definition,target}){
  const [limit,setLimit]=useState(10);
  const [only,setOnly]=useState(false);
  const hasTarget=Boolean(axis&&target?.active);
  const status=sample=>targetStatus(sample.phenotypes[axis.id],target);
  const visible=hasTarget&&only?samples.filter(s=>status(s)==='met'):samples;
  const fields=['dataset_id','sample_id','name','source_group','genotype_evidence','genotype_definition','trait','environment_id','value','unit',
    'target_min','target_max','target_status'];
  function download(){
    downloadTable({filename:'riceflux_carriers.txt',columns:fields},visible.map(s=>({dataset_id:s.dataset_id,
      sample_id:s.source_sample_id??s.id,name:s.name,source_group:s.source_group,genotype_evidence:s.genotype_evidence,
      genotype_definition:definition,trait:axis?.trait_id,environment_id:axis?.environment,value:s.phenotypes[axis?.id],unit:axis?.unit,
      target_min:hasTarget?target.min:null,target_max:hasTarget?target.max:null,target_status:hasTarget?status(s):''})));
  }
  return <section className="task-carriers" aria-label="携带材料">
    <h3>{title} <small>{samples.length.toLocaleString()} 份</small></h3>
    {hasTarget&&<label className="breeder-check"><input type="checkbox" checked={only} onChange={e=>setOnly(e.target.checked)}/>仅看达标携带材料</label>}
    {!visible.length?<p className="breeder-note">当前筛选没有符合条件的携带材料。</p>:<>
      <div className="matrix-scroll"><table className="individual-table">
        <thead><tr><th>材料</th><th>编号与来源</th>{axis&&<th>{axis.trait_name} · {axis.unit}</th>}<th>审查</th></tr></thead>
        <tbody>{visible.slice(0,limit).map(s=><tr key={s.id}>
          <th scope="row">{s.name}</th><td>{s.source_sample_id??s.id} · {s.dataset_name??s.dataset_id}</td>
          {axis&&<td>{s.phenotypes[axis.id]??'缺测'}{hasTarget&&status(s)==='met'&&<small>达标</small>}</td>}
          <td><button className="review-link" type="button" aria-label={'核查 '+s.name} onClick={()=>onReview(s)}>核查材料</button></td>
        </tr>)}</tbody>
      </table></div>
      <div className="review-footer">
        {visible.length>limit&&<button className="review-link" type="button" onClick={()=>setLimit(n=>n+15)}>更多材料</button>}
        <button className="review-link" type="button" onClick={download}>下载携带材料 TXT</button>
      </div>
    </>}
  </section>;
}
