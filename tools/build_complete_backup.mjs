import fs from 'node:fs';
const source='legacy-ronsho_app_v18.7_with_past_exam_log_v2.html';
const output='dist/ronsho_app_v18.7_complete_backup.html';
let html=fs.readFileSync(source,'utf8');
const injected=`
<style>
#completeBackupPanel{margin:0 0 20px;padding:14px 16px;background:#fff;border:1px solid #cfe3ff;border-radius:12px;box-shadow:0 4px 14px rgba(0,87,231,.06)}
#completeBackupPanel h3{margin:0 0 8px;font-size:14px}#completeBackupPanel p{font-size:12px;color:#4a6a90;margin:0 0 10px}#completeBackupPanel button{margin-right:8px}
</style>
<script>
(()=>{
const STUDY_KEY='ronshoStudyLog', MANUAL_KEY='ronshoManualLog', PAST_KEY='ronshoPastExamLogsv1';
const read=(key,fallback)=>{try{const v=JSON.parse(localStorage.getItem(key)||'');return v&&typeof v==='object'?v:fallback}catch(e){return fallback}};
const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const merge=(base,incoming)=>Object.assign({},base||{},incoming||{});
const mergePast=(base,incoming)=>{const out=Array.isArray(base)?base.slice():[];(Array.isArray(incoming)?incoming:[]).forEach(x=>{const i=out.findIndex(y=>(y.examType||'予備試験)===(x.examType||'予備試験')&&y.subject===x.subject&&y.year===x.year&&Number(y.round)===Number(x.round));if(i>=0)out[i]=x;else out.push(x)});return out};
const download=(name,text)=>{const b=new Blob([text],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u)};
function setup(){
 const page=document.getElementById('csvPage'); if(!page||document.getElementById('completeBackupPanel')) return;
 const panel=document.createElement('div'); panel.id='completeBackupPanel';
 panel.innerHTML='<h3>💾 完全バックアップ・復元（PC間同期用）</h3><p>学習履歴・手動記録・過去問ログを1つのJSONファイルに保存します。読み込み時は既存データと統合します。</p><button type="button" id="completeBackupExportBtn">完全バックアップを書き出す</button><button type="button" id="completeBackupImportBtn">完全バックアップを読み込む</button><input type="file" id="completeBackupInput" accept=".json" style="display:none"><span id="completeBackupStatus" style="font-size:12px;color:#4a6a90"></span>';
 page.insertBefore(panel,page.firstChild);
 document.getElementById('completeBackupExportBtn').addEventListener('click',()=>{const data={schemaVersion:1,exportedAt:new Date().toISOString(),studyLog:read(STUDY_KEY,{}),manualLog:read(MANUAL_KEY,{}),pastExamLogs:read(PAST_KEY,[])};download('論証集_完全バックアップ_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(data,null,2));document.getElementById('completeBackupStatus').textContent='書き出しました。'});
 const input=document.getElementById('completeBackupInput'); document.getElementById('completeBackupImportBtn').addEventListener('click',()=>input.click());
 input.addEventListener('change',async e=>{const file=e.target.files[0],msg=document.getElementById('completeBackupStatus');if(!file)return;try{const data=JSON.parse(await file.text());if(!data||typeof data!=='object')throw new Error('JSON形式が不正です。');const oldStudy=read(STUDY_KEY,{}),oldManual=read(MANUAL_KEY,{}),oldPast=read(PAST_KEY,[]);write(STUDY_KEY,merge(oldStudy,data.studyLog||{}));write(MANUAL_KEY,merge(oldManual,data.manualLog||{}));write(PAST_KEY,mergePast(oldPast,data.pastExamLogs||[]));msg.textContent='読み込み・統合しました。画面を再読み込みすると全て反映されます。'}catch(err){msg.textContent='読み込みに失敗しました: '+err.message}e.target.value=''});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
<\/script>`;
if(!html.includes('</body>')) throw new Error('HTMLの終了タグを検出できません。');
html=html.replace(/<\/body>/i,injected+'\n</body>');
fs.mkdirSync('dist',{recursive:true});fs.writeFileSync(output,html,'utf8');
console.log(output);