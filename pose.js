import { diagnoseSide, renderSideDiagnostics } from "./side-diagnostics.js?v=27";
import { bothHandsRaised } from "./next-gesture.js?v=27";
import { createStandingMonitor } from "./recovery.js?v=27";
const standingMonitor = createStandingMonitor();
let recoveryWaiting = false;
import { createFrontMotionDetector } from "./front-motion.js?v=lunge-v2";
import { CONFIG } from "./motion-config.js?v=27";
import { createJumpDetector } from "./jump.js?v=27";
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/vision_bundle.mjs";

const WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const video = document.getElementById("webcam");
const canvas = document.getElementById("pose-canvas");
const ctx = canvas.getContext("2d");
const modelStatus = document.getElementById("model-status");
const cameraStatus = document.getElementById("camera-status");
const poseStatus = document.getElementById("pose-status");
const cameraPlaceholder = document.getElementById("camera-placeholder");
const errorBox = document.getElementById("camera-error");
const enableButton = document.getElementById("enable-camera-button");
const stopButton = document.getElementById("stop-camera-button");
const continueButton = document.getElementById("continue-camera-button");
const cameraSelect = document.getElementById("camera-select");
const refreshCamerasButton = document.getElementById("refresh-cameras-button");
const cameraName = document.getElementById("camera-name");
const gestureStatus = document.getElementById("gesture-status");
const gestureProgressBar = document.getElementById("gesture-progress-bar");
const motionStatus = document.getElementById("motion-status");

let poseLandmarker = null;
let drawingUtils = null;
let stream = null;
let animationId = null;
let lastVideoTime = -1;
let initializing = false;
let detectedOnce = false;
let startGestureBeganAt = null;
let startGestureTriggered = false;
const START_GESTURE_HOLD_MS = 1500;

// 回答動作の連続誤入力防止用。
// 1回動作を検出した後、通常姿勢に戻って一定時間経つまで再入力しない。
let motionLatched = false;
let neutralBeganAt = null;
const NEUTRAL_HOLD_MS = 350;
const frontDetector = createFrontMotionDetector();
const jumpDetector = createJumpDetector();

const REQUIRED_FULL_BODY = [11, 12, 23, 24, 25, 26, 27, 28];
const VISIBILITY_THRESHOLD = CONFIG.visibility;

async function listCameras(preferFJ = true) {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter(device => device.kind === "videoinput");
    const previous = cameraSelect.value;
    cameraSelect.innerHTML = "";

    if (!cameras.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "カメラが見つかりません";
      cameraSelect.appendChild(option);
      return;
    }

    cameras.forEach((camera, index) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.textContent = camera.label || `カメラ ${index + 1}`;
      cameraSelect.appendChild(option);
    });

    if (previous && cameras.some(c => c.deviceId === previous)) {
      cameraSelect.value = previous;
    } else if (preferFJ) {
      const fj = cameras.find(c => /FJ Camera/i.test(c.label));
      if (fj) cameraSelect.value = fj.deviceId;
    }
  } catch (error) {
    console.error(error);
  }
}

function setStatus(element, text, className = "") {
  if (!element) return;
  element.textContent = text;
  element.className = `status-card ${className}`.trim();
}

function setMotionStatus(text, className = "") {
  if (!motionStatus) return;
  const practiceStatus = document.getElementById("practice-status");
  if (practiceStatus && practiceStatus.textContent !== text) practiceStatus.textContent = text;
  motionStatus.textContent = text;
  motionStatus.className = `motion-status ${className}`.trim();
}

function resetStartGesture(message = "開始ポーズ：両手を上げてください") {
  startGestureBeganAt = null;
  if (gestureProgressBar) gestureProgressBar.style.width = "0%";
  if (gestureStatus && !startGestureTriggered) {
    setStatus(gestureStatus, message);
  }
}

function visible(...points) {
  return points.every(lm => lm && (lm.visibility ?? 1) >= VISIBILITY_THRESHOLD);
}

function isBothHandsRaised(landmarks) {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  if (!visible(leftShoulder, rightShoulder, leftWrist, rightWrist)) return false;
  return leftWrist.y < leftShoulder.y && rightWrist.y < rightShoulder.y;
}

function updateStartGesture(landmarks, fullBodyVisible) {
  if (startGestureTriggered) return;
  if (!fullBodyVisible) {
    resetStartGesture("開始ポーズ：まず全身を映してください");
    return;
  }

  if (!isBothHandsRaised(landmarks)) {
    resetStartGesture("開始ポーズ：両手を肩より上に上げてください");
    return;
  }

  const now = performance.now();
  if (startGestureBeganAt === null) startGestureBeganAt = now;
  const elapsed = now - startGestureBeganAt;
  const progress = Math.min(100, (elapsed / START_GESTURE_HOLD_MS) * 100);
  if (gestureProgressBar) gestureProgressBar.style.width = `${progress}%`;
  setStatus(gestureStatus, `開始ポーズ：そのまま… ${Math.min(1.5, elapsed / 1000).toFixed(1)} / 1.5秒`, "warn");

  if (elapsed >= START_GESTURE_HOLD_MS) {
    startGestureTriggered = true;
    if (gestureProgressBar) gestureProgressBar.style.width = "100%";
    setStatus(gestureStatus, "開始ポーズ：認識しました！", "ok");
    window.dispatchEvent(new CustomEvent("pose-start-gesture"));
  }
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

async function initializePoseLandmarker() {
  if (poseLandmarker || initializing) return;
  initializing = true;
  clearError();
  setStatus(modelStatus, "MediaPipe：読み込み中…", "warn");

  try {
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    drawingUtils = new DrawingUtils(ctx);
    setStatus(modelStatus, "MediaPipe：準備完了", "ok");
  } catch (error) {
    console.error(error);
    setStatus(modelStatus, "MediaPipe：読み込み失敗", "error");
    showError("MediaPipeの読み込みに失敗しました。インターネット接続を確認して再読み込みしてください。");
    throw error;
  } finally {
    initializing = false;
  }
}

async function startCamera() {
  clearError();
  enableButton.disabled = true;
  continueButton.disabled = true;
  setStatus(cameraStatus, "カメラ：起動中…", "warn");

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("このブラウザではカメラAPIを利用できません。");
    }

    await initializePoseLandmarker();

    if (!cameraSelect.options.length || !cameraSelect.value) {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      permissionStream.getTracks().forEach(track => track.stop());
      await listCameras(true);
    }

    const selectedDeviceId = cameraSelect.value;
    const videoConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 }
    };
    if (selectedDeviceId) {
      videoConstraints.deviceId = { exact: selectedDeviceId };
    } else {
      videoConstraints.facingMode = "user";
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    cameraPlaceholder.classList.add("hidden");
    stopButton.disabled = false;
    setStatus(cameraStatus, "カメラ：起動中", "ok");
    const activeTrack = stream.getVideoTracks()[0];
    const activeLabel = activeTrack?.label || cameraSelect.options[cameraSelect.selectedIndex]?.textContent || "不明";
    setStatus(cameraName, `使用中：${activeLabel}`, "ok");
    await listCameras(false);
    setStatus(poseStatus, "姿勢：検出待ち", "warn");
    lastVideoTime = -1;
    detectedOnce = false;
    startGestureTriggered = false;
    motionLatched = false;
    neutralBeganAt = null;
    resetStartGesture("開始ポーズ：全身認識後に両手を上げてください");
    renderLoop();
  } catch (error) {
    console.error(error);
    setStatus(cameraStatus, "カメラ：起動失敗", "error");
    setStatus(poseStatus, "姿勢：未検出", "error");
    enableButton.disabled = false;
    stopButton.disabled = true;

    const permissionDenied = error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError";
    showError(
      permissionDenied
        ? "カメラの使用が許可されていません。ブラウザのカメラ権限を許可してください。"
        : `カメラを起動できませんでした：${error?.message || "不明なエラー"}`
    );
  }
}

function isFullBodyVisible(landmarks) {
  return REQUIRED_FULL_BODY.every(index => {
    const lm = landmarks[index];
    return lm && (lm.visibility ?? 1) >= VISIBILITY_THRESHOLD && lm.x >= 0 && lm.x <= 1 && lm.y >= 0 && lm.y <= 1;
  });
}

function isGameActive() {
  return document.getElementById("game-screen")?.classList.contains("active") ||
    document.getElementById("practice-screen")?.classList.contains("active");
}
let lastPoseAt=0, lastDiagnosticAt=-Infinity, lastDiagnostic=null;
function showBDiagnostics(points=[],result={},mode='answer',force=false) {
  const now=performance.now();
  if(!force && now-lastDiagnosticAt<100)return;
  lastDiagnosticAt=now;
  const state=frontDetector.getDiagnosticState();
  lastDiagnostic=diagnoseSide(points,(canvas.width||1280)/(canvas.height||720),state,now,result);
  renderSideDiagnostics(document.getElementById('b-diagnostics'),lastDiagnostic,mode);
}
setInterval(()=>{
  if(isGameActive() && performance.now()-lastPoseAt>CONFIG.sideMaxFrameGapMs && lastDiagnostic) {
    const stale={...lastDiagnostic,held:0,rows:lastDiagnostic.rows.map(r=>({...r,status:'pending',value:'更新待ち'}))};
    renderSideDiagnostics(document.getElementById('b-diagnostics'),stale,'stale');
  }
},200);
function reportExercise(active=false) {
  window.dispatchEvent(new CustomEvent('pose-exercise', {detail:{active}}));
}
function updateAnswerMotion(landmarks, fullBodyVisible, worldLandmarks) {
  if (!fullBodyVisible) {
    reportExercise(false);
    standingMonitor.sample([], performance.now(), false, 1);
    window.dispatchEvent(new CustomEvent("pose-next-gesture", {detail:{raised:false}}));
    frontDetector.reset(); jumpDetector.reset();
    showBDiagnostics(landmarks,{},'answer',true);
    if (isGameActive()) setMotionStatus("動作認識：全身をカメラ内に映してください", "warn");
    return;
  }
  const now = performance.now();
  const jump = jumpDetector.sample(landmarks, now);
  const upright = standingMonitor.sample(landmarks, now, jump.grounded, canvas.width / canvas.height);
  window.dispatchEvent(new CustomEvent("pose-next-gesture", {detail:{raised:bothHandsRaised(landmarks, canvas.width / canvas.height)}}));
  if (recoveryWaiting || !isGameActive()) {
    reportExercise(false);
    frontDetector.reset();
    showBDiagnostics(landmarks,{},recoveryWaiting?'waiting':'answer');
    if (recoveryWaiting) setMotionStatus("次へ進む操作：両手を肩より上に2秒間上げてください", "warn");
    return;
  }
  if (!standingMonitor.hasBaseline()) {
    reportExercise(false);
    frontDetector.reset();
    showBDiagnostics(landmarks);
    setMotionStatus("動作認識：最初にまっすぐ立って約0.6秒待ってください", "warn");
    return;
  }
  const result = frontDetector.sample(landmarks, now, jump, canvas.width / canvas.height, worldLandmarks);
  reportExercise(result.active === true);
  showBDiagnostics(landmarks,result,'answer',result.index!==null);
  document.getElementById("motion-metrics").textContent = result.metrics || "";
  if (result.index === null) {
    setMotionStatus(`動作認識：${result.message}`);
    return;
  }
  const name = ["スクワット", "片腕上げ側屈", "サイドランジ", "ジャンプ"][result.index];
  setMotionStatus(`動作認識：${name} → ${["A","B","C","D"][result.index]}`, "detected");
  document.getElementById("last-recognition").textContent = `直近の認識：${name} → ${["A","B","C","D"][result.index]}`;
  window.dispatchEvent(new CustomEvent("pose-answer", {detail:{index:result.index,motion:name}}));
}

function renderPose(result) {
  lastPoseAt=performance.now();
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!result.landmarks?.length) {
    reportExercise(false);
    setStatus(poseStatus, "姿勢：人を認識できていません", "warn");
    continueButton.disabled = true;
    resetStartGesture("開始ポーズ：人を認識できていません");
    standingMonitor.sample([], performance.now(), false, 1);
    window.dispatchEvent(new CustomEvent("pose-next-gesture", {detail:{raised:false}}));
    jumpDetector.reset(); frontDetector.reset(); neutralBeganAt = null;
    showBDiagnostics([],{},'answer',true);
    if (isGameActive()) setMotionStatus("動作認識：人を認識できていません", "warn");
    ctx.restore();
    return;
  }

  const landmarks = result.landmarks[0];
  drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, { lineWidth: 4 });
  drawingUtils.drawLandmarks(landmarks, { radius: 4, lineWidth: 2 });

  const fullBodyVisible = isFullBodyVisible(landmarks);
  if (fullBodyVisible) {
    setStatus(poseStatus, "姿勢：全身を認識しています", "ok");
    continueButton.disabled = false;
    detectedOnce = true;
  } else {
    setStatus(poseStatus, "姿勢：一部のみ認識（足首まで映してください）", "warn");
    continueButton.disabled = true;
  }

  if (document.getElementById("camera-screen")?.classList.contains("active")) {
    updateStartGesture(landmarks, fullBodyVisible);
  }
  updateAnswerMotion(landmarks, fullBodyVisible, result.worldLandmarks?.[0]);

  ctx.restore();
}

function renderLoop() {
  if (!stream || !poseLandmarker) return;

  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    const nowMs = performance.now();
    const result = poseLandmarker.detectForVideo(video, nowMs);
    renderPose(result);
    lastVideoTime = video.currentTime;
  }

  animationId = requestAnimationFrame(renderLoop);
}

function stopCamera() {
  reportExercise(false);
  standingMonitor.reset();
  frontDetector.reset();
  showBDiagnostics([],{},'answer',true);
  window.dispatchEvent(new CustomEvent("pose-next-gesture", {detail:{raised:false}}));
  if (animationId) cancelAnimationFrame(animationId);
  animationId = null;

  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  cameraPlaceholder.classList.remove("hidden");
  cameraPlaceholder.textContent = "カメラは停止しています";
  enableButton.disabled = false;
  stopButton.disabled = true;
  continueButton.disabled = true;
  setStatus(cameraStatus, "カメラ：停止中");
  setStatus(cameraName, "使用中：未選択");
  setStatus(poseStatus, detectedOnce ? "姿勢：停止中" : "姿勢：未検出");
  startGestureTriggered = false;
  motionLatched = false; jumpDetector.reset(); frontDetector.reset();
  neutralBeganAt = null;
  resetStartGesture("開始ポーズ：全身認識後に両手を上げてください");
  setMotionStatus("動作認識：カメラ停止中");
}

enableButton.addEventListener("click", startCamera);
refreshCamerasButton.addEventListener("click", async () => {
  clearError();
  await listCameras(true);
});
cameraSelect.addEventListener("change", async () => {
  if (stream) {
    stopCamera();
    await startCamera();
  }
});

listCameras(true);
stopButton.addEventListener("click", stopCamera);

window.poseController = {
  beginRecovery: () => { recoveryWaiting = true; standingMonitor.begin(); frontDetector.reset(); },
  endRecovery: () => { recoveryWaiting = false; standingMonitor.end(); },
  startCamera,
  stopCamera,
  isRunning: () => Boolean(stream),
  hasDetectedPose: () => detectedOnce,
  resetStartGesture: () => {
    startGestureTriggered = false;
    resetStartGesture("開始ポーズ：両手を上げてください");
  },
  resetAnswerLatch: () => {
    motionLatched = false;
    neutralBeganAt = null;
    frontDetector.reset();
    jumpDetector.reset();
    reportExercise(false);
    setMotionStatus("動作認識：通常姿勢で待機してください");
  }
};





