import { measure } from './front-motion.js?v=27';
// 距離は校正時の胴長比、時間はms、角度は度。
export const RECOVERY = {
  intervalMs: 2000, holdMs: 400, maxFrameGapMs: 350,
  tilt: 12, knee: 158, maxWidth: 1.8, hipTolerance: .12,
  footTolerance: .12, stabilityTolerance: .06, minLegTorso: .85, calibrationMs: 600
};
export function createStandingMonitor() {
  let baseline=null, calibrating=null, since=null, last=null, waiting=false, reason="直立の基準を取得中";
  function reset() {baseline=null;calibrating=null;since=null;last=null;waiting=false;}
  function begin() {waiting=true;calibrating=null;since=null;}
  function end() {waiting=false;}
  function sample(points, now, grounded, aspect) {
    const m=measure(points,aspect);
    if (m) {m.leftFoot=points[27].y;m.rightFoot=points[28].y;}
    const shape=m && m.tilt<RECOVERY.tilt && Math.min(m.left,m.right)>RECOVERY.knee && m.width<RECOVERY.maxWidth && (m.foot-m.hip)/m.scale>RECOVERY.minLegTorso;
    if(!shape) {
      reason = !m ? "肩・腰・膝・足首を映してください" : m.tilt>=RECOVERY.tilt ? "上体の傾きを戻してください" : Math.min(m.left,m.right)<=RECOVERY.knee ? "両膝を伸ばしてください" : m.width>=RECOVERY.maxWidth ? "足幅を通常位置へ戻してください" : "腰を上げて立ってください";
      calibrating=null;since=null;last=now;return false;
    }
    // 時間切れまでに基準を取れなかった場合も、直立を安定維持すれば初回校正できる。
    // 基準取得済みの場合は回答中に更新しない。
    if(!waiting || !baseline) {
      if(!calibrating || now-last>RECOVERY.maxFrameGapMs || Math.abs(m.hip-calibrating.hip)>m.scale*RECOVERY.stabilityTolerance || Math.abs(m.foot-calibrating.foot)>m.scale*RECOVERY.stabilityTolerance) {calibrating=m;since=now;}
      if(now-since>=RECOVERY.calibrationMs) baseline=m;
    }
    last=now;
    // 回答用ジャンプ検出器のgroundedには依存せず、復帰専用の固定基準で確認する。
    const hipOK=baseline && Math.abs(m.hip-baseline.hip)<baseline.scale*RECOVERY.hipTolerance;
    const feetOK=baseline && Math.abs(m.leftFoot-baseline.leftFoot)<baseline.scale*RECOVERY.footTolerance && Math.abs(m.rightFoot-baseline.rightFoot)<baseline.scale*RECOVERY.footTolerance;
    reason=!baseline ? "直立の基準を取得中（約0.6秒維持）" : !hipOK ? "腰を元の高さへ戻してください" : !feetOK ? "両足を元の位置へ戻してください" : "直立を維持してください";
    return Boolean(hipOK && feetOK);
  }
  return {reset,begin,end,sample,hasBaseline:()=>baseline!==null,reason:()=>reason};
}
export function createRecoveryGate() {
  let started=null, since=null, last=null;
  function reset(){started=null;since=null;last=null;}
  function begin(now){started=now;since=null;last=null;}
  function sample(upright,now) {
    if(started===null || now-started<RECOVERY.intervalMs || !upright) {since=null;last=now;return false;}
    if(since===null || last===null || now-last>RECOVERY.maxFrameGapMs) since=now;
    last=now;
    return now-since>=RECOVERY.holdMs;
  }
  return {reset,begin,sample};
}
