const LEVELS = [
  { min: 30, label: "站友" },
  { min: 10, label: "常驻" },
  { min: 3, label: "熟客" },
  { min: 0, label: "访客" },
];

export function levelForApprovedCount(approvedCount: number) {
  const level = LEVELS.find((item) => approvedCount >= item.min) || LEVELS.at(-1)!;
  return {
    label: level.label,
    score: approvedCount,
  };
}
