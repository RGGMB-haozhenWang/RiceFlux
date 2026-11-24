import React, {createContext, useContext, useEffect, useState} from 'react';
import {displayTerms} from './terms.js';
import chinese from './chinese.json';

const storageKey='riceflux.language';
export const containsHan=value=>typeof value==='string'&&/\p{Script=Han}/u.test(value);
const LocaleContext=createContext(null);

function initialLanguage(){
  const requested=new URLSearchParams(location.search).get('lang');
  if(requested==='zh'||requested==='en')return requested;
  try{return localStorage.getItem(storageKey)==='en'?'en':'zh';}
  catch{return 'zh';}
}

function fallbackEnglish(value,messages){
  if(!containsHan(value))return value;
  if(Object.hasOwn(messages,value))return messages[value];
  if(Object.hasOwn(displayTerms,value))return displayTerms[value];
  const trimmed=value.trim();
  if(trimmed!==value){
    const inner=fallbackEnglish(trimmed,messages);
    if(inner!==trimmed)return value.replace(trimmed,()=>inner);
  }
  const fields=value.split(/( · | \/ |：|；|，|、|（|）)/);
  if(fields.length>1&&fields.length<22&&value.length<145){
    const separators={'：':': ','；':'; ','，':', ','、':', ','（':' (','）':')'};
    const labels=fields.map((field,i)=>i%2?separators[field]??field:
      messages[field]??displayTerms[field]??field);
    // A partially translated string is only useful for composed UI labels, not source prose.
    if(!labels.some(containsHan))return labels.join('');
  }
  return value;
}

const text=(language,messages)=>(value,insertions)=>{
  if(typeof value!=='string')return value;
  const result=language==='en'?fallbackEnglish(value,messages):(Object.hasOwn(chinese,value)?chinese[value]:value);
  if(!insertions)return result;
  return result.replace(/#(\d+)#/g,(_,i)=>{
    const item=insertions[Number(i)];
    return language==='en'&&typeof item==='string'?fallbackEnglish(item,messages):String(item??'');
  });
};

let englishRequest;
const loadEnglish=()=>englishRequest??=import('./english.json').then(module=>module.default)
  .catch(error=>{englishRequest=undefined;throw error;});

export function LocaleProvider({children}){
  const [language,setLanguage]=useState(initialLanguage);
  const [messages,setMessages]=useState(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    if(language!=='en'||messages)return;
    let active=true;
    loadEnglish().then(value=>{if(active)setMessages(value);}).catch(()=>{if(active)setFailed(true);});
    return()=>{active=false;};
  },[language,messages]);
  useEffect(()=>{
    document.documentElement.lang=language==='en'?'en':'zh-CN';
    document.title=language==='en'?'RiceFlux · Rice genetics and breeding':'RiceFlux · 水稻基因分析与育种';
  },[language]);
  function choose(value){
    if(value===language&&!failed)return;
    setFailed(false);
    const url=new URL(location.href);
    url.searchParams.set('lang',value);
    history.replaceState(history.state,'',url);
    try{localStorage.setItem(storageKey,value);}catch{ /* unavailable in private browser storage */ }
    if(value==='en'&&!messages){
      loadEnglish().then(dictionary=>{setMessages(dictionary);setLanguage(value);}).catch(()=>setFailed(true));
    }else setLanguage(value);
  }
  const value={language,t:text(language,messages??{}),choose};
  return <LocaleContext.Provider value={value}>
    {language!=='en'||messages?children:<main className="loading"><h1>RiceFlux</h1><p role="status">Loading language resources…</p><LocaleSwitch/></main>}
    {failed&&<p className="locale-error" role="alert">English language resources could not be loaded. <button onClick={()=>choose('en')}>Retry</button></p>}
  </LocaleContext.Provider>;
}

export const useLocale=()=>useContext(LocaleContext);
export const useText=()=>useLocale().t;

export function LocaleSwitch(){
  const {language,choose}=useLocale();
  return <div className="locale-switch" role="group" aria-label={language==='en'?'Interface language':'界面语言'}>
    <button type="button" lang="zh-CN" aria-pressed={language==='zh'} onClick={()=>choose('zh')}>中文</button>
    <button type="button" lang="en" aria-pressed={language==='en'} onClick={()=>choose('en')}>English</button>
  </div>;
}

export function SourceText({children}){
  const {language,t}=useLocale();
  const value=t(children);
  const chineseSource=language==='en'&&containsHan(value);
  return <span lang={chineseSource?'zh-CN':undefined} title={chineseSource?'Source note in Chinese':undefined}>{value}</span>;
}
