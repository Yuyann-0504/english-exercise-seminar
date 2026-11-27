import { createThinkingClock } from './thinking-clock.js?v=27';
const thinkingClock = createThinkingClock();
import { createNextGestureGate as createRecoveryGate, NEXT_GESTURE as RECOVERY } from "./next-gesture.js?v=27";
const recoveryGate = createRecoveryGate();
let recovering = false, recoveryStarted = 0, recoveryNoticeTimer = null;
const MOTIONS = ["スクワット", "片腕上げ側屈", "サイドランジ", "ジャンプ"];
const LABELS = ["A", "B", "C", "D"];


function clearAnswerHighlight() {
  els.choices.querySelectorAll(".answered").forEach(choice => {
    choice.classList.remove("answered");
    choice.querySelector(".answer-badge")?.remove();
  });
}

function revealChoiceWords() {
  const q = state.questions[state.index];
  q.choices.forEach((choice, index) => {
    if (index === q.answerIndex || !choice.word) return;
    const meaning = els.choices.children[index]?.querySelector(".meaning");
    if (!meaning || meaning.querySelector(".choice-english")) return;
    const word = document.createElement("span");
    word.className = "choice-english";
    word.lang = "en";
    word.textContent = `（${choice.word}）`;
    meaning.appendChild(word);
  });
}

function highlightAnswer(index, source) {
  clearAnswerHighlight();
  const choice = els.choices.children[index];
  choice.classList.add("answered");
  const badge = document.createElement("div");
  badge.className = "answer-badge";
  badge.textContent = "あなたの回答";
  choice.appendChild(badge);

  const summary = document.createElement("div");
  summary.className = "answer-summary";
  summary.textContent = `あなたの回答: ${LABELS[index]}（${MOTIONS[index]}）｜入力: ${source}`;
  els.answerConfirmation.textContent = summary.textContent; els.answerConfirmation.classList.add("has-answer");
}

const state = {
  level: null,
  mode: "normal",
  questions: [],
  reviewItems: [],
  index: 0,
  correctCount: 0,
  answeredCount: 0,
  locked: false,
  timerId: null,
  countdownId: null,
  timeRemaining: 10
};

const screens = {
  instructions: document.getElementById("instructions-screen"),
  title: document.getElementById("title-screen"),
  difficulty: document.getElementById("difficulty-screen"),
  camera: document.getElementById("camera-screen"),
  countdown: document.getElementById("countdown-screen"),
  game: document.getElementById("game-screen"),
  result: document.getElementById("result-screen")
};

const els = {
  progress: document.getElementById("question-progress"),
  timer: document.getElementById("timer"),
  word: document.getElementById("word"),
  choices: document.getElementById("choices"),
  feedback: document.getElementById("feedback"), answerConfirmation: document.getElementById("answer-confirmation"),
  countdownNumber: document.getElementById("countdown-number"),
  resultScore: document.getElementById("result-score"),
  resultRate: document.getElementById("result-rate")
};

function moveSharedCamera(targetName) {
  const stage = document.getElementById("shared-camera-stage");
  const cameraHome = document.getElementById("camera-stage-home");
  const gameSlot = document.getElementById("game-camera-slot");
  if (!stage) return;

  if (targetName === "game" && gameSlot && stage.parentElement !== gameSlot) {
    gameSlot.appendChild(stage);
  } else if (targetName === "camera" && cameraHome && stage.parentElement !== cameraHome) {
    cameraHome.appendChild(stage);
  }
}

function showScreen(name) {
  cancelRecovery();
  Object.values(screens).forEach(s => s.classList.remove("active"));
  screens[name].classList.add("active");
  // 画面を有効化してからカメラ要素を移動する。
  // 小さい画面でもゲーム中は必ず game-camera-slot 内に表示する。
  moveSharedCamera(name);
  if (name === "game") {
    requestAnimationFrame(() => moveSharedCamera("game"));
  }
}

function resetGameData(mode = "normal", reviewQuestions = null) {
  state.mode = mode === "review" && reviewQuestions?.length ? "review" : "normal";
  state.questions = state.mode === "review" ? reviewQuestions : getQuestions(state.level, 10);
  state.index = 0;
  state.reviewItems = [];
  state.correctCount = 0;
  state.answeredCount = 0;
  state.locked = false;
  clearInterval(state.timerId);
}

function startCountdown(mode = "normal", reviewQuestions = null) {
  showScreen("countdown");
  let count = 5;
  els.countdownNumber.textContent = count;
  clearInterval(state.countdownId);
  state.countdownId = setInterval(() => {
    count -= 1;
    if (count <= 0) {
      clearInterval(state.countdownId);
      startGame(mode, reviewQuestions);
    } else {
      els.countdownNumber.textContent = count;
    }
  }, 1000);
}

function startGame(mode = "normal", reviewQuestions = null) {
  resetGameData(mode, reviewQuestions);
  showScreen("game");
  renderQuestion();
}

function renderQuestion() { els.answerConfirmation.textContent = "v0.29｜あなたの回答: 未回答"; els.answerConfirmation.classList.remove("has-answer");
  clearAnswerHighlight();
  // resetAnswerLatchは同期的にpose-exerciseを通知する。
  // 新しい時計を初期化するまでは、その通知で前問の時計を進めない。
  state.locked = true;
  clearInterval(state.timerId);
  els.feedback.className = "feedback hidden";
  els.feedback.textContent = "";

  const q = state.questions[state.index];
  els.progress.textContent = `${state.mode === "review" ? "復習 " : ""}Q${state.index + 1} / ${state.questions.length}`;
  els.word.textContent = q.word;
  els.choices.innerHTML = "";

  q.choices.forEach((choice, i) => {
    const div = document.createElement("div");
    div.className = "choice";
    div.innerHTML = `
      <div class="label">${LABELS[i]}</div>
      <div class="meaning">${choice.text}</div>
      <div class="motion">動作：${MOTIONS[i]}（${i === 3 ? "3回" : "3秒保持"}）</div>
    `;
    els.choices.appendChild(div);
  });

  window.poseController?.endRecovery?.();
  window.poseController?.resetAnswerLatch?.();
  state.locked = false;
  startQuestionTimer();
}

function updateQuestionTimer() {
  if (state.locked || !screens.game.classList.contains('active')) return;
  const clock = thinkingClock.tick(performance.now());
  state.timeRemaining = Math.ceil(clock.remainingMs / 1000);
  els.timer.textContent = `残り ${state.timeRemaining}秒${clock.paused ? '（運動中・一時停止）' : ''}`;
  if (clock.remainingMs <= 0) {clearInterval(state.timerId);handleTimeout();}
}
function startQuestionTimer() {
  clearInterval(state.timerId);
  thinkingClock.reset(performance.now());
  updateQuestionTimer();
  state.timerId = setInterval(updateQuestionTimer, 100);
}
window.addEventListener('pose-exercise', event => {
  if (state.locked || !screens.game.classList.contains('active')) return;
  thinkingClock.setActive(event.detail?.active === true, performance.now());
  updateQuestionTimer();
});

function answer(index, source = "キーボード") {
  if (!Number.isInteger(index) || index < 0 || index >= LABELS.length) return;
  if (state.locked || !screens.game.classList.contains("active")) return;

  state.locked = true;
  clearInterval(state.timerId);
  state.answeredCount += 1;

  const q = state.questions[state.index];
  const isCorrect = index === q.answerIndex;
  if (isCorrect) state.correctCount += 1;
  else recordReview("wrong", index);

  if (isCorrect) {
    els.feedback.className = "feedback correct";
    els.feedback.textContent = "Correct!";
  } else {
    const correctText = q.choices[q.answerIndex].text;
    els.feedback.className = "feedback wrong";
    els.feedback.textContent = `Wrong...  ${q.word} = ${correctText}`;
  }

  highlightAnswer(index, source);
  beginRecovery();
}

function handleTimeout() {
  if (state.locked) return;
  state.locked = true;
  state.answeredCount += 1;
  const q = state.questions[state.index];
  const correctText = q.choices[q.answerIndex].text;
  els.feedback.className = "feedback wrong";
  els.feedback.textContent = `Time Up...  ${q.word} = ${correctText}`;
  recordReview("timeout");
  beginRecovery();
}

function skipQuestion() {
  if (state.locked || !screens.game.classList.contains("active")) return;
  state.locked = true;
  clearInterval(state.timerId);
  state.answeredCount += 1;
  const q = state.questions[state.index];
  const correctText = q.choices[q.answerIndex].text;
  els.feedback.className = "feedback wrong";
  els.feedback.textContent = `Skipped...  ${q.word} = ${correctText}`;
  recordReview("skipped");
  beginRecovery();
}

function cancelRecovery() {
  recovering = false;
  recoveryGate.reset();
  clearTimeout(recoveryNoticeTimer);
  window.poseController?.endRecovery?.();
  document.getElementById("recovery-panel").classList.add("hidden");
}
function beginRecovery() {
  revealChoiceWords();
  clearInterval(state.timerId);
  recovering = true;
  recoveryStarted = performance.now();
  recoveryGate.begin(recoveryStarted);
  window.poseController?.beginRecovery?.();
  document.getElementById("manual-confirm").checked = false;
  document.getElementById("manual-next").disabled = true;
  document.getElementById("debug-recovery").open = false;
  document.getElementById("recovery-panel").classList.remove("hidden");
  document.getElementById("recovery-message").textContent = "回答を確認しています（2秒間のインターバル）";
  recoveryNoticeTimer = setTimeout(() => {
    if (recovering) document.getElementById("recovery-message").textContent = "次の問題に進むには、両手を肩より上に2秒間上げてください";
  }, RECOVERY.intervalMs);
}
window.addEventListener("pose-next-gesture", event => {
  if (!recovering || !screens.game.classList.contains("active")) return;
  if (recoveryGate.sample(event.detail.raised === true, performance.now())) {
    document.getElementById("recovery-message").textContent = "両手上げを確認しました";
    nextQuestion();
  } else if (performance.now()-recoveryStarted >= RECOVERY.intervalMs) {
    const seconds=(recoveryGate.progress(performance.now())/1000).toFixed(1);
    document.getElementById("recovery-message").textContent = `次の問題に進むには、両手を肩より上に2秒間上げてください（${seconds} / 2.0秒）`;
  }
});
document.getElementById("manual-confirm").addEventListener("change", event => {
  document.getElementById("manual-next").disabled = !event.target.checked;
});
document.getElementById("manual-next").addEventListener("click", () => {
  if (recovering && document.getElementById("manual-confirm").checked && performance.now()-recoveryStarted>=RECOVERY.intervalMs) nextQuestion();
});

function nextQuestion() {
  if (!recovering) return;
  cancelRecovery();
  clearAnswerHighlight();
  els.feedback.className = "feedback hidden";
  els.feedback.textContent = "";
  state.index += 1;
  if (state.index >= state.questions.length) {
    showResult();
    return;
  }
  renderQuestion();
}

function showResult() {
  clearInterval(state.timerId);
  const total = state.questions.length;
  const rate = Math.round((state.correctCount / total) * 100);
  els.resultScore.textContent = `正解数：${state.correctCount} / ${total}`;
  els.resultRate.textContent = `正答率：${rate}%`;
  document.getElementById("result-heading").textContent = state.mode === "review" ? "復習の結果" : "結果";
  document.getElementById("round-summary").textContent = state.mode === "review" ? `今回の復習：${total}問。${state.reviewItems.length ? "残った単語だけ、もう一度挑戦できます。" : "全問正解です。"}` : "通常プレイ：10問";
  renderReview();
  showScreen("result");
}

function recordReview(reason, selectedIndex = null) {
  const q = state.questions[state.index];
  // 問題番号で一意に記録。同じ回答の重複イベントでは追加しない。
  if (state.reviewItems.some(item => item.questionNumber === state.index + 1)) return;
  state.reviewItems.push({
    questionNumber: state.index + 1,
    word: q.word,
    category: q.category,
    meaning: q.choices[q.answerIndex].text,
    selectedMeaning: Number.isInteger(selectedIndex) ? q.choices[selectedIndex].text : null,
    reason
  });
}
function renderReview() {
  const list = document.getElementById("review-list");
  const empty = document.getElementById("review-empty");
  const count = document.getElementById("review-count");
  list.innerHTML = "";
  count.textContent = `復習する単語：${state.reviewItems.length}語`;
  const reviewButton = document.getElementById("review-retry-button");
  reviewButton.classList.toggle("hidden", state.reviewItems.length === 0);
  reviewButton.textContent = state.mode === "review" ? `残った${state.reviewItems.length}語をもう一度復習する` : `間違えた${state.reviewItems.length}語だけ復習する`;
  empty.textContent = state.mode === "review" ? "復習した単語をすべて正解しました！" : "全問正解！復習する単語はありません。";
  empty.classList.toggle("hidden", state.reviewItems.length > 0);
  list.classList.toggle("hidden", state.reviewItems.length === 0);
  for (const item of state.reviewItems) {
    const card = document.createElement("li");
    card.className = "review-item";
    const meta = document.createElement("p");
    meta.className = "review-meta";
    meta.textContent = `Q${item.questionNumber}｜${{wrong:"不正解",timeout:"時間切れ（未回答）",skipped:"スキップ（未回答）"}[item.reason]}`;
    const word = document.createElement("h4");
    word.className = "review-word";word.lang = "en";word.textContent = item.word;
    const meaning = document.createElement("p");
    meaning.className = "review-meaning";meaning.textContent = `正しい意味：${item.meaning}`;
    card.appendChild(meta);card.appendChild(word);card.appendChild(meaning);
    if (item.selectedMeaning !== null) {
      const selected = document.createElement("p");
      selected.className = "review-selected";
      selected.textContent = `あなたの回答：${item.selectedMeaning}`;
      card.appendChild(selected);
    }
    list.appendChild(card);
  }
}

function startReviewRound() {
  if (!screens.result.classList.contains("active") || !state.reviewItems.length) return;
  // 記録を消す前に対象を確定。正解した単語を混ぜず、選択肢は毎回作り直す。
  const words = [...new Map(state.reviewItems.map(item => [item.word, item])).values()];
  const questions = shuffleArray(words).map(item => buildQuestion(item.word, item.meaning, item.category));
  startCountdown("review", questions);
}

function stopCameraIfNeeded() {
  window.poseController?.stopCamera?.();
}

document.getElementById("start-button").addEventListener("click", () => showScreen("difficulty"));
document.getElementById("retry-button").addEventListener("click", () => startCountdown());
document.getElementById("review-retry-button").addEventListener("click", startReviewRound);
document.getElementById("continue-camera-button").addEventListener("click", () => startCountdown());


window.addEventListener("pose-answer", event => {
  if (!screens.game.classList.contains("active")) return;
  const index = Number(event.detail?.index);
  if (Number.isInteger(index) && index >= 0 && index <= 3) {
    answer(index, `認識動作: ${event.detail.motion}`);
  }
});

window.addEventListener("pose-start-gesture", () => {
  if (screens.camera.classList.contains("active")) {
    startCountdown();
  }
});

document.getElementById("instructions-next")?.addEventListener("click", () => showScreen("camera"));

document.querySelectorAll(".difficulty").forEach(button => {
  button.addEventListener("click", () => {
    state.level = button.dataset.level;
    showScreen("instructions");
    document.getElementById("instructions-heading").focus();
  });
});

document.querySelectorAll('[data-action="back-title"]').forEach(button => {
  button.addEventListener("click", () => {
    clearInterval(state.timerId);
    clearInterval(state.countdownId);
    stopCameraIfNeeded();
    showScreen("title");
  });
});

document.querySelectorAll('[data-action="back-difficulty"]').forEach(button => {
  button.addEventListener("click", () => {
    stopCameraIfNeeded();
    showScreen("difficulty");
  });
});

window.addEventListener("keydown", event => {
  if (["1", "2", "3", "4"].includes(event.key)) {
    answer(Number(event.key) - 1);
  }
  if (event.key.toLowerCase() === "n") {
    skipQuestion();
  }
});

window.addEventListener("beforeunload", stopCameraIfNeeded);





