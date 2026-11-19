import {useEffect,useState} from 'react';

export function useGeneCalls(data,ids,enabled){
  const key=JSON.stringify(ids),[result,setResult]=useState(null),[attempt,setAttempt]=useState(0);
  const ready=!data.genesReady||data.genesReady(ids);
  useEffect(()=>{
    if(!enabled||ready)return;
    let active=true;
    data.loadGenes(ids).then(()=>{
      if(active)setResult({data,key});
    },error=>{
      if(active)setResult({data,key,error:error.message});
    });
    return()=>{active=false;};
  },[data,key,enabled,ready,attempt]);
  return {ready,error:result?.data===data&&result.key===key?result.error:null,retry:()=>{
    setResult(null);setAttempt(x=>x+1);
  }};
}
