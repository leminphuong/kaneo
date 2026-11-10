import { z } from "../openapi";

export const GAME_PIPELINE_TEMPLATE_KEY = "game-production-pipeline";
export const BUILT_IN_TEMPLATE_VERSION = 1;

export const STAGE_KEYS = [
  "trend-radar",
  "idea-backlog",
  "idea-validation",
  "approved",
  "development",
  "qa-testing",
  "soft-launch",
  "data-analysis",
  "optimize",
  "scale",
  "success",
  "stopped",
] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

// Free-text details stored on a game card. URLs are validated separately.
export const TEXT_DETAIL_KEYS = [
  "targetMarket",
  "platform",
  "trendEvidence",
  "audience",
  "gameplayIdea",
  "coreLoop",
  "winCondition",
  "loseCondition",
  "hook",
  "mvpBrief",
] as const;
export const URL_DETAIL_KEYS = [
  "trendSourceUrl",
  "repositoryUrl",
  "buildUrl",
  "releaseUrl",
  "designDocUrl",
  "assetsUrl",
  "analyticsUrl",
  "qaReportUrl",
] as const;
export const DEVICE_KEYS = ["mobile", "desktop"] as const;

export const EVALUATION_CRITERIA = [
  "viralPotential",
  "marketFit",
  "gameplayAppeal",
  "productionCost",
  "technicalDifficulty",
] as const;
export const EVALUATION_DECISIONS = ["approved", "revise", "rejected"] as const;

export const KPI_KEYS = [
  "validPlayers",
  "play30sRate",
  "replayRate",
  "d1Retention",
  "criticalBugs",
  "adsEfficiency",
] as const;
export const PRODUCER_DECISIONS = [
  "scale",
  "optimize",
  "retest",
  "stop",
] as const;

export const APPROVAL_GATES = ["development", "scale"] as const;
export type ApprovalGate = (typeof APPROVAL_GATES)[number];

// Fields a stage can require on entry. `developerId` is the task assignee and
// `dueDate` the task due date: a game reuses the task's own fields.
export const REQUIRABLE_FIELDS = [
  ...TEXT_DETAIL_KEYS,
  ...URL_DETAIL_KEYS,
  "producerId",
  "developerId",
  "qaId",
  "dueDate",
  "kpiDataSource",
  "kpiMeasurementWindow",
  "kpiSampleSize",
  "producerDecision",
] as const;
export type RequirableField = (typeof REQUIRABLE_FIELDS)[number];

const LABEL_COLORS = [
  "gray",
  "dark-gray",
  "purple",
  "teal",
  "green",
  "yellow",
  "orange",
  "pink",
  "red",
] as const;

const shortText = z.string().trim().min(1).max(120);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const itemKey = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "Use lowercase letters, digits and -");

const checklistItemSchema = z.object({ key: itemKey, label: shortText });

const stageSchema = z.object({
  key: z.enum(STAGE_KEYS),
  name: shortText,
  emoji: z.string().max(16),
  description: z.string().max(2000),
  conditions: z.string().max(2000).openapi({
    description: "Human-readable transition conditions shown to the team.",
  }),
  isFinal: z.boolean(),
  // Set by the server when the project's columns are created.
  columnId: z.string().nullable().optional(),
  checklist: z.array(checklistItemSchema).max(30),
  entry: z.object({
    from: z.array(z.enum(STAGE_KEYS)).openapi({
      description:
        "Stages a game may move forward from. Backward moves (rework) and moves to Stopped are always allowed.",
    }),
    requiredFields: z.array(z.enum(REQUIRABLE_FIELDS)),
    requireSourceChecklist: z.boolean(),
    requireEvaluation: z.boolean().optional(),
    requireApproval: z.enum(APPROVAL_GATES).optional(),
    requireKpiResults: z.boolean().optional(),
    requireNoCriticalBugs: z.boolean().optional(),
    enforceWip: z.boolean().optional(),
  }),
});

const userIdOrNull = z.string().min(1).nullable();

export const pipelineConfigSchema = z
  .object({
    gameCodePrefix: z
      .string()
      .regex(/^[A-Z0-9]{1,10}$/, "1-10 uppercase letters or digits"),
    timezone: z
      .string()
      .min(1)
      .max(64)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Unknown time zone"),
    view: z.enum(["kanban", "list"]),
    startDate: isoDate,
    deadline: isoDate.nullable(),
    wipLimitPerDeveloper: z.number().int().min(1).max(50),
    rules: z.object({
      requireDevelopmentApproval: z.boolean(),
      requireScaleApproval: z.boolean(),
      stageChecklists: z.boolean(),
      kpiTracking: z.boolean(),
      changeHistory: z.boolean(),
    }),
    defaults: z.object({
      producerId: userIdOrNull,
      developerId: userIdOrNull,
      qaId: userIdOrNull,
      priority: z.enum(["no-priority", "low", "medium", "high", "urgent"]),
      platform: z.string().max(120),
      devices: z.array(z.enum(DEVICE_KEYS)),
      targetMarket: z.string().max(120),
    }),
    stages: z.array(stageSchema).length(STAGE_KEYS.length),
    evaluation: z.object({
      scaleMax: z.number().int().min(2).max(10),
      passThreshold: z.number().min(0).max(100),
      criteria: z
        .array(
          z.object({
            key: z.enum(EVALUATION_CRITERIA),
            weight: z.number().min(0).max(100),
            inverse: z.boolean().openapi({
              description: "A low score is better (cost, difficulty).",
            }),
          }),
        )
        .length(EVALUATION_CRITERIA.length),
    }),
    mvpBrief: z.object({
      template: z.string().max(10000),
      requiredSections: z.array(shortText).max(20),
    }),
    kpis: z
      .array(
        z.object({
          key: z.enum(KPI_KEYS),
          operator: z.enum(["gte", "lte", "eq", "ltvOverCac"]),
          target: z.number().min(0).max(1_000_000_000),
        }),
      )
      .length(KPI_KEYS.length),
    labelGroups: z
      .array(
        z.object({
          key: itemKey,
          name: shortText,
          labels: z
            .array(z.object({ name: shortText, color: z.enum(LABEL_COLORS) }))
            .max(30),
        }),
      )
      .max(10),
  })
  .superRefine((config, ctx) => {
    config.stages.forEach((stage, index) => {
      if (stage.key !== STAGE_KEYS[index]) {
        ctx.addIssue({
          code: "custom",
          path: ["stages", index, "key"],
          message: `Stage ${index + 1} must be ${STAGE_KEYS[index]}`,
        });
      }
      const keys = new Set<string>();
      for (const item of stage.checklist) {
        if (keys.has(item.key)) {
          ctx.addIssue({
            code: "custom",
            path: ["stages", index, "checklist"],
            message: `Duplicate checklist key ${item.key}`,
          });
        }
        keys.add(item.key);
      }
    });
    const criteria = new Set(config.evaluation.criteria.map((c) => c.key));
    if (criteria.size !== EVALUATION_CRITERIA.length) {
      ctx.addIssue({
        code: "custom",
        path: ["evaluation", "criteria"],
        message: "Each criterion must appear once",
      });
    }
    if (config.evaluation.criteria.every((c) => c.weight === 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["evaluation", "criteria"],
        message: "At least one criterion needs a weight",
      });
    }
    const kpis = new Set(config.kpis.map((k) => k.key));
    if (kpis.size !== KPI_KEYS.length) {
      ctx.addIssue({
        code: "custom",
        path: ["kpis"],
        message: "Each KPI must appear once",
      });
    }
    if (config.deadline && config.deadline < config.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["deadline"],
        message: "Deadline must not be before the start date",
      });
    }
  })
  .openapi("GamePipelineConfig");

export type PipelineConfig = z.infer<typeof pipelineConfigSchema>;
export type PipelineStage = PipelineConfig["stages"][number];

const MVP_BRIEF_TEMPLATE = `## Mục tiêu MVP
[Bản MVP cần chứng minh điều gì? Ví dụ: người chơi hiểu luật trong 10 giây và muốn chơi lại]

## Lối chơi cốt lõi
[Vòng lặp chơi chính: người chơi làm gì, nhận được gì, vì sao chơi tiếp]

## Tính năng trong MVP
- [Tính năng bắt buộc để bản MVP chơi được]

## Tính năng để sau
- [Tính năng hay nhưng chưa cần cho bản thử nghiệm]

## Điều khiển và thiết bị
- Máy tính: [Ví dụ: chuột trái hoặc phím Space]
- Điện thoại: [Ví dụ: chạm hoặc vuốt]
[Xác định điều khiển phù hợp lối chơi trên cả máy tính và điện thoại]

## Theo dõi sự kiện
- game_start: [Thời điểm bắn sự kiện]
- game_end: [Thời điểm bắn sự kiện, kèm điểm số và thời gian chơi]
- replay: [Thời điểm bắn sự kiện khi người chơi chơi lại]

## Tiêu chí nghiệm thu
- Bản MVP chơi được
- Sự kiện theo dõi đã được kiểm tra
- Kiểm thử đạt và không còn lỗi nghiêm trọng
`;

type StageSeed = Omit<PipelineStage, "columnId" | "checklist"> & {
  checklist: string[];
};

function slugItem(stage: string, index: number) {
  return `${stage}-${index + 1}`;
}

const STAGE_SEEDS: StageSeed[] = [
  {
    key: "trend-radar",
    name: "Săn xu hướng",
    emoji: "🔥",
    isFinal: false,
    description:
      "Theo dõi meme, xu hướng mạng xã hội và chủ đề nóng có thể trở thành game H5. Ghi lại nguồn, bằng chứng và thời điểm phát hiện.",
    conditions:
      "Mọi game mới bắt đầu ở đây. Chuyển sang Kho ý tưởng khi đã có nguồn xu hướng, bằng chứng, thị trường mục tiêu và hoàn thành danh mục kiểm tra.",
    checklist: [
      "Có nguồn xu hướng",
      "Có bằng chứng",
      "Ghi thị trường và thời điểm phát hiện",
    ],
    entry: { from: [], requiredFields: [], requireSourceChecklist: false },
  },
  {
    key: "idea-backlog",
    name: "Kho ý tưởng",
    emoji: "💡",
    isFinal: false,
    description:
      "Biến xu hướng thành ý tưởng game: mô tả lối chơi, người chơi mục tiêu, điều kiện thắng và thua.",
    conditions:
      "Vào từ Săn xu hướng khi có nguồn xu hướng, bằng chứng và thị trường mục tiêu. Rời khỏi khi đã mô tả lối chơi, người chơi, vòng lặp cốt lõi, thắng/thua.",
    checklist: [
      "Mô tả lối chơi",
      "Xác định người chơi",
      "Mô tả điều kiện thắng/thua",
    ],
    entry: {
      from: ["trend-radar"],
      requiredFields: ["trendSourceUrl", "trendEvidence", "targetMarket"],
      requireSourceChecklist: true,
    },
  },
  {
    key: "idea-validation",
    name: "Thẩm định ý tưởng",
    emoji: "🔍",
    isFinal: false,
    description:
      "Kiểm duyệt ý tưởng: chấm điểm khả năng lan truyền, thị trường, lối chơi, chi phí và độ khó; Nhà sản xuất ra quyết định.",
    conditions:
      "Vào từ Kho ý tưởng khi lối chơi, người chơi, vòng lặp cốt lõi và thắng/thua đã được mô tả. Chỉ sang Đã duyệt khi đã chấm đủ điểm và quyết định là Duyệt.",
    checklist: [
      "Chấm điểm ý tưởng",
      "Đánh giá chi phí và độ khó",
      "Ghi kết luận",
    ],
    entry: {
      from: ["idea-backlog"],
      requiredFields: [
        "gameplayIdea",
        "audience",
        "coreLoop",
        "winCondition",
        "loseCondition",
      ],
      requireSourceChecklist: true,
    },
  },
  {
    key: "approved",
    name: "Đã duyệt",
    emoji: "✅",
    isFinal: false,
    description:
      "Ý tưởng đã qua kiểm duyệt. Hoàn thiện bản mô tả MVP, phân công nhân sự và chốt hạn chót trước khi phát triển.",
    conditions:
      "Vào từ Thẩm định ý tưởng khi đã chấm đủ điểm và Nhà sản xuất quyết định Duyệt. Sang Phát triển cần bản mô tả MVP hoàn chỉnh, Lập trình viên, Kiểm thử viên, hạn chót và Nhà sản xuất duyệt.",
    checklist: [
      "Hoàn thiện bản mô tả MVP",
      "Phân công nhân sự",
      "Chốt hạn chót",
      "Nhà sản xuất duyệt",
    ],
    entry: {
      from: ["idea-validation"],
      requiredFields: [],
      requireSourceChecklist: true,
      requireEvaluation: true,
    },
  },
  {
    key: "development",
    name: "Phát triển",
    emoji: "🛠️",
    isFinal: false,
    description:
      "Phát triển bản MVP chơi được trên điện thoại và máy tính, tích hợp theo dõi sự kiện và xuất bản dựng.",
    conditions:
      "Vào từ Đã duyệt khi bản mô tả MVP hoàn chỉnh, có Nhà sản xuất, Lập trình viên, Kiểm thử viên, hạn chót, Nhà sản xuất đã duyệt và Lập trình viên chưa vượt giới hạn game đang làm.",
    checklist: [
      "Lối chơi chơi được",
      "Giao diện dùng được",
      "Tích hợp theo dõi sự kiện",
      "Có bản dựng",
    ],
    entry: {
      from: ["approved"],
      requiredFields: [
        "mvpBrief",
        "producerId",
        "developerId",
        "qaId",
        "dueDate",
      ],
      requireSourceChecklist: true,
      requireApproval: "development",
      enforceWip: true,
    },
  },
  {
    key: "qa-testing",
    name: "Kiểm thử",
    emoji: "🧪",
    isFinal: false,
    description:
      "Kiểm thử trên điện thoại và máy tính, kiểm tra hiệu năng, xác minh theo dõi sự kiện và xử lý lỗi nghiêm trọng.",
    conditions:
      "Vào từ Phát triển khi có kho mã nguồn và URL bản dựng/thử nghiệm. Sang Phát hành thử cần báo cáo kiểm thử và 0 lỗi nghiêm trọng.",
    checklist: [
      "Kiểm thử trên điện thoại",
      "Kiểm thử trên máy tính",
      "Kiểm tra hiệu năng",
      "Xác minh theo dõi sự kiện",
      "Xử lý lỗi nghiêm trọng",
    ],
    entry: {
      from: ["development"],
      requiredFields: ["repositoryUrl", "buildUrl"],
      requireSourceChecklist: true,
    },
  },
  {
    key: "soft-launch",
    name: "Phát hành thử",
    emoji: "🚀",
    isFinal: false,
    description:
      "Phát hành thử nghiệm với lưu lượng truy cập nhỏ để thu dữ liệu người chơi thật.",
    conditions:
      "Vào từ Kiểm thử khi có báo cáo kiểm thử và số lỗi nghiêm trọng đang mở là 0.",
    checklist: [
      "Có URL thử nghiệm",
      "Ghi nguồn lưu lượng truy cập",
      "Xác định thời gian thử nghiệm",
      "Kiểm tra dữ liệu thu về",
    ],
    entry: {
      from: ["qa-testing"],
      requiredFields: ["qaReportUrl"],
      requireSourceChecklist: true,
      requireNoCriticalBugs: true,
    },
  },
  {
    key: "data-analysis",
    name: "Phân tích dữ liệu",
    emoji: "📊",
    isFinal: false,
    description:
      "Phân tích chất lượng mẫu, mức độ tương tác, tỉ lệ chơi lại và giữ chân D1 so với ngưỡng KPI; Nhà sản xuất ghi quyết định.",
    conditions:
      "Vào từ Phát hành thử hoặc Tối ưu khi có URL phát hành, nguồn dữ liệu và khoảng thời gian đo.",
    checklist: [
      "Kiểm tra chất lượng mẫu",
      "Phân tích tương tác, chơi lại và giữ chân D1",
      "Ghi quyết định",
    ],
    entry: {
      from: ["soft-launch", "optimize"],
      requiredFields: ["releaseUrl", "kpiDataSource", "kpiMeasurementWindow"],
      requireSourceChecklist: true,
    },
  },
  {
    key: "optimize",
    name: "Tối ưu",
    emoji: "🔧",
    isFinal: false,
    description:
      "Tối ưu dựa trên dữ liệu: xác định vấn đề, viết giả thuyết, thay đổi, kiểm thử lại và so sánh kết quả.",
    conditions:
      "Vào từ Phân tích dữ liệu khi Nhà sản xuất đã ghi quyết định. Sau khi tối ưu, quay lại Phát hành thử hoặc Phân tích dữ liệu để đo lại.",
    checklist: [
      "Xác định vấn đề",
      "Viết giả thuyết",
      "Triển khai thay đổi",
      "Kiểm thử lại",
      "So sánh kết quả",
    ],
    entry: {
      from: ["data-analysis"],
      requiredFields: ["producerDecision"],
      requireSourceChecklist: true,
    },
  },
  {
    key: "scale",
    name: "Mở rộng",
    emoji: "📈",
    isFinal: false,
    description:
      "Mở rộng lưu lượng truy cập theo từng đợt, có kế hoạch kênh, ngân sách và điều kiện dừng.",
    conditions:
      "Vào từ Phân tích dữ liệu hoặc Tối ưu khi đã nhập đủ kết quả KPI, Nhà sản xuất ghi quyết định và duyệt Mở rộng. Đạt KPI không tự động duyệt Mở rộng.",
    checklist: [
      "Có kế hoạch kênh và ngân sách",
      "Có điều kiện dừng",
      "Nhà sản xuất duyệt",
      "Đánh giá từng đợt",
    ],
    entry: {
      from: ["data-analysis", "optimize"],
      requiredFields: ["producerDecision"],
      requireSourceChecklist: true,
      requireKpiResults: true,
      requireApproval: "scale",
    },
  },
  {
    key: "success",
    name: "Thành công",
    emoji: "🏆",
    isFinal: true,
    description:
      "Game đạt mục tiêu sau giai đoạn Mở rộng. Tổng kết KPI và bài học.",
    conditions:
      "Vào từ Mở rộng khi danh mục kiểm tra của Mở rộng đã hoàn thành.",
    checklist: ["Xác minh kết quả", "Tổng kết KPI", "Ghi bài học"],
    entry: {
      from: ["scale"],
      requiredFields: [],
      requireSourceChecklist: true,
    },
  },
  {
    key: "stopped",
    name: "Đã dừng",
    emoji: "🛑",
    isFinal: true,
    description:
      "Game dừng ở bất kỳ giai đoạn nào. Ghi lý do, người quyết định và hoàn thành buổi rút kinh nghiệm.",
    conditions:
      "Có thể chuyển vào từ mọi giai đoạn. Hoàn thành danh mục kiểm tra để lưu lại bài học.",
    checklist: [
      "Ghi lý do dừng",
      "Ghi người quyết định",
      "Hoàn thành buổi rút kinh nghiệm",
    ],
    entry: { from: [], requiredFields: [], requireSourceChecklist: false },
  },
];

// Version 1 of the template as shipped. Dates and people are filled per
// project at creation, so they stay neutral here.
export function builtInTemplateConfig(): PipelineConfig {
  return {
    gameCodePrefix: "H5",
    timezone: "Asia/Ho_Chi_Minh",
    view: "kanban",
    startDate: "2000-01-01",
    deadline: null,
    wipLimitPerDeveloper: 2,
    rules: {
      requireDevelopmentApproval: true,
      requireScaleApproval: true,
      stageChecklists: true,
      kpiTracking: true,
      changeHistory: true,
    },
    defaults: {
      producerId: null,
      developerId: null,
      qaId: null,
      priority: "medium",
      platform: "Web H5",
      devices: ["mobile", "desktop"],
      targetMarket: "",
    },
    stages: STAGE_SEEDS.map((seed) => ({
      ...seed,
      checklist: seed.checklist.map((label, index) => ({
        key: slugItem(seed.key, index),
        label,
      })),
    })),
    evaluation: {
      scaleMax: 5,
      passThreshold: 70,
      criteria: [
        { key: "viralPotential", weight: 25, inverse: false },
        { key: "marketFit", weight: 20, inverse: false },
        { key: "gameplayAppeal", weight: 25, inverse: false },
        { key: "productionCost", weight: 15, inverse: true },
        { key: "technicalDifficulty", weight: 15, inverse: true },
      ],
    },
    mvpBrief: {
      template: MVP_BRIEF_TEMPLATE,
      requiredSections: [
        "Mục tiêu MVP",
        "Lối chơi cốt lõi",
        "Tính năng trong MVP",
        "Điều khiển và thiết bị",
        "Theo dõi sự kiện",
      ],
    },
    kpis: [
      { key: "validPlayers", operator: "gte", target: 300 },
      { key: "play30sRate", operator: "gte", target: 60 },
      { key: "replayRate", operator: "gte", target: 20 },
      { key: "d1Retention", operator: "gte", target: 10 },
      { key: "criticalBugs", operator: "eq", target: 0 },
      // Target is the safety margin in percent: LTV must exceed CAC * (1 + m).
      { key: "adsEfficiency", operator: "ltvOverCac", target: 20 },
    ],
    labelGroups: [
      {
        key: "idea-type",
        name: "Loại ý tưởng",
        labels: [
          { name: "Meme", color: "pink" },
          { name: "Nhảm vui (brainrot)", color: "purple" },
          { name: "Văn hóa Việt", color: "red" },
          { name: "Ý tưởng gốc", color: "teal" },
        ],
      },
      {
        key: "genre",
        name: "Thể loại",
        labels: [
          { name: "Giải trí nhẹ", color: "green" },
          { name: "Giải đố", color: "yellow" },
          { name: "Hành động", color: "orange" },
          { name: "Mô phỏng", color: "dark-gray" },
          { name: "Nhiều người chơi", color: "purple" },
        ],
      },
      {
        key: "scope",
        name: "Phạm vi",
        labels: [{ name: "Bản MVP", color: "gray" }],
      },
      {
        key: "status",
        name: "Tình trạng",
        labels: [
          { name: "Cần duyệt", color: "yellow" },
          { name: "Bị chặn", color: "red" },
          { name: "Cần dữ liệu", color: "teal" },
          { name: "Cần tối ưu", color: "orange" },
        ],
      },
    ],
  };
}

export const BUILT_IN_TEMPLATE = {
  key: GAME_PIPELINE_TEMPLATE_KEY,
  version: BUILT_IN_TEMPLATE_VERSION,
  name: "QUY TRÌNH SẢN XUẤT GAME",
  description:
    "Quản lý toàn bộ vòng đời game H5: săn xu hướng, duyệt ý tưởng, phát triển bản MVP, kiểm thử, phát hành thử, phân tích dữ liệu và mở rộng.",
  project: {
    name: "Game H5 — Quy trình sản xuất",
    description:
      "Quản lý sản xuất game H5 từ ý tưởng đến mở rộng, có kiểm duyệt, danh mục kiểm tra và KPI cho từng giai đoạn.",
    icon: "Rocket",
  },
} as const;
