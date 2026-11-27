import { CONFIG as C } from './motion-config.js?v=lunge-fix';
const REQUIRED = [11,12,23,24,25,26,27,28];
const mid = (a,b) => ({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
function angleDegrees(a,b,c) {
  const u={x:a.x-b.x,y:a.y-b.y}, v={x:c.x-b.x,y:c.y-b.y};
  const d=Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y);
  return d ? Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/d)))*180/Math.PI : 0;
}
export function measure(points, aspect=1) {
  if (!REQUIRED.every(i => points[i] && Number.isFinite(points[i].x) && Number.isFinite(points[i].y) && (points[i].visibility??1)>=C.visibility && points[i].x>=0 && points[i].x<=1 && points[i].y>=0 && points[i].y<=1)) return null;
  // xとyの正規化単位が異なるため、画像の縦横比を補正する。
  const p=points.map(p=>p && ({...p,x:p.x*aspect}));
  const shoulder=mid(p[11],p[12]), hip=mid(p[23],p[24]);
  const scale=Math.hypot(shoulder.x-hip.x,shoulder.y-hip.y);
  const shoulderWidth=Math.abs(p[11].x-p[12].x);
  if(scale<0.02 || shoulderWidth<0.05) return null;
  const left=angleDegrees(p[23],p[25],p[27]), right=angleDegrees(p[24],p[26],p[28]);
  return {tilt:Math.abs(Math.atan2(shoulder.x-hip.x,hip.y-shoulder.y)*180/Math.PI),
    width:Math.abs(p[27].x-p[28].x)/shoulderWidth,left,right,asym:Math.abs(left-right),
    hip:hip.y,hipX:hip.x,shoulder:shoulder.y,scale,leftFoot:p[27].y,rightFoot:p[28].y,foot:(p[27].y+p[28].y)/2};
}
// 腕の位置は画像の縦横比を補正。左右は画面内の肩の並びから判断する。
export function measureSideArm(points, aspect=1) {
  const usable=i=>points[i] && Number.isFinite(points[i].x) && Number.isFinite(points[i].y) &&
    (points[i].visibility??1)>=([13,14,15,16].includes(i)?C.sideArmVisibility:C.visibility) && points[i].x>=0 && points[i].x<=1 && points[i].y>=0 && points[i].y<=1;
  if(![11,12,15,16,23,24].every(usable)) return null;
  const p=points.map(p=>p && ({...p,x:p.x*aspect}));
  const shoulder=mid(p[11],p[12]),hip=mid(p[23],p[24]);
  const scale=Math.hypot(shoulder.x-hip.x,shoulder.y-hip.y);
  if(scale<.02) return null;
  const leftRise=(p[11].y-p[15].y)/scale,rightRise=(p[12].y-p[16].y)/scale;
  const detail=`腕高さ ${leftRise.toFixed(2)}・${rightRise.toFixed(2)}`;
  // 次へ進む操作と同じ高さの両手上げは、Bの緩和条件より先に必ず拒否。
  if(leftRise>C.sideBothHandsMargin && rightRise>C.sideBothHandsMargin) return {reason:'Bは片腕だけ上げてください（両手上げは次へ）',detail};
  const leftUp=p[15].y<p[11].y-scale*C.sideWristRise;
  const rightUp=p[16].y<p[12].y-scale*C.sideWristRise;
  if(leftUp===rightUp) return {reason:leftUp?'Bは片腕だけ上げてください（両手上げは次へ）':'片腕を頭上に伸ばしてください'};
  const [s,e,w,otherS,otherW]=leftUp?[11,13,15,12,16]:[12,14,16,11,15];
  if(!usable(e)) return {reason:'上げた腕の肘まで映してください'};
  if(p[otherW].y<p[otherS].y+scale*C.sideOtherWristDown) return {reason:'反対の手は肩より下へ下げてください'};
  const elbow=angleDegrees(p[s],p[e],p[w]);
  if(elbow<C.sideMinElbow) return {reason:'頭上の腕の肘をもう少し伸ばしてください',detail:`${detail} / 肘 ${elbow.toFixed(0)}°`};
  const side=Math.sign(p[s].x-p[otherS].x);
  if((shoulder.x-hip.x)*side>=0) return {reason:'上げた腕と反対側へ体を傾けてください'};
  return {ok:true,side:leftUp?'left':'right',reason:'片腕の姿勢OK',detail:`${detail} / 肘 ${elbow.toFixed(0)}°`};
}
export function sideStatus(m, baseline) {
  if(!m || !baseline) return {ok:false,reason:'直立して基準を取得してください'};
  if(!m.arm?.ok) return {ok:false,reason:m.arm?.reason || '両手首と上げる腕の肘を映してください'};
  if(m.tilt<C.sideMinTilt) return {ok:false,reason:'上げた腕と反対側へもう少し傾けてください'};
  if(m.tilt>C.sideMaxTilt) return {ok:false,reason:'傾きを少し戻してください'};
  if(Math.min(m.left,m.right)<C.sideKnee) return {ok:false,reason:'両膝を伸ばしてください'};
  if(m.width>=C.sideMaxWidth) return {ok:false,reason:'足幅を通常位置へ戻してください'};
  if(Math.abs(m.hip-baseline.hip)/baseline.scale>=C.sideMaxHipDrop) return {ok:false,reason:'腰を元の高さへ戻してください'};
  if(Math.abs(m.leftFoot-baseline.leftFoot)/baseline.scale>=C.sideFootTolerance || Math.abs(m.rightFoot-baseline.rightFoot)/baseline.scale>=C.sideFootTolerance) return {ok:false,reason:'両足を元の位置につけてください'};
  return {ok:true,side:m.arm.side,reason:'片腕上げ側屈の姿勢OK'};
}
export function classify(m, baseline, grounded) {
  if(!m || !baseline) return null;
  // Bは回答前の足首高さを使い、ジャンプ用の接地フラグから独立させる。
  if(sideStatus(m,baseline).ok) return 1;
  if(!grounded) return null;
  const bentKnee = Math.min(m.left, m.right);
  const straightKnee = Math.max(m.left, m.right);
  const hipShift = Math.abs(m.hipX - baseline.hipX) / baseline.scale;
  const wideStance = m.width >= C.lungeWidth &&
    (m.width - baseline.width >= C.lungeWidthGain || hipShift >= C.lungeHipShift);
  if (wideStance && bentKnee < C.lungeBentKnee && straightKnee >= C.lungeStraightKnee &&
      m.asym >= C.lungeAsymmetry && m.tilt < C.lungeMaxTilt) return 2;

  const drop = (m.hip - baseline.hip) / baseline.scale;
  const bothKneesBent = straightKnee < C.squatKnee ||
    (straightKnee < C.squatDropMaxKnee && drop > C.squatDrop);
  if (m.tilt < C.squatMaxTilt && m.width < C.squatMaxWidth &&
      m.asym < C.squatAsymmetry && hipShift < C.squatMaxHipShift && bothKneesBent) return 0;
  return null;
}
export function createFrontMotionDetector() {
  let baseline=null, neutralSince=null, candidate=null, since=null, armed=false, lastSample=null, diagnosticReset='', jumpCount=0, lastJumpAt=null;
  const squatTarget = 3;
  const squatGapMs = 4000;
  let squatCount = 0, squatDown = false, squatAt = null, squatExpired = false;
  function clearSquats() {
    squatCount = 0;
    squatDown = false;
    squatAt = null;
    squatExpired = false;
  }
  function reset() { clearSquats(); baseline=null; neutralSince=null; candidate=null; since=null; armed=false; lastSample=null; diagnosticReset=''; jumpCount=0; lastJumpAt=null; }
  function sample(points, now, jump, aspect=1, worldPoints=null) {
    if(lastSample!==null && now-lastSample>C.sideMaxFrameGapMs) {reset();diagnosticReset='直近の計測リセット：映像の更新が途切れました';}
    lastSample=now;
    const m=measure(points,aspect);
    if(m) m.arm=measureSideArm(points,aspect);
    if(!m) {reset(); return {index:null, message:'全身を映してください'};}
    const neutral=jump.grounded && m.tilt<C.neutralTilt && Math.min(m.left,m.right)>C.neutralKnee && m.width<C.neutralWidth && (!baseline || (Math.abs(m.hip-baseline.hip)<baseline.scale*0.10 && m.scale/baseline.scale>C.neutralTorsoRatio && Math.abs(m.shoulder-baseline.shoulder)<baseline.scale*C.neutralShoulderTolerance));
    if(neutral) {
      neutralSince ??= now;
      if(now-neutralSince>=C.neutralMs && !armed) {armed=true; baseline=m;}
    } else neutralSince=null;
    const side=sideStatus(m,baseline);
    const metrics=`B: ${side.reason} / ${m.arm?.detail || ""} / 傾き ${m.tilt.toFixed(0)}° / 足幅 ${m.width.toFixed(2)} / 膝 ${m.left.toFixed(0)}°・${m.right.toFixed(0)}°`;
    if(!armed) return {index:null,message:'直立・通常の足幅に戻ってください',metrics};
    // 既存の離陸イベントは、着地するまで再発火しない。1回の滞空を複数回数えない。
    if(lastJumpAt!==null && now-lastJumpAt>=C.jumpSequenceGapMs) {jumpCount=0;lastJumpAt=null;}
    if(jump.jump) {
      clearSquats();
      jumpCount+=1; lastJumpAt=now; candidate=null; since=null;
      if(jumpCount>=C.jumpCount) {
        armed=false;neutralSince=null;jumpCount=0;lastJumpAt=null;
        return {index:3,active:false,message:'認識しました',metrics};
      }
      return {index:null,active:true,message:`ジャンプ ${jumpCount} / ${C.jumpCount}回（着地して次のジャンプ）`,metrics};
    }
    const index=classify(m,baseline,jump.grounded);
    // 着地の膝曲げをスクワットの開始として扱わない。
    if(jumpCount>0 && (index===null || now-lastJumpAt<C.jumpLandingGraceMs)) {
      return {index:null,active:true,message:`ジャンプ ${jumpCount} / ${C.jumpCount}回（続けてジャンプ）`,metrics};
    }
    if(index === 1 || index === 2 || !jump.grounded) clearSquats();
    if(squatAt !== null && now - squatAt >= squatGapMs) {
      clearSquats();
      squatExpired = !neutral;
    }
    if(neutral) squatExpired = false;
    if(index === 0) {
      candidate = null;
      since = null;
      if(squatExpired) return {index:null, active:false, message:'立ち上がってスクワットをやり直してください', metrics};
      if(!squatDown) {
        squatDown = true;
        squatAt = now;
      }
      return {index:null, active:true, message:`スクワット ${squatCount} / ${squatTarget}回（立ち上がると1回）`, metrics};
    }
    if(squatDown && neutralSince !== null && now - neutralSince >= 100) {
      squatDown = false;
      squatAt = now;
      squatCount += 1;
      if(squatCount === squatTarget) {
        clearSquats();
        armed = false;
        neutralSince = null;
        return {index:0, active:false, message:'認識しました', metrics};
      }
    }
    if(index === null && squatAt !== null) {
      return {index:null, active:true, message:`スクワット ${squatCount} / ${squatTarget}回（${squatDown ? '立ち上がってください' : '続けてスクワット'}）`, metrics};
    }
    if(index===null) {if(candidate?.startsWith('1:'))diagnosticReset=`直近の計測リセット：${side.reason}`;candidate=null;since=null;return {index:null,active:false,message:'準備OK',metrics};}
    jumpCount=0;lastJumpAt=null;
    const key=index===1 ? `1:${side.side}` : String(index);
    if(candidate!==key) {if(candidate?.startsWith('1:'))diagnosticReset='直近の計測リセット：左右の腕、または回答動作が変わりました';candidate=key;since=now;}
    const hold=index===1 ? C.sideHoldMs : C.holdMs;
    if(now-since<hold) return {index:null,active:true,message:`${['A：スクワット','B：片腕上げ側屈','C：サイドランジ'][index]}を維持 (${((now-since)/1000).toFixed(1)} / ${(hold/1000).toFixed(1)}秒)`,metrics};
    armed=false;candidate=null;since=null;neutralSince=null;
    return {index,active:false,message:'認識しました',metrics};
  }
  return {reset,sample,getDiagnosticState:()=>({baseline,armed,candidate,since,diagnosticReset})};
}
