import React,{useRef,useState} from 'react';
import {chromNum,lengths} from './exchange.js';

export function GenomeTrack({gene,variants,selected,onSelect}) {
  const extent=lengths[chromNum(gene.chromosome)]||gene.end;
  const home={left:gene.start,right:gene.end};
  const [view,setView]=useState(home),drag=useRef(null), suppressClick=useRef(false);
  const width=view.right-view.left+1;
  function viewport(left,size) {
    const span=Math.max(2,Math.min(extent,Math.round(size)));
    const start=Math.max(1,Math.min(extent-span+1,Math.round(left)));
    setView({left:start,right:start+span-1});
  }
  function zoom(factor){const span=Math.min(extent,Math.max(2,Math.round(width*factor)));viewport(view.left+(width-span)/2,span);}
  const scale=p=>42+(p-view.left)/(width-1)*710;
  const features=gene.features||[], promoter=gene.promoter;
  const visible=gene.variants.filter(v=>v.pos>=view.left&&v.pos<=view.right);
  function interval(left,right,color,y,h,key){
    if(left>view.right||right<view.left)return null;
    const start=scale(Math.max(left,view.left)),end=scale(Math.min(right,view.right));
    return <rect key={key} x={start} y={y} width={Math.max(1,end-start)} height={h} rx="2" fill={color}/>;
  }
  return <div className="genome-view">
    <div className="track-tools"><b>{gene.chromosome} · {gene.assembly}</b>
      <button type="button" aria-label="向左平移" onClick={()=>viewport(view.left-width/3,width)}>←</button>
      <button type="button" aria-label="向右平移" onClick={()=>viewport(view.left+width/3,width)}>→</button>
      <button type="button" onClick={()=>zoom(.5)}>放大</button><button type="button" onClick={()=>zoom(2)}>缩小</button>
      <button type="button" onClick={()=>setView(home)}>基因全景</button>
      <button type="button" onClick={()=>viewport(1,extent)}>整条染色体</button></div>
    <svg className="gene-track drag-track" viewBox="0 0 800 150" aria-label={gene.name+' 基因结构和变异位置'} role="group"
      onPointerDown={e=>{if(e.button!==0)return;drag.current={x:e.clientX,left:view.left,id:e.pointerId};suppressClick.current=false;}}
      onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;
        const delta=e.clientX-d.x;if(Math.abs(delta)<3&&!suppressClick.current)return;
        suppressClick.current=true;e.currentTarget.setPointerCapture(e.pointerId);
        const pixels=e.currentTarget.getBoundingClientRect().width*710/800;viewport(d.left-delta*width/pixels,width);}}
      onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null} onPointerLeave={()=>{if(!suppressClick.current)drag.current=null;}}>
      {[0,.25,.5,.75,1].map(t=><g key={t}><line x1={42+t*710} x2={42+t*710} y1="30" y2="118" stroke="#e3eaec"/><text x={42+t*710} y="139" className="axis" textAnchor="middle">{Math.round(view.left+t*(width-1)).toLocaleString()}</text></g>)}
      <text x="42" y="20" className="track-name">{gene.name} {gene.strand==='+'?'→':gene.strand==='-'?'←':''}</text>
      {gene.gene_start!=null&&interval(gene.gene_start,gene.gene_end,'#487e73',61,3,'body')}
      {promoter&&interval(promoter.start,promoter.end,'#cbded6',52,18,'promoter')}
      {features.map((f,i)=>interval(f.start,f.end,'#659d8d',50,24,i))}
      {visible.map(v=><g key={v.id} role="button" tabIndex={variants.includes(v)?0:-1} aria-label={'选择位点 '+v.id} opacity={variants.includes(v)?1:.27}
        onClick={()=>{if(!suppressClick.current&&variants.includes(v))onSelect(v.id);}}
        onKeyDown={e=>{if(['Enter',' '].includes(e.key)&&variants.includes(v)){e.preventDefault();onSelect(v.id);}}}>
        <line x1={scale(v.pos)} x2={scale(v.pos)} y1="78" y2="98" stroke="#839ead"/><circle cx={scale(v.pos)} cy="104" r={v.id===selected?.id?6:4} fill={v.id===selected?.id?'#3572c5':'#7796ac'}/><title>{v.id} · {v.ref} / {v.alt??'—'}</title></g>)}
    </svg><p className="track-range">窗口 {view.left.toLocaleString()}–{view.right.toLocaleString()} bp · 拖动平移 · 窗内 {visible.length} 个标记</p>
  </div>;
}
