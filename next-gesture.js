import { measure } from './front-motion.js?v=27';
export const NEXT_GESTURE = {
  intervalMs: 2000, holdMs: 2000, maxFrameGapMs: 350,
  visibility: .55, wristAboveShoulder: .10
};
export function bothHandsRaised(points, aspect=1) {
  const m=measure(points,aspect);
  if(!m || ![15,16].every(i=>points[i] && Number.isFinite(points[i].x) && Number.isFinite(points[i].y) && points[i].x>=0 && points[i].x<=1 && points[i].y>=0 && points[i].y<=1 && (points[i].visibility??1)>=NEXT_GESTURE.visibility)) return false;
  return points[15].y < points[11].y-m.scale*NEXT_GESTURE.wristAboveShoulder && points[16].y < points[12].y-m.scale*NEXT_GESTURE.wristAboveShoulder;
}
export function createNextGestureGate() {
  let started=null, since=null, last=null;
  function reset(){started=null;since=null;last=null;}
  function begin(now){started=now;since=null;last=null;}
  function sample(raised,now) {
    if(started===null || now-started<NEXT_GESTURE.intervalMs || !raised) {since=null;last=now;return false;}
    if(since===null || last===null || now-last>NEXT_GESTURE.maxFrameGapMs) since=now;
    last=now;
    return now-since>=NEXT_GESTURE.holdMs;
  }
  function progress(now){return since===null ? 0 : Math.min(NEXT_GESTURE.holdMs,Math.max(0,now-since));}
  return {reset,begin,sample,progress};
}
