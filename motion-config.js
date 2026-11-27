// 仮設定。角度は度、距離は胴長または肩幅に対する比率、時間はms。
export const CONFIG = {
  jumpCount: 3, jumpSequenceGapMs: 2500, jumpLandingGraceMs: 600,
  visibility: 0.55, holdMs: 3000, neutralMs: 350,
  neutralTilt: 12, neutralKnee: 155, neutralWidth: 1.9,
  sideHoldMs: 3000, sideMaxFrameGapMs: 350,
  sideMinTilt: 12, sideMaxTilt: 65, sideKnee: 145, sideMaxWidth: 1.9,
  sideMaxHipDrop: .20, sideFootTolerance: .18, sideMinElbow: 115,
  sideWristRise: .30, sideOtherWristDown: -.05,
  sideArmVisibility: .45, sideBothHandsMargin: .10,
  neutralTorsoRatio: .92, neutralShoulderTolerance: .08,
  lungeWidth: 1.35, lungeWidthGain: 0.20, lungeBentKnee: 155, lungeStraightKnee: 145,
  lungeAsymmetry: 10, lungeMaxTilt: 30, lungeHipShift: 0.15,
  squatMaxWidthGain: 0.18, squatLateralHipShift: 0.10,
  squatMaxTilt: 18, squatMaxWidth: 1.85, squatAsymmetry: 20,
  squatKnee: 140, squatDrop: 0.16, squatDropMaxKnee: 152, squatMaxHipShift: 0.14,
  jumpFootRise: 0.20, jumpHipRise: 0.18, jumpShoulderRise: 0.12
};
