import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import {
  builtInTemplateConfig,
  GAME_PIPELINE_TEMPLATE_KEY,
  type PipelineConfig,
} from "../../apps/api/src/game-pipeline/config";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
  type SeededMemberContext,
} from "./helpers/fixtures";

type App = ReturnType<typeof createApp>["app"];

async function call(app: App, method: string, path: string, body?: unknown) {
  const response = await app.request(`/api${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  return { status: response.status, body: json as any, text };
}

function projectConfig(producerId: string, edit?: (c: PipelineConfig) => void) {
  const config = builtInTemplateConfig();
  config.startDate = "2026-11-10";
  config.defaults.producerId = producerId;
  edit?.(config);
  return config;
}

async function addMember(
  workspaceId: string,
  role = "member",
): Promise<typeof schema.userTable.$inferSelect> {
  const id = `user-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({ id, email: `${id}@example.com`, emailVerified: true, name: id })
    .returning();
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user.id,
    role,
    joinedAt: new Date(),
  });
  return user;
}

async function createPipelineProject(
  app: App,
  ctx: SeededMemberContext,
  options: {
    creationKey?: string;
    config?: PipelineConfig;
    includeSampleGame?: boolean;
  } = {},
) {
  return call(app, "POST", "/project", {
    workspaceId: ctx.workspace.id,
    name: "Game H5 — Production Pipeline",
    icon: "Rocket",
    slug: "GAME",
    description: "Quản lý sản xuất game H5 từ Idea đến Scale.",
    creationKey: options.creationKey,
    template: {
      key: GAME_PIPELINE_TEMPLATE_KEY,
      version: 1,
      config: options.config ?? projectConfig(ctx.user.id),
      includeSampleGame: options.includeSampleGame ?? false,
    },
  });
}

async function checkAll(app: App, taskId: string, stage: string) {
  const config = builtInTemplateConfig();
  for (const item of config.stages.find((s) => s.key === stage)?.checklist ??
    []) {
    const result = await call(
      app,
      "PUT",
      `/game-pipeline/game/${taskId}/checklist`,
      {
        stage,
        item: item.key,
        checked: true,
      },
    );
    expect(result.status).toBe(200);
  }
}

describe("API integration: GAME PRODUCTION PIPELINE template", () => {
  let owner: SeededMemberContext;
  let app: App;

  beforeEach(async () => {
    await resetTestDatabase();
    owner = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(owner.user);
    ({ app } = createApp());
  });

  it("serves the template with a stable key and version", async () => {
    const result = await call(app, "GET", "/game-pipeline/template");
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      key: "game-production-pipeline",
      version: 1,
      name: "GAME PRODUCTION PIPELINE",
    });
    expect(result.body.config.stages).toHaveLength(12);
  });

  it("creates the project with 12 columns, its own config and labels, and no games", async () => {
    const result = await createPipelineProject(app, owner);
    expect(result.status).toBe(200);
    const projectId = result.body.id;

    const columns = await db
      .select()
      .from(schema.columnTable)
      .where(eq(schema.columnTable.projectId, projectId));
    expect(
      columns.sort((a, b) => a.position - b.position).map((c) => c.name),
    ).toEqual([
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

    const pipeline = await call(
      app,
      "GET",
      `/game-pipeline/project/${projectId}`,
    );
    expect(pipeline.status).toBe(200);
    const { config, templateKey, templateVersion } = pipeline.body.pipeline;
    expect(templateKey).toBe("game-production-pipeline");
    expect(templateVersion).toBe(1);
    expect(config.wipLimitPerDeveloper).toBe(2);
    expect(
      config.kpis.find((k: { key: string }) => k.key === "validPlayers").target,
    ).toBe(300);
    for (const stage of config.stages) {
      expect(columns.find((c) => c.id === stage.columnId)?.slug).toBe(
        stage.key,
      );
      expect(stage.checklist.length).toBeGreaterThan(0);
    }

    const labels = await db
      .select({ name: schema.labelTable.name })
      .from(schema.labelTable)
      .where(eq(schema.labelTable.workspaceId, owner.workspace.id));
    expect(labels.map((l) => l.name).sort()).toEqual(
      [
        "Meme",
        "Brainrot",
        "Văn hóa Việt",
        "Ý tưởng gốc",
        "Casual",
        "Puzzle",
        "Action",
        "Simulation",
        "Multiplayer",
        "MVP",
        "Cần duyệt",
        "Bị chặn",
        "Cần dữ liệu",
        "Cần tối ưu",
      ].sort(),
    );

    const tasks = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.projectId, projectId));
    expect(tasks).toHaveLength(0);
  });

  it("persists edited values instead of template defaults", async () => {
    const config = projectConfig(owner.user.id, (c) => {
      c.wipLimitPerDeveloper = 3;
      c.gameCodePrefix = "HH";
      c.kpis[0].target = 500;
      c.stages[0].checklist.push({
        key: "trend-radar-extra",
        label: "Ghi KOL",
      });
      c.rules.requireScaleApproval = false;
    });
    const result = await createPipelineProject(app, owner, { config });
    expect(result.status).toBe(200);
    const pipeline = await call(
      app,
      "GET",
      `/game-pipeline/project/${result.body.id}`,
    );
    const saved = pipeline.body.pipeline.config;
    expect(saved.wipLimitPerDeveloper).toBe(3);
    expect(saved.gameCodePrefix).toBe("HH");
    expect(saved.kpis[0].target).toBe(500);
    expect(
      saved.stages[0].checklist.map((i: { label: string }) => i.label),
    ).toContain("Ghi KOL");
    expect(saved.rules.requireScaleApproval).toBe(false);
  });

  it("requires a producer who belongs to the workspace", async () => {
    const noProducer = await createPipelineProject(app, owner, {
      config: projectConfig(owner.user.id, (c) => {
        c.defaults.producerId = null;
      }),
    });
    expect(noProducer.status).toBe(400);
    const stranger = await createPipelineProject(app, owner, {
      config: projectConfig("user-not-a-member"),
    });
    expect(stranger.status).toBe(403);
    const projects = await db.select().from(schema.projectTable);
    expect(projects).toHaveLength(0);
  });

  it("is idempotent for a repeated creation key", async () => {
    const creationKey = randomUUID();
    const [first, second] = await Promise.all([
      createPipelineProject(app, owner, { creationKey }),
      createPipelineProject(app, owner, { creationKey }),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    const retry = await createPipelineProject(app, owner, { creationKey });
    expect(retry.body.id).toBe(first.body.id);

    expect(await db.select().from(schema.projectTable)).toHaveLength(1);
    expect(await db.select().from(schema.columnTable)).toHaveLength(12);
    expect(await db.select().from(schema.projectPipelineTable)).toHaveLength(1);
  });

  it("keeps the project and the template independent", async () => {
    const a = await createPipelineProject(app, owner);
    const pipeline = (
      await call(app, "GET", `/game-pipeline/project/${a.body.id}`)
    ).body.pipeline;
    pipeline.config.kpis[0].target = 999;
    pipeline.config.stages[1].name = "Ý tưởng";
    const update = await call(
      app,
      "PUT",
      `/game-pipeline/project/${a.body.id}`,
      {
        config: pipeline.config,
      },
    );
    expect(update.status).toBe(200);

    const template = await call(app, "GET", "/game-pipeline/template");
    expect(template.body.config.kpis[0].target).toBe(300);
    expect(template.body.config.stages[1].name).toBe("Idea Backlog");

    const b = await createPipelineProject(app, owner);
    const bConfig = (
      await call(app, "GET", `/game-pipeline/project/${b.body.id}`)
    ).body.pipeline.config;
    expect(bConfig.kpis[0].target).toBe(300);

    const renamed = await db
      .select({ name: schema.columnTable.name })
      .from(schema.columnTable)
      .where(eq(schema.columnTable.id, pipeline.config.stages[1].columnId));
    expect(renamed[0]?.name).toBe("💡 Ý tưởng");

    // Only instance admins save template versions; an existing project keeps
    // its own copy and version when a new one is saved.
    await db
      .update(schema.userTable)
      .set({ role: "admin" })
      .where(eq(schema.userTable.id, owner.user.id));
    mockAuthenticatedSession({ ...owner.user, role: "admin" });
    const nextConfig = template.body.config;
    nextConfig.kpis[0].target = 1000;
    const saved = await call(app, "PUT", "/game-pipeline/template", {
      config: nextConfig,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.version).toBe(2);
    const aAfter = (
      await call(app, "GET", `/game-pipeline/project/${a.body.id}`)
    ).body.pipeline;
    expect(aAfter.templateVersion).toBe(1);
    expect(aAfter.config.kpis[0].target).toBe(999);
  });

  it("rejects template edits from non-admins", async () => {
    const template = await call(app, "GET", "/game-pipeline/template");
    const saved = await call(app, "PUT", "/game-pipeline/template", {
      config: template.body.config,
    });
    expect(saved.status).toBe(403);
  });

  it("creates games that inherit defaults and get unique, never reused codes", async () => {
    const developer = await addMember(owner.workspace.id);
    const qa = await addMember(owner.workspace.id);
    const project = await createPipelineProject(app, owner, {
      config: projectConfig(owner.user.id, (c) => {
        c.defaults.developerId = developer.id;
        c.defaults.qaId = qa.id;
      }),
    });
    const projectId = project.body.id;

    const first = await call(
      app,
      "POST",
      `/game-pipeline/project/${projectId}/games`,
      {
        title: "Né Meme",
      },
    );
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      code: "H5-001",
      status: "trend-radar",
      created: true,
    });

    const game = await call(
      app,
      "GET",
      `/game-pipeline/game/${first.body.taskId}`,
    );
    expect(game.body).toMatchObject({
      code: "H5-001",
      producerId: owner.user.id,
      qaId: qa.id,
      stage: "trend-radar",
      totalScore: null,
      details: { platform: "Web H5", devices: ["mobile", "desktop"] },
      checklist: {},
    });
    expect(Object.values(game.body.kpiStatus)).toEqual(Array(6).fill("noData"));
    const [task] = await db
      .select()
      .from(schema.taskTable)
      .where(eq(schema.taskTable.id, first.body.taskId));
    expect(task?.priority).toBe("medium");
    expect(task?.userId).toBe(developer.id);
    expect(task?.startDate?.toISOString().slice(0, 10)).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );

    const key = randomUUID();
    const second = await call(
      app,
      "POST",
      `/game-pipeline/project/${projectId}/games`,
      {
        title: "Ăn Bánh",
        creationKey: key,
      },
    );
    const retry = await call(
      app,
      "POST",
      `/game-pipeline/project/${projectId}/games`,
      {
        title: "Ăn Bánh",
        creationKey: key,
      },
    );
    expect(second.body.code).toBe("H5-002");
    expect(retry.body).toMatchObject({
      taskId: second.body.taskId,
      created: false,
    });

    await call(app, "DELETE", `/task/${second.body.taskId}`);
    const third = await call(
      app,
      "POST",
      `/game-pipeline/project/${projectId}/games`,
      {
        title: "Bắt Cá",
      },
    );
    expect(third.body.code).toBe("H5-003");

    // The generic task API makes a game too, and only at the first stage.
    const wrongStage = await call(app, "POST", `/task/${projectId}`, {
      title: "Skip",
      status: "scale",
      description: "",
      priority: "medium",
    });
    expect(wrongStage.status).toBe(400);
    const viaTask = await call(app, "POST", `/task/${projectId}`, {
      title: "Qua API task",
      status: "trend-radar",
      description: "",
      priority: "medium",
    });
    expect(viaTask.status).toBe(200);
    const viaTaskGame = await call(
      app,
      "GET",
      `/game-pipeline/game/${viaTask.body.id}`,
    );
    expect(viaTaskGame.body.code).toBe("H5-004");
  });

  it("enforces Gate Review conditions and ignores placeholders", async () => {
    const project = await createPipelineProject(app, owner);
    const created = await call(
      app,
      "POST",
      `/game-pipeline/project/${project.body.id}/games`,
      {
        title: "Né Meme",
      },
    );
    const taskId = created.body.taskId;
    const move = (status: string) =>
      call(app, "PUT", `/task/status/${taskId}`, { status });

    const skip = await move("development");
    expect(skip.status).toBe(409);

    await call(app, "PATCH", `/game-pipeline/game/${taskId}`, {
      details: {
        trendSourceUrl: "https://www.tiktok.com/@a/video/1",
        trendEvidence: "[Dán bằng chứng vào đây]",
        targetMarket: "Việt Nam",
      },
    });
    await checkAll(app, taskId, "trend-radar");
    const placeholder = await move("idea-backlog");
    expect(placeholder.status).toBe(409);
    expect(placeholder.text).toContain("trendEvidence");

    await call(app, "PATCH", `/game-pipeline/game/${taskId}`, {
      details: { trendEvidence: "2 triệu view trong 3 ngày" },
    });
    expect((await move("idea-backlog")).status).toBe(200);

    // Rework (moving back) and stopping are never blocked.
    expect((await move("trend-radar")).status).toBe(200);
    expect((await move("idea-backlog")).status).toBe(200);

    const unsafeUrl = await call(
      app,
      "PATCH",
      `/game-pipeline/game/${taskId}`,
      {
        details: { buildUrl: "javascript:alert(1)" },
      },
    );
    expect(unsafeUrl.status).toBe(400);

    const history = await db
      .select({ type: schema.activityTable.type })
      .from(schema.activityTable)
      .where(eq(schema.activityTable.taskId, taskId));
    expect(history.map((h) => h.type)).toEqual(
      expect.arrayContaining(["game_updated", "game_checklist"]),
    );

    expect((await move("stopped")).status).toBe(200);
  });

  it("does not let the untouched MVP brief or missing approval reach Development", async () => {
    const developer = await addMember(owner.workspace.id);
    const qa = await addMember(owner.workspace.id);
    const project = await createPipelineProject(app, owner);
    const created = await call(
      app,
      "POST",
      `/game-pipeline/project/${project.body.id}/games`,
      {
        title: "Né Meme",
        developerId: developer.id,
        qaId: qa.id,
        dueDate: "2026-12-31",
        details: { mvpBrief: builtInTemplateConfig().mvpBrief.template },
      },
    );
    const taskId = created.body.taskId;
    // Put the card in Approved directly; this test is about that one gate.
    const [approvedColumn] = await db
      .select()
      .from(schema.columnTable)
      .where(
        and(
          eq(schema.columnTable.projectId, project.body.id),
          eq(schema.columnTable.slug, "approved"),
        ),
      );
    await db
      .update(schema.taskTable)
      .set({ status: "approved", columnId: approvedColumn?.id })
      .where(eq(schema.taskTable.id, taskId));
    await checkAll(app, taskId, "approved");

    const game = await call(app, "GET", `/game-pipeline/game/${taskId}`);
    const toDevelopment = game.body.transitions.find(
      (t: { stage: string }) => t.stage === "development",
    );
    expect(toDevelopment.allowed).toBe(false);
    expect(toDevelopment.failures.map((f: { code: string }) => f.code)).toEqual(
      ["briefIncomplete", "approvalRequired"],
    );
    expect(
      (
        await call(app, "PUT", `/task/status/${taskId}`, {
          status: "development",
        })
      ).status,
    ).toBe(409);

    // A member who is neither the producer nor a project manager can't approve.
    mockAuthenticatedSession(developer);
    const denied = await call(
      app,
      "PUT",
      `/game-pipeline/game/${taskId}/approval`,
      {
        gate: "development",
        approved: true,
      },
    );
    expect(denied.status).toBe(403);

    mockAuthenticatedSession(owner.user);
    const filled = builtInTemplateConfig()
      .mvpBrief.requiredSections.map((s) => `## ${s}\nNội dung thật cho ${s}`)
      .join("\n\n");
    await call(app, "PATCH", `/game-pipeline/game/${taskId}`, {
      details: { mvpBrief: filled },
    });
    await call(app, "PUT", `/game-pipeline/game/${taskId}/approval`, {
      gate: "development",
      approved: true,
    });
    expect(
      (
        await call(app, "PUT", `/task/status/${taskId}`, {
          status: "development",
        })
      ).status,
    ).toBe(200);
  });

  it("rolls a failed game creation back without using up a code", async () => {
    const project = await createPipelineProject(app, owner);
    const projectId = project.body.id;
    const failed = await call(
      app,
      "POST",
      `/game-pipeline/project/${projectId}/games`,
      {
        title: "Né Meme",
        creationKey: "game-retry-key",
        labelIds: ["label-that-does-not-exist"],
      },
    );
    expect(failed.status).toBe(400);
    expect(
      await db
        .select()
        .from(schema.taskTable)
        .where(eq(schema.taskTable.projectId, projectId)),
    ).toHaveLength(0);

    const retried = await call(
      app,
      "POST",
      `/game-pipeline/project/${projectId}/games`,
      {
        title: "Né Meme",
        creationKey: "game-retry-key",
      },
    );
    expect(retried.body).toMatchObject({ code: "H5-001", created: true });
  });

  it("creates an optional sample game marked as sample data", async () => {
    const project = await createPipelineProject(app, owner, {
      includeSampleGame: true,
    });
    const games = await call(
      app,
      "GET",
      `/game-pipeline/project/${project.body.id}/games`,
    );
    expect(games.body).toHaveLength(1);
    expect(games.body[0]).toMatchObject({
      code: "H5-001",
      isSample: true,
      checked: 0,
    });
  });

  it("keeps blank project creation unchanged", async () => {
    const result = await call(app, "POST", "/project", {
      workspaceId: owner.workspace.id,
      name: "Website",
      icon: "Layout",
      slug: "WEB",
    });
    expect(result.status).toBe(200);
    const columns = await db
      .select({ slug: schema.columnTable.slug })
      .from(schema.columnTable)
      .where(eq(schema.columnTable.projectId, result.body.id));
    expect(columns.map((c) => c.slug).sort()).toEqual(
      ["done", "in-progress", "in-review", "to-do"].sort(),
    );
    const pipeline = await call(
      app,
      "GET",
      `/game-pipeline/project/${result.body.id}`,
    );
    expect(pipeline.body).toEqual({ pipeline: null });

    // Ordinary projects have no gates.
    const task = await call(app, "POST", `/task/${result.body.id}`, {
      title: "Plain",
      status: "to-do",
      description: "",
      priority: "medium",
    });
    expect(
      (
        await call(app, "PUT", `/task/status/${task.body.id}`, {
          status: "done",
        })
      ).status,
    ).toBe(200);
  });

  it("keeps games inside their pipeline project", async () => {
    const project = await createPipelineProject(app, owner);
    const other = await createProjectFixture({
      workspaceId: owner.workspace.id,
    });
    const created = await call(
      app,
      "POST",
      `/game-pipeline/project/${project.body.id}/games`,
      {
        title: "Né Meme",
      },
    );
    const moved = await call(app, "PUT", `/task/move/${created.body.taskId}`, {
      destinationProjectId: other.project.id,
    });
    expect(moved.status).toBe(409);
  });
});
