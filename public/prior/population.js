/* Material data are loaded once and shared between gene cards. */
window.RiceFluxPopulation = (() => {
  let loaded;
  const prefs = { group: '', search: '' };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const option = (value, label, selected=false) => '<option value="'+escape(value)+'"'+(selected?' selected':'')+'>'+escape(label)+'</option>';
  const pairAt = (sample,index) => sample.gt.slice(2*index,2*index+2);
  const missing = pair => /[0N]/.test(pair);
  async function data() {
    if (!loaded) loaded=(async () => {
      const res=await fetch('./cohort.json.gz');
      if (!res.ok) throw Error('HTTP '+res.status);
      const bytes=await res.arrayBuffer(), magic=new Uint8Array(bytes,0,2);
      const raw=magic[0]===31 && magic[1]===139 ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))) : new Response(bytes);
      const db=await raw.json();
      if(db.samples.length!==2347 || db.sites.length!==254)throw Error('群体数据维度不符');
      return db;
    })().catch(error=>{loaded=null;throw error;});
    return loaded;
  }
  function phenotypeFor(g,env) {
    const first=g.tests.find(t=>t.status==='estimated')||g.tests[0];
    if(first)return env.findIndex(e=>e.column===first.column && e.n>0);
    const t=g.trait;
    const name=t==='抽穗期'?'Heading date (days)':/^粒长/.test(t)?'Grain length (mm)':/^粒宽/.test(t)?'Grain width (mm)':'';
    return env.findIndex(e=>name && e.trait===name && e.n>0 && e.site==='Hefei' && e.year==='2023');
  }
  async function mount(g) {
    const root=document.getElementById('materialPanel');
    if(!root)return;
    root.innerHTML='<h2>材料与实测分型</h2><p class="sub">正在读取现代籼稻材料……</p>';
    let db;
    try{db=await data()}catch(error){
      if(!root.isConnected)return;
      root.innerHTML='<h2>材料数据未载入</h2><p>'+escape(error.message)+'</p><button class="action">重试</button> <a href="./genotypes.tsv.gz">下载原始分型表</a>';
      root.querySelector('button').onclick=()=>mount(g);return;
    }
    if(!root.isConnected)return;
    const sites=db.sites.map((s,i)=>({...s,i})).filter(s=>s.gene===g.id);
    const byPos=new Map(sites.map(s=>[s.chr+':'+s.pos,s.i]));
    const matches=g.events.filter(e=>e.match?.status==='全组分可比较').map(e=>({id:e.id,label:e.label,indices:e.cols.map(c=>byPos.get(e.chr+':'+c[0])),states:e.cols.map(c=>c[2])}));
    const groups=[...new Set(db.samples.map(s=>s.group))].sort();
    const model={target:matches[0]?'h'+matches[0].id:sites[0]?'s'+sites[0].i:'',state:'',env:phenotypeFor(g,db.environments),page:0};
    root.innerHTML='<h2>材料与实测分型</h2><p class="sub">2,347 份现代籼稻。选择亚群、位点或文献组合，可查看各材料的双等位调用和同一材料的环境表型。</p><div class="popcontrols"><label>材料名称或编号<input data-f="search" type="search" placeholder="如 18-I241"></label><label>来源组<select data-f="group"></select></label><label>比较对象<select data-f="target"></select></label><label>材料状态<select data-f="state"></select></label><label>实测性状与环境<select data-f="env"></select></label></div><div data-out></div>';
    const ctl=k=>root.querySelector('[data-f="'+k+'"]');
    const setOpts=(k,v)=>ctl(k).innerHTML=v;
    ctl('search').value=prefs.search;
    setOpts('group',option('','所有来源组')+groups.map(k=>option(k,k||'未登记',k===prefs.group)).join(''));
    setOpts('target',(matches.length?'<optgroup label="文献多位点纯合组合">'+matches.map(e=>option('h'+e.id,e.label)).join('')+'</optgroup>':'')+(sites.length?'<optgroup label="单个位点">'+sites.map(s=>option('s'+s.i,s.chr+':'+s.pos+' · REF '+s.ref)).join('')+'</optgroup>':'')||option('','本基因无实测目标位点'));
    ctl('target').value=model.target;
    setOpts('env',option('-1','选择性状与环境',model.env===-1)+db.environments.map((e,i)=>e.n?option(i,e.trait+' · '+e.site+' '+e.year,i===model.env):'').join(''));
    function states(){
      const values=model.target.startsWith('h')?['组合匹配','其他完整纯合','未分相杂合','缺失']:model.target?['A/A','C/C','G/G','T/T','未分相杂合','缺失']:[];
      setOpts('state',option('','全部材料状态')+values.map(s=>option(s,s)).join(''));
    }
    function refresh(){
      const hap=matches.find(e=>'h'+e.id===model.target),site=sites.find(s=>'s'+s.i===model.target);
      const indices=hap?hap.indices:site?[site.i]:[];
      const cohort=db.samples.filter(s=>(!prefs.group||s.group===prefs.group)&&(!prefs.search||[s.id,s.name].some(v=>String(v).toLowerCase().includes(prefs.search.trim().toLowerCase()))));
      const hist=new Map();
      const selected=[];
      for(const s of cohort){
        const pairs=indices.map(i=>pairAt(s,i));
        let state='无目标分型';
        if(pairs.length){
          if(pairs.some(missing))state='缺失';
          else if(pairs.some(p=>p[0]!==p[1]))state='未分相杂合';
          else if(hap)state=pairs.every((p,i)=>p[0]===hap.states[i])?'组合匹配':'其他完整纯合';
          else state=pairs[0].split('').join('/');
        }
        hist.set(state,(hist.get(state)||0)+1);
        if(!model.state||state===model.state)selected.push({s,pairs,state});
      }
      const size=12,pages=Math.max(1,Math.ceil(selected.length/size));model.page=Math.min(model.page,pages-1);
      const visible=selected.slice(model.page*size,model.page*size+size);
      const env=db.environments[model.env],measured=env?selected.filter(r=>r.s.ph[model.env]!==null).length:0;
      const summary=[...hist].map(([k,n])=>escape(k)+' '+n).join('　');
      const hdr=['材料编号','品种名','来源组',...indices.map(i=>db.sites[i].chr+':'+db.sites[i].pos),'分型判读',...(env?['实测值'] : [])];
      const row=r=>[r.s.id,r.s.name||'—',r.s.group||'—',...r.pairs.map(p=>p.split('').join('/')),r.state,...(env?[r.s.ph[model.env]??'未测']:[])];
      const out=root.querySelector('[data-out]');
      out.innerHTML='<p class="sub">'+summary+'</p><p><strong>'+selected.length+' 份材料</strong>'+(env?' · '+measured+' 份有该表型':'')+'</p><div class="scroll"><table class="matrix"><thead><tr>'+hdr.map(x=>'<th>'+escape(x)+'</th>').join('')+'</tr></thead><tbody>'+visible.map(r=>'<tr>'+row(r).map(x=>'<td>'+escape(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+(visible.length?'':'<p class="empty">没有符合当前条件的材料。</p>')+'<div class="popnav"><button class="action" data-prev '+(model.page===0?'disabled':'')+'>上一页</button><span>'+(model.page+1)+' / '+pages+'</span><button class="action" data-next '+(model.page+1>=pages?'disabled':'')+'>下一页</button><button class="action" data-export>导出筛选材料 TSV</button></div><p class="sub">0 或 N 为原始缺失编码。杂合调用保留两条碱基；多位点组合按全部组分纯合且顺序匹配计数。来源组沿用材料表原值。</p>';
      out.querySelector('[data-prev]').onclick=()=>{model.page--;refresh()};
      out.querySelector('[data-next]').onclick=()=>{model.page++;refresh()};
      out.querySelector('[data-export]').onclick=()=>{
        const header=hdr.slice();if(env)header[header.length-1]=[env.trait,env.site,env.year,env.column].join(' | ');
        const clean=x=>String(x).replace(/[\r\n\t]/g,' ');
        const tsv=[header,...selected.map(row)].map(r=>r.map(clean).join('\t')).join('\n')+'\n';
        const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff',tsv],{type:'text/tab-separated-values;charset=utf-8'}));a.download=g.id+'_modern_indica.tsv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      };
    }
    for(const k of ['search','group','target','state','env'])ctl(k).addEventListener(k==='search'?'input':'change',()=>{
      const v=ctl(k).value;
      if(k==='search'||k==='group')prefs[k]=v;else model[k]=k==='env'?Number(v):v;
      if(k==='target'){model.state='';states()}
      model.page=0;refresh();
    });
    states();refresh();
  }
  return {mount};
})();
