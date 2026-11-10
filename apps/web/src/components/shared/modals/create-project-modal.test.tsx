import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  blankDraft,
  draftErrors,
  draftFromTemplate,
} from "@/components/game-pipeline/template-draft";
import type { ProjectTemplate } from "@/fetchers/game-pipeline";
import CreateProjectModal from "./create-project-modal";

const STAGES = [
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

function makeTemplate(): ProjectTemplate {
  return {
    key: "game-production-pipeline",
    version: 1,
    name: "QUY TRÌNH SẢN XUẤT GAME",
    description:
      "Quản lý toàn bộ vòng đời game H5: săn xu hướng, duyệt ý tưởng, phát triển bản MVP, kiểm thử, phát hành thử, phân tích dữ liệu và mở rộng.",
    project: {
      name: "Game H5 — Quy trình sản xuất",
      description:
        "Quản lý sản xuất game H5 từ Idea đến Scale, có Gate Review, checklist và KPI cho từng giai đoạn.",
      icon: "Rocket",
    },
    updatedAt: null,
    config: {
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
      stages: STAGES.map((key) => ({
        key,
        name: `Stage ${key}`,
        emoji: "•",
        description: `Work in ${key}`,
        conditions: `Conditions for ${key}`,
        isFinal: key === "success" || key === "stopped",
        checklist: [{ key: `${key}-1`, label: `Item of ${key}` }],
        entry: { from: [], requiredFields: [], requireSourceChecklist: false },
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
      mvpBrief: { template: "## Mục tiêu MVP\n[...]", requiredSections: [] },
      kpis: [
        { key: "validPlayers", operator: "gte", target: 300 },
        { key: "play30sRate", operator: "gte", target: 60 },
        { key: "replayRate", operator: "gte", target: 20 },
        { key: "d1Retention", operator: "gte", target: 10 },
        { key: "criticalBugs", operator: "eq", target: 0 },
        { key: "adsEfficiency", operator: "ltvOverCac", target: 20 },
      ],
      labelGroups: [
        {
          key: "scope",
          name: "Phạm vi",
          labels: [{ name: "Bản MVP", color: "gray" }],
        },
      ],
    },
  };
}

let template = makeTemplate();
let canUpdateProjects = true;
const mutateAsync = vi.fn();
const createProjectArgs = vi.fn();

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/hooks/mutations/project/use-create-project", () => ({
  default: (request: unknown) => {
    createProjectArgs(request);
    return { mutateAsync: () => mutateAsync(request) };
  },
}));

vi.mock("@/hooks/queries/game-pipeline/use-game-pipeline", () => ({
  useGameTemplate: () => ({ data: template, isLoading: false }),
}));

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canUpdateProjects: () => canUpdateProjects,
  }),
}));

vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "ws-1", name: "Game HIHI" } }),
}));

vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({
    useGetActiveWorkspaceUsers: () => ({
      data: {
        members: [
          { userId: "user-1", user: { name: "Lan" } },
          { userId: "user-2", user: { name: "Minh" } },
        ],
      },
    }),
  }),
);

vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "user-1" } } }) },
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function lastRequest() {
  return createProjectArgs.mock.lastCall?.[0] as {
    name: string;
    description?: string;
    creationKey: string;
    template?: {
      key: string;
      version: number;
      config: ProjectTemplate["config"];
      includeSampleGame: boolean;
    };
  };
}

function useTemplateButton() {
  return screen.getAllByText("gamePipeline:templatePicker.useTemplate")[0];
}

beforeEach(() => {
  template = makeTemplate();
  canUpdateProjects = true;
  mutateAsync.mockResolvedValue({ id: "project-1" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("template drafts", () => {
  it("pre-fills every template default without inventing dates or people", () => {
    const draft = draftFromTemplate(template, {
      currentUserId: "user-1",
      canBeProducer: true,
      now: new Date("2026-11-09T18:30:00.000Z"),
    });
    expect(draft.name).toBe("Game H5 — Quy trình sản xuất");
    expect(draft.description).toContain("Gate Review");
    // 18:30 UTC is already the next day in Asia/Ho_Chi_Minh (UTC+7).
    expect(draft.template?.config.startDate).toBe("2026-11-10");
    expect(draft.template?.config.deadline).toBeNull();
    expect(draft.template?.config.defaults.producerId).toBe("user-1");
    expect(draft.template?.config.defaults.developerId).toBeNull();
    expect(draft.template?.config.defaults.qaId).toBeNull();
    expect(draft.template?.includeSampleGame).toBe(false);
    expect(draft.template?.config.stages).toHaveLength(12);
  });

  it("asks for a producer when the creator may not manage projects", () => {
    const draft = draftFromTemplate(template, {
      currentUserId: "user-1",
      canBeProducer: false,
    });
    expect(draft.template?.config.defaults.producerId).toBeNull();
    expect(draftErrors(draft)).toContain("producer");
  });

  it("copies the config so editing a draft never touches the template", () => {
    const draft = draftFromTemplate(template, {
      currentUserId: "user-1",
      canBeProducer: true,
    });
    draft.template?.config.stages[0]?.checklist.push({
      key: "trend-radar-x",
      label: "Extra",
    });
    expect(template.config.stages[0]?.checklist).toHaveLength(1);
    expect(blankDraft().template).toBeNull();
  });
});

describe("CreateProjectModal", () => {
  it("pre-fills the template and clears it when switching back to blank", async () => {
    render(<CreateProjectModal open onClose={vi.fn()} />, { wrapper });

    expect(
      screen.getByText("gamePipeline:templatePicker.title"),
    ).toBeInTheDocument();
    fireEvent.click(useTemplateButton());

    expect(
      screen.getByDisplayValue("Game H5 — Quy trình sản xuất"),
    ).toBeInTheDocument();
    expect(screen.getByText("gamePipeline:preview.title")).toBeInTheDocument();
    expect(lastRequest().template?.config.stages).toHaveLength(12);
    expect(lastRequest().template?.config.defaults.producerId).toBe("user-1");

    fireEvent.click(useTemplateButton());
    expect(
      screen.queryByDisplayValue("Game H5 — Quy trình sản xuất"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("gamePipeline:preview.title")).toBeNull();
    expect(lastRequest().template).toBeUndefined();
    expect(lastRequest().name).toBe("");
    expect(lastRequest().description).toBeUndefined();
  });

  it("sends edited values and reuses the creation key on retry", async () => {
    mutateAsync
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ id: "project-1" });
    const onClose = vi.fn();
    render(<CreateProjectModal open onClose={onClose} />, { wrapper });
    fireEvent.click(useTemplateButton());

    fireEvent.change(screen.getByLabelText("gamePipeline:form.wipLimit"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("gamePipeline:form.prefix"), {
      target: { value: "hh" },
    });
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const first = mutateAsync.mock.calls[0]?.[0];
    expect(first.template.config.wipLimitPerDeveloper).toBe(3);
    expect(first.template.config.gameCodePrefix).toBe("HH");

    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    const second = mutateAsync.mock.calls[1]?.[0];
    expect(second.creationKey).toBe(first.creationKey);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("blocks creation until a producer is picked", async () => {
    canUpdateProjects = false;
    render(<CreateProjectModal open onClose={vi.fn()} />, { wrapper });
    fireEvent.click(useTemplateButton());
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    expect(
      await screen.findByText("gamePipeline:form.producerRequired"),
    ).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("still creates a blank project without any template", async () => {
    render(<CreateProjectModal open onClose={vi.fn()} />, { wrapper });
    fireEvent.change(
      screen.getByPlaceholderText("common:modals.createProject.projectName"),
      { target: { value: "Website" } },
    );
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const request = mutateAsync.mock.calls[0]?.[0];
    expect(request.name).toBe("Website");
    expect(request.template).toBeUndefined();
    expect(request.creationKey).toEqual(expect.any(String));
  });
});
