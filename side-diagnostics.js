import { CONFIG as C } from './motion-config.js?v=27';
import { measure, measureSideArm, sideStatus } from './front-motion.js?v=27';
const names={11:'左肩',12:'右肩',23:'左腰',24:'右腰',25:'左膝',26:'右膝',27:'左足首',28:'右足首',13:'左肘',14:'右肘',15:'左手首',16:'右手首'};
const f=(n,d=0)=>Number.isFinite(n)?n.toFixed(d):'—';
const angle=(a,b,c)=>{const u=[a.x-b.x,a.y-b.y],v=[c.x-b.x,c.y-b.y];const len=Math.hypot(...u)*Math.hypot(...v);return len?Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/len)))*180/Math.PI:0;};
export function diagnoseSide(points=[],aspect=1,state={},now=0,result={}) {
  const rows=[];
  const add=(id,label,ok,value,target,hint)=>rows.push({id,label,status:ok===null?'pending':ok?'ok':'fail',value,target,hint});
  const usable=(i,threshold)=>points[i] && Number.isFinite(points[i].x) && Number.isFinite(points[i].y) && points[i].x>=0 && points[i].x<=1 && points[i].y>=0 && points[i].y<=1 && (points[i].visibility??1)>=threshold;
  const body=[11,12,23,24,25,26,27,28],missing=body.filter(i=>!usable(i,C.visibility));
  add('body','全身の認識',!missing.length,missing.length?missing.map(i=>`${names[i]}(${f(points[i]?.visibility,2)})`).join('・')+'が未取得':'肩～足首を認識',`認識値 ${C.visibility}以上・画角内`, '頭から足首までカメラ内へ');
  const m=measure(points,aspect),base=state.baseline;
  add('baseline','直立の基準',Boolean(base),base?'取得済み':'まだ取得していません','最初に直立して待つ','いったんまっすぐ立ってください');
  const p=points.map(p=>p && ({...p,x:p.x*aspect}));
  const wrists=[15,16].filter(i=>!usable(i,C.sideArmVisibility));
  add('wrists','両手首の認識',!wrists.length,`左 ${f(points[15]?.visibility??(points[15]?1:null),2)} / 右 ${f(points[16]?.visibility??(points[16]?1:null),2)}${wrists.length?'（未取得あり）':''}`,`認識値 ${C.sideArmVisibility}以上・画角内`,'反対の手もカメラ内へ');
  let side=null;
  if(m && !wrists.length) {
    const rises=[(p[11].y-p[15].y)/m.scale,(p[12].y-p[16].y)/m.scale];
    const up=rises.map(v=>v>C.sideWristRise);
    const both=rises.every(v=>v>C.sideBothHandsMargin);
    if(up[0]!==up[1])side=up[0]?'left':'right';
    add('both','両手上げではない',!both,both?'両手が上がっています':'両手上げではありません','片腕のみ上げる','片方の手を肩より下へ');
    add('raised','上げる腕の高さ',Boolean(side),`左 ${f(rises[0]*100)}% / 右 ${f(rises[1]*100)}%`,`片方だけ肩より${f(C.sideWristRise*100)}%超 上`,'片腕をもう少し高く伸ばしてください');
    if(side) {
      const [s,e,w,os,ow]=side==='left'?[11,13,15,12,16]:[12,14,16,11,15];
      const other=(p[ow].y-p[os].y)/m.scale;
      add('other','反対の手の位置',other>=C.sideOtherWristDown,`肩から下へ ${f(other*100)}%`,`${f(C.sideOtherWristDown*100)}%以上（肩付近まで）`,'反対の手を下げてください');
      const elbowOK=usable(e,C.sideArmVisibility);
      const elbow=elbowOK?angle(p[s],p[e],p[w]):null;
      add('elbow','上げた腕の肘',elbowOK?elbow>=C.sideMinElbow:null,elbowOK?`${f(elbow)}°`:names[e]+'が未取得',`${C.sideMinElbow}°以上`,'肘をカメラに映し、もう少し伸ばしてください');
      const direction=(((p[11].x+p[12].x)-(p[23].x+p[24].x))/2)*Math.sign(p[s].x-p[os].x);
      add('direction','傾ける方向',direction<0,direction<0?'上げた腕と反対側':'同じ側、またはまだ直立','上げた腕と反対側へ','上げた腕と反対側へ体を傾けてください');
    }
  }
  for(const [id,label,target,hint] of [
    ['both','両手上げではない','片腕のみ上げる','両手首を映してください'],
    ['raised','上げる腕の高さ',`片方だけ肩より${C.sideWristRise*100}%超 上`,'片腕を上げてください'],
    ['other','反対の手の位置','肩付近より下','まず上げる腕を決めてください'],
    ['elbow','上げた腕の肘',`${C.sideMinElbow}°以上`,'まず上げる腕を決めてください'],
    ['direction','傾ける方向','上げた腕と反対側へ','まず上げる腕を決めてください']]) {
    if(!rows.some(r=>r.id===id))add(id,label,null,'取得待ち',target,hint);
  }
  add('tilt','上体の横傾き',m?m.tilt>=C.sideMinTilt && m.tilt<=C.sideMaxTilt:null,m?`${f(m.tilt)}°`:'—',`${C.sideMinTilt}～${C.sideMaxTilt}°`,'腰から上を横へ傾けてください');
  add('knees','両膝の伸び',m?Math.min(m.left,m.right)>=C.sideKnee:null,m?`左 ${f(m.left)}° / 右 ${f(m.right)}°`:'—',`両方${C.sideKnee}°以上`,'膝を伸ばしてください');
  add('width','足幅',m?m.width<C.sideMaxWidth:null,m?f(m.width,2)+'倍':'—',`肩幅の${C.sideMaxWidth}倍未満`,'足幅を狭くしてください');
  const hip=m&&base?Math.abs(m.hip-base.hip)/base.scale:null;
  const feet=m&&base?Math.max(Math.abs(m.leftFoot-base.leftFoot),Math.abs(m.rightFoot-base.rightFoot))/base.scale:null;
  add('hip','腰の高さ',hip===null?null:hip<C.sideMaxHipDrop,hip===null?'基準待ち':f(hip*100)+'%',`変化${f(C.sideMaxHipDrop*100)}%未満`,'腰を落とさず元の高さへ');
  add('feet','両足の位置',feet===null?null:feet<C.sideFootTolerance,feet===null?'基準待ち':f(feet*100)+'%',`高さ変化${f(C.sideFootTolerance*100)}%未満`,'両足を元の位置につけてください');
  add('armed','回答の受付',Boolean(state.armed || result.index===1),result.index===1?'Bを認識しました':state.armed?'受付中':'通常姿勢への復帰待ち','通常姿勢から動作を開始','いったんまっすぐ立ってください');
  const confirmed=result.index===1;
  const holding=state.candidate===`1:${side}` && Number.isFinite(state.since);
  const held=confirmed?C.sideHoldMs:holding?Math.min(C.sideHoldMs,Math.max(0,now-state.since)):0;
  const blockers=rows.filter(r=>r.status!=='ok');
  const poseOK=m&&base&&sideStatus({...m,arm:measureSideArm(points,aspect)},base).ok;
  return {rows,held,required:C.sideHoldMs,confirmed,side,
    summary:confirmed?'Bを認識しました':blockers.length?`あと${blockers.length}項目：${blockers[0].hint}`:poseOK?`その姿勢を${C.sideHoldMs/1000}秒間維持してください`:'姿勢を確認しています',
    resetReason:state.diagnosticReset || '',count:blockers.length};
}
export function renderSideDiagnostics(root,data,mode='answer') {
  if(!root)return;
  root.querySelector('[data-b-summary]').textContent=mode==='waiting'?'回答後の待機中：Bは受付停止。次へは両手上げ2秒':mode==='stale'?'映像の更新が止まっています。保持時間は計測できません':data.summary;
  const progress=root.querySelector('[data-b-progress]');
  progress.max=data.required;progress.value=mode==='answer'?data.held:0;
  root.querySelector('[data-b-time]').textContent=mode==='answer'?`${(data.held/1000).toFixed(1)} / ${(data.required/1000).toFixed(1)}秒`:'計測停止';
  root.querySelector('[data-b-reset]').textContent=data.resetReason;
  const list=root.querySelector('[data-b-checks]');list.replaceChildren();
  const priority={fail:0,pending:1,ok:2};
  for(const row of [...data.rows].sort((a,b)=>priority[a.status]-priority[b.status])) {
    const li=document.createElement('li');li.className=`b-check ${row.status}`;
    const label=document.createElement('strong');label.textContent=`${row.status==='ok'?'OK':row.status==='fail'?'未達':'待ち'}｜${row.label}`;
    const value=document.createElement('span');value.textContent=`現在：${row.value} ／ 目安：${row.target}`;
    li.append(label,value);list.appendChild(li);
  }
}
