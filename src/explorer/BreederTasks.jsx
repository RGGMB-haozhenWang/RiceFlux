import {useText} from './locale.jsx';
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
  const localize = useText();
  const [text,setText]=useState(''),[editing,setEditing]=useState(false);
  const input=useRef(null);
  const hits=useMemo(()=>text.trim()?samples.filter(s=>matchesMaterial(s,text)):[],[samples,text]);
  function pick(sample){onPick(sample);setText('');setEditing(false);}
  return <div className="task-accession">
    <span>{localize(label)}</span>
    {!selected||editing?<div className="review-search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setText('');}}>
      <input ref={input} type="search" aria-label={localize('搜索'+label)} placeholder={localize("材料名称或编号")} value={text}
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
          <span><strong>{localize(s.name)}</strong><small>{localize(s.source_sample_id??s.id)} · {localize(s.dataset_name??s.dataset_id)}</small></span>
        </button>)}
        {!hits.length&&<p role="status">{localize("没有匹配的材料。")}</p>}
        {hits.length>8&&<p>{localize(hits.length)}{" "+localize("份匹配，可继续输入编号。")}</p>}
      </div>}
    </div>:<div className="task-accession-selected"><div><b>{localize(selected.name)}</b><small>{localize(selected.source_sample_id??selected.id)} · {localize(selected.dataset_name??selected.dataset_id)}</small></div>
      <button className="review-link" type="button" aria-label={localize('更换'+label)} onClick={()=>{setEditing(true);requestAnimationFrame(()=>input.current?.focus());}}>{localize("更换")}</button>
    </div>}
  </div>;
}

export function CarrierList({title,samples,axis,onReview,definition,target}){
  const localize = useText();
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
  return <section className="task-carriers" aria-label={localize("携带材料")}>
    <h3>{localize(title)} <small>{localize(samples.length.toLocaleString())}{" "+localize("份")}</small></h3>
    {hasTarget&&<label className="breeder-check"><input type="checkbox" checked={only} onChange={e=>setOnly(e.target.checked)}/>{localize("仅看达标携带材料")}</label>}
    {!visible.length?<p className="breeder-note">{localize("当前筛选没有符合条件的携带材料。")}</p>:<>
      <div className="matrix-scroll"><table className="individual-table">
        <thead><tr><th>{localize("材料")}</th><th>{localize("编号与来源")}</th>{axis&&<th>{localize(axis.trait_name)} · {localize(axis.unit)}</th>}<th>{localize("审查")}</th></tr></thead>
        <tbody>{visible.slice(0,limit).map(s=><tr key={s.id}>
          <th scope="row">{localize(s.name)}</th><td>{localize(s.source_sample_id??s.id)} · {localize(s.dataset_name??s.dataset_id)}</td>
          {axis&&<td>{s.phenotypes[axis.id]??localize("缺测")}{hasTarget&&status(s)==='met'&&<small>{localize("达标")}</small>}</td>}
          <td><button className="review-link" type="button" aria-label={localize('核查 '+s.name)} onClick={()=>onReview(s)}>{localize("核查材料")}</button></td>
        </tr>)}</tbody>
      </table></div>
      <div className="review-footer">
        {visible.length>limit&&<button className="review-link" type="button" onClick={()=>setLimit(n=>n+15)}>{localize("更多材料")}</button>}
        <button className="review-link" type="button" onClick={download}>{localize("下载携带材料 TXT")}</button>
      </div>
    </>}
  </section>;
}
