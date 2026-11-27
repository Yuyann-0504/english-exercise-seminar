const QUESTION_BANK = {
  beginner: [
    ["apple","りんご","名詞"],["book","本","名詞"],["dog","犬","名詞"],["cat","猫","名詞"],["school","学校","名詞"],
    ["friend","友達","名詞"],["water","水","名詞"],["music","音楽","名詞"],["family","家族","名詞"],["morning","朝","名詞"],
    ["run","走る","動詞"],["eat","食べる","動詞"],["drink","飲む","動詞"],["study","勉強する","動詞"],["play","遊ぶ","動詞"],
    ["happy","うれしい","形容詞"],["big","大きい","形容詞"],["small","小さい","形容詞"],["good","良い","形容詞"],["new","新しい","形容詞"]
  ],
  intermediate: [
    ["library","図書館","名詞"],["hospital","病院","名詞"],["station","駅","名詞"],["country","国","名詞"],["future","未来","名詞"],
    ["answer","答え","名詞"],["question","質問","名詞"],["language","言語","名詞"],["weather","天気","名詞"],["vacation","休暇","名詞"],
    ["arrive","到着する","動詞"],["choose","選ぶ","動詞"],["practice","練習する","動詞"],["remember","覚えている","動詞"],["finish","終える","動詞"],
    ["famous","有名な","形容詞"],["important","重要な","形容詞"],["different","異なる","形容詞"],["careful","注意深い","形容詞"],["popular","人気のある","形容詞"]
  ],
  advanced: [
    ["environment","環境","名詞"],["experience","経験","名詞"],["information","情報","名詞"],["culture","文化","名詞"],["technology","技術","名詞"],
    ["opportunity","機会","名詞"],["community","地域社会","名詞"],["relationship","関係","名詞"],["decision","決定","名詞"],["education","教育","名詞"],
    ["improve","改善する","動詞"],["continue","続ける","動詞"],["develop","発展させる","動詞"],["explain","説明する","動詞"],["compare","比較する","動詞"],
    ["necessary","必要な","形容詞"],["possible","可能な","形容詞"],["traditional","伝統的な","形容詞"],["successful","成功した","形容詞"],["international","国際的な","形容詞"]
  ],
  eiken2: [
    ["poverty","貧困","名詞"],
    ["emergency","緊急事態","名詞"],
    ["evidence","証拠","名詞"],
    ["advantage","利点","名詞"],
    ["reduce","減らす","動詞"],
    ["require","必要とする","動詞"],
    ["contribute","貢献する","動詞"],
    ["independent","独立した","形容詞"],
    ["effective","効果的な","形容詞"],
    ["flexible","柔軟な","形容詞"]
  ],
  eikenPre1: [
    ["allegation","裏付けが示されていない申し立て","名詞"],
    ["consensus","意見の一致","名詞"],
    ["incentive","動機づけとなるもの","名詞"],
    ["livelihood","生計","名詞"],
    ["allocate","割り当てる","動詞"],
    ["bolster","強化する","動詞"],
    ["reconcile","和解させる","動詞"],
    ["detrimental","悪影響を及ぼす","形容詞"],
    ["feasible","実行可能な","形容詞"],
    ["imminent","差し迫った","形容詞"]
  ]
};

const WORD_BY_MEANING = new Map(Object.values(QUESTION_BANK).flat().map(([word, meaning]) => [meaning, word]));

// 従来の難易度の誤答候補は、従来の語彙に限定する。
const ALL_MEANINGS = [...new Set(
  [QUESTION_BANK.beginner, QUESTION_BANK.intermediate, QUESTION_BANK.advanced]
    .flat().map(item => item[1])
)];

function shuffleArray(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildQuestion(word, correctMeaning, category) {
  // 復習時も、単語から元の級を特定して同じ範囲の選択肢を作る。
  const examBank = [QUESTION_BANK.eiken2, QUESTION_BANK.eikenPre1].find(
    bank => bank.some(([entryWord]) => entryWord === word)
  );
  const available = examBank
    ? examBank.filter(item => item[1] !== correctMeaning)
    : null;
  const distractors = available
    ? [
        ...shuffleArray(available.filter(item => item[2] === category)),
        ...shuffleArray(available.filter(item => item[2] !== category))
      ].slice(0, 3).map(item => item[1])
    : shuffleArray(ALL_MEANINGS.filter(meaning => meaning !== correctMeaning)).slice(0, 3);

  const choices = shuffleArray([
    { text: correctMeaning, word, correct: true },
    ...distractors.map(text => ({ text, word: WORD_BY_MEANING.get(text), correct: false }))
  ]);

  return {
    word,
    category,
    choices,
    answerIndex: choices.findIndex(c => c.correct)
  };
}

function getQuestions(level, count = 10) {
  return shuffleArray(QUESTION_BANK[level])
    .slice(0, count)
    .map(([word, meaning, category]) => buildQuestion(word, meaning, category));
}
