import { CONFIG as C } from "./motion-config.js?v=27";
// 画面内の立ち位置を基準に、両足と上半身の上昇を時間付きで判定する。
export function createJumpDetector() {
  let baseline = null;
  let stableSince = null;
  let lastGroundedAt = null;
  let fired = false;
  let lastSample = null;
  function reset() {
    baseline = null;
    stableSince = null;
    lastGroundedAt = null;
    fired = false;
    lastSample = null;
  }
  function sample(points, now) {
    if(lastSample!==null && now-lastSample>C.sideMaxFrameGapMs) reset();
    lastSample=now;
    const required = [11, 12, 23, 24, 25, 26, 27, 28];
    if (!required.every(i => points[i] && (points[i].visibility ?? 1) >= 0.55)) {
      reset();
      return { jump: false, grounded: false, ready: false };
    }
    const shoulder = (points[11].y + points[12].y) / 2;
    const hip = (points[23].y + points[24].y) / 2;
    const left = points[27].y, right = points[28].y;
    const scale = Math.max(Math.abs(hip - shoulder), 0.08);
    const upright = (points[25].y - points[23].y) > scale * 0.65 &&
      (points[26].y - points[24].y) > scale * 0.65;
    const current = { shoulder, hip, left, right, scale };
    if (!baseline) { baseline = current; stableSince = now; }
    if (lastGroundedAt === null) {
      const stable = upright && ['shoulder', 'hip', 'left', 'right'].every(k =>
        Math.abs(current[k] - baseline[k]) < baseline.scale * 0.1);
      if (!stable) { baseline = current; stableSince = now; }
      if (stable && now - stableSince >= 400) lastGroundedAt = now;
      return { jump: false, grounded: stable, ready: lastGroundedAt !== null };
    }
    const leftRise = (baseline.left - left) / baseline.scale;
    const rightRise = (baseline.right - right) / baseline.scale;
    const grounded = Math.abs(leftRise) < 0.12 && Math.abs(rightRise) < 0.12;
    if (grounded) {
      lastGroundedAt = now;
      fired = false;
      // 足が接地していて直立している間だけ、位置の小さな変化に追従する。
      if (upright) for (const key of Object.keys(baseline)) {
        baseline[key] += (current[key] - baseline[key]) * 0.04;
      }
    }
    const jump = !fired && now - lastGroundedAt <= 600 &&
      leftRise > C.jumpFootRise && rightRise > C.jumpFootRise &&
      Math.abs(leftRise - rightRise) < 0.25 &&
      (baseline.hip - hip) / baseline.scale > C.jumpHipRise &&
      (baseline.shoulder - shoulder) / baseline.scale > C.jumpShoulderRise;
    if (jump) fired = true;
    return { jump, grounded, ready: true };
  }
  return { sample, reset };
}

