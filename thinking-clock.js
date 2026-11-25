// 動作フレームが途絶えてもタイマーを停止し続けない。
export const THINKING = { durationMs: 10000, activityLeaseMs: 350 };
export function createThinkingClock() {
  let remainingMs=THINKING.durationMs, last=0, activeUntil=-Infinity;
  function reset(now) {remainingMs=THINKING.durationMs;last=now;activeUntil=-Infinity;}
  function tick(now) {
    now=Math.max(last,now);
    const pausedMs=Math.max(0,Math.min(now,activeUntil)-last);
    remainingMs=Math.max(0,remainingMs-(now-last-pausedMs));
    last=now;
    return {remainingMs,paused:remainingMs>0 && now<activeUntil};
  }
  function setActive(active,now) {
    tick(now);
    activeUntil=active && remainingMs>0 ? now+THINKING.activityLeaseMs : -Infinity;
  }
  return {reset,tick,setActive};
}
