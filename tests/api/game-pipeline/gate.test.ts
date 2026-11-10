import { describe, expect, it } from "vitest";
import { emptyCardData } from "../../../apps/api/src/game-pipeline/card";
import {
  builtInTemplateConfig,
  pipelineConfigSchema,
  STAGE_KEYS,
} from "../../../apps/api/src/game-pipeline/config";
import {
  computeTotalScore,
  evaluateGate,
  isFilled,
  kpiStatus,
  missingBriefSections,
} from "../../../apps/api/src/game-pipeline/gate";

const config = builtInTemplateConfig();
const noTask = { userId: null, dueDate: null };

function checkAll(stage: string) {
  const items = config.stages.find((s) => s.key === stage)?.checklist ?? [];
  return Object.fromEntries(
    items.map((item) => [item.key, { by: "u1", at: "2026-01-01" }]),
  );
}

describe("built-in GAME PRODUCTION PIPELINE template", () => {
  it("is a valid config with exactly the 12 stages in order", () => {
    expect(pipelineConfigSchema.safeParse(config).success).toBe(true);
    expect(config.stages.map((s) => s.key)).toEqual([...STAGE_KEYS]);
    expect(config.stages.map((s) => `${s.emoji} ${s.name}`)).toEqual([
      "🔥 Trend Radar",
      "💡 Idea Backlog",
      "🔍 Idea Validation",
      "✅ Approved",
      "🛠️ Development",
      "🧪 QA / Testing",
      "🚀 Soft Launch",
      "📊 Data Analysis",
      "🔧 Optimize",
      "📈 Scale",
      "🏆 Success",
      "🛑 Stopped",
    ]);
    for (const stage of config.stages) {
      expect(stage.description.length).toBeGreaterThan(0);
      expect(stage.conditions.length).toBeGreaterThan(0);
      expect(stage.checklist.length).toBeGreaterThan(0);
    }
  });

  it("ships the documented defaults and KPI thresholds", () => {
    expect(config.gameCodePrefix).toBe("H5");
    expect(config.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(config.wipLimitPerDeveloper).toBe(2);
    expect(Object.values(config.rules).every(Boolean)).toBe(true);
    expect(config.defaults.priority).toBe("medium");
    expect(config.defaults.platform).toBe("Web H5");
    expect(config.defaults.devices).toEqual(["mobile", "desktop"]);
    expect(config.deadline).toBeNull();
    expect(
      Object.fromEntries(
        config.kpis.map((k) => [k.key, [k.operator, k.target]]),
      ),
    ).toEqual({
      validPlayers: ["gte", 300],
      play30sRate: ["gte", 60],
      replayRate: ["gte", 20],
      d1Retention: ["gte", 10],
      criticalBugs: ["eq", 0],
      adsEfficiency: ["ltvOverCac", 20],
    });
    expect(config.labelGroups.map((g) => g.name)).toEqual([
      "Loại ý tưởng",
      "Thể loại",
      "Phạm vi",
      "Tình trạng",
    ]);
  });

  it("rejects a config with a stage removed or reordered", () => {
    const missing = { ...config, stages: config.stages.slice(1) };
    expect(pipelineConfigSchema.safeParse(missing).success).toBe(false);
    const swapped = {
      ...config,
      stages: [config.stages[1], config.stages[0], ...config.stages.slice(2)],
    };
    expect(pipelineConfigSchema.safeParse(swapped).success).toBe(false);
  });
});

describe("placeholders", () => {
  it("never counts bracketed guidance as content", () => {
    expect(isFilled("[Nhập nguồn trend]")).toBe(false);
    expect(isFilled("  [a] [b]  ")).toBe(false);
    expect(isFilled("TikTok #trend")).toBe(true);
    expect(isFilled("")).toBe(false);
    expect(isFilled(undefined)).toBe(false);
  });

  it("treats the untouched MVP brief scaffold as empty in every required section", () => {
    expect(missingBriefSections(config.mvpBrief.template, config)).toEqual(
      config.mvpBrief.requiredSections,
    );
  });

  it("only passes sections the writer actually filled", () => {
    const brief = config.mvpBrief.template
      .replace(
        "[Bản MVP cần chứng minh điều gì? Ví dụ: người chơi hiểu luật trong 10 giây và muốn chơi lại]",
        "Chứng minh người chơi chơi lại ít nhất 2 lần",
      )
      .replace("- PC: [Ví dụ: chuột trái hoặc phím Space]", "- PC: phím Space");
    expect(missingBriefSections(brief, config)).toEqual([
      "Gameplay cốt lõi",
      "Tính năng trong MVP",
      "Tracking",
    ]);
  });
});

describe("evaluation score", () => {
  it("stays unscored until every criterion has a score", () => {
    expect(computeTotalScore(config, {})).toBeNull();
    expect(
      computeTotalScore(config, {
        viralPotential: 5,
        marketFit: 5,
        gameplayAppeal: 5,
        productionCost: 1,
      }),
    ).toBeNull();
  });

  it("weights criteria and inverts cost and difficulty", () => {
    const best = {
      viralPotential: 5,
      marketFit: 5,
      gameplayAppeal: 5,
      productionCost: 1,
      technicalDifficulty: 1,
    };
    expect(computeTotalScore(config, best)).toBe(100);
    expect(
      computeTotalScore(config, {
        ...best,
        productionCost: 5,
        technicalDifficulty: 5,
      }),
    ).toBe(70);
  });
});

describe("KPI status", () => {
  it("reports no data until a result is entered", () => {
    const card = emptyCardData();
    expect(kpiStatus(config, card, "validPlayers")).toBe("noData");
  });

  it("uses a per-game target override over the project threshold", () => {
    const card = {
      ...emptyCardData(),
      kpi: { results: { validPlayers: { actual: 200, target: 150 } } },
    };
    expect(kpiStatus(config, card, "validPlayers")).toBe("met");
    card.kpi.results.validPlayers.target = null as unknown as number;
    expect(kpiStatus(config, card, "validPlayers")).toBe("notMet");
  });

  it("requires LTV above CAC plus the safety margin", () => {
    const card = {
      ...emptyCardData(),
      kpi: { results: { adsEfficiency: { ltv: 1.19, cac: 1 } } },
    };
    expect(kpiStatus(config, card, "adsEfficiency")).toBe("notMet");
    card.kpi.results.adsEfficiency.ltv = 1.25;
    expect(kpiStatus(config, card, "adsEfficiency")).toBe("met");
  });
});

describe("Gate Review", () => {
  it("lets new games enter only at Trend Radar", () => {
    const card = emptyCardData();
    expect(
      evaluateGate({
        config,
        card,
        task: noTask,
        fromKey: null,
        toKey: "trend-radar",
      }),
    ).toEqual([]);
    expect(
      evaluateGate({
        config,
        card,
        task: noTask,
        fromKey: null,
        toKey: "scale",
      }),
    ).toEqual([{ code: "notAllowedFrom", from: null }]);
  });

  it("blocks skipping stages and allows rework and stopping", () => {
    const card = emptyCardData();
    expect(
      evaluateGate({
        config,
        card,
        task: noTask,
        fromKey: "trend-radar",
        toKey: "development",
      })[0],
    ).toEqual({ code: "notAllowedFrom", from: "trend-radar" });
    expect(
      evaluateGate({
        config,
        card,
        task: noTask,
        fromKey: "qa-testing",
        toKey: "development",
      }),
    ).toEqual([]);
    expect(
      evaluateGate({
        config,
        card,
        task: noTask,
        fromKey: "idea-backlog",
        toKey: "stopped",
      }),
    ).toEqual([]);
  });

  it("requires the source checklist and fields, ignoring placeholders", () => {
    const card = {
      ...emptyCardData(),
      details: {
        trendSourceUrl: "https://tiktok.com/@x/video/1",
        trendEvidence: "[Dán ảnh chụp màn hình]",
        targetMarket: "Việt Nam",
      },
    };
    const failures = evaluateGate({
      config,
      card,
      task: noTask,
      fromKey: "trend-radar",
      toKey: "idea-backlog",
    });
    expect(failures).toEqual([
      { code: "checklistIncomplete", stage: "trend-radar", remaining: 3 },
      { code: "missingField", field: "trendEvidence" },
    ]);

    card.details.trendEvidence = "Video 2 triệu view trong 3 ngày";
    card.checklist = { "trend-radar": checkAll("trend-radar") };
    expect(
      evaluateGate({
        config,
        card,
        task: noTask,
        fromKey: "trend-radar",
        toKey: "idea-backlog",
      }),
    ).toEqual([]);
  });

  it("does not let the MVP brief scaffold pass the Development gate", () => {
    const card = {
      ...emptyCardData(),
      producerId: "p",
      qaId: "q",
      details: { mvpBrief: config.mvpBrief.template },
      checklist: { approved: checkAll("approved") },
      approvals: { development: { by: "p", at: "2026-01-01" } },
    };
    const failures = evaluateGate({
      config,
      card,
      task: { userId: "dev", dueDate: "2026-12-01" },
      fromKey: "approved",
      toKey: "development",
    });
    expect(failures).toEqual([
      {
        code: "briefIncomplete",
        sections: config.mvpBrief.requiredSections,
      },
    ]);
  });

  it("requires an explicit approval and enforces the WIP limit", () => {
    const filledBrief = config.mvpBrief.requiredSections
      .map((section) => `## ${section}\nNội dung thật cho ${section}`)
      .join("\n\n");
    const card = {
      ...emptyCardData(),
      producerId: "p",
      qaId: "q",
      details: { mvpBrief: filledBrief },
      checklist: { approved: checkAll("approved") },
    };
    const task = { userId: "dev", dueDate: "2026-12-01" };
    expect(
      evaluateGate({
        config,
        card,
        task,
        fromKey: "approved",
        toKey: "development",
        wipCount: 2,
      }),
    ).toEqual([
      { code: "approvalRequired", gate: "development" },
      { code: "wipLimitReached", limit: 2, current: 2 },
    ]);
    const approved = {
      ...card,
      approvals: { development: { by: "p", at: "2026-01-01" } },
    };
    expect(
      evaluateGate({
        config,
        card: approved,
        task,
        fromKey: "approved",
        toKey: "development",
        wipCount: 1,
      }),
    ).toEqual([]);
    const noApprovalRule = {
      ...config,
      rules: { ...config.rules, requireDevelopmentApproval: false },
    };
    expect(
      evaluateGate({
        config: noApprovalRule,
        card,
        task,
        fromKey: "approved",
        toKey: "development",
        wipCount: 0,
      }),
    ).toEqual([]);
  });

  it("never approves Scale just because every KPI is met", () => {
    const card = {
      ...emptyCardData(),
      checklist: { "data-analysis": checkAll("data-analysis") },
      kpi: {
        producerDecision: "scale" as const,
        results: {
          validPlayers: { actual: 500 },
          play30sRate: { actual: 70 },
          replayRate: { actual: 30 },
          d1Retention: { actual: 15 },
          criticalBugs: { actual: 0 },
          adsEfficiency: { ltv: 2, cac: 1 },
        },
      },
    };
    expect(
      evaluateGate({
        config,
        card,
        task: noTask,
        fromKey: "data-analysis",
        toKey: "scale",
      }),
    ).toEqual([{ code: "approvalRequired", gate: "scale" }]);
  });

  it("requires evaluation scores and an approved decision for Approved", () => {
    const card = {
      ...emptyCardData(),
      checklist: { "idea-validation": checkAll("idea-validation") },
      evaluation: {
        scores: { viralPotential: 4 },
        decision: "revise" as const,
      },
    };
    expect(
      evaluateGate({
        config,
        card,
        task: noTask,
        fromKey: "idea-validation",
        toKey: "approved",
      }),
    ).toEqual([
      { code: "evaluationIncomplete" },
      { code: "evaluationNotApproved" },
    ]);
  });
});
