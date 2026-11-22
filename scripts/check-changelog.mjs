import {execFileSync} from 'node:child_process';

const [base, head='HEAD']=process.argv.slice(2);
if(!base||process.argv.length>4)throw new Error('用法：node scripts/check-changelog.mjs <发布基线> [发布提交]');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const before=git('ls-tree','--name-only',base,'--','CHANGELOG.md').trim()
  ?git('show',base+':CHANGELOG.md'):'';
const after=git('show',head+':CHANGELOG.md');
const headings=/^## (\d{4}-\d{2}-\d{2} · .+)$/gm;
const latest=[...after.matchAll(headings)][0];
const old=[...before.matchAll(headings)];
const next=[...after.matchAll(headings)][1];
const entry=latest&&after.slice(latest.index+latest[0].length,next?.index);
if(!entry||!/^[-*] \S/m.test(entry)||old.some(match=>match[1]===latest[1]))
  throw new Error('请在 CHANGELOG.md 顶部新增独立版本标题和修改内容。');
console.log('本次发布已记录 '+latest[1]);
