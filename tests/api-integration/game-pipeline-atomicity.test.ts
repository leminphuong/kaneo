import { beforeEach, describe, expect, it, vi } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import {
  builtInTemplateConfig,
  GAME_PIPELINE_TEMPLATE_KEY,
} from "../../apps/api/src/game-pipeline/config";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

// Make the last step of template setup (the sample game) fail, after the
// project, columns, pipeline config and labels were already written.
vi.mock(
  "../../apps/api/src/game-pipeline/controllers/create-game",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../apps/api/src/game-pipeline/controllers/create-game")
      >();
    return {
      ...actual,
      insertGame: vi.fn(async () => {
        throw new Error("simulated failure while creating the sample game");
      }),
    };
  },
);

describe("API integration: template project creation is atomic", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("leaves no project, columns, config or labels behind when a step fails", async () => {
    const owner = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    const config = builtInTemplateConfig();
    config.startDate = "2026-11-10";
    config.defaults.producerId = owner.user.id;

    const body = JSON.stringify({
      workspaceId: owner.workspace.id,
      name: "Game H5 — Quy trình sản xuất",
      icon: "Rocket",
      slug: "GAME",
      creationKey: "retry-after-failure-key",
      template: {
        key: GAME_PIPELINE_TEMPLATE_KEY,
        version: 1,
        config,
        includeSampleGame: true,
      },
    });
    const response = await app.request("/api/project", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(response.status).toBe(500);

    expect(await db.select().from(schema.projectTable)).toHaveLength(0);
    expect(await db.select().from(schema.columnTable)).toHaveLength(0);
    expect(await db.select().from(schema.projectPipelineTable)).toHaveLength(0);
    expect(await db.select().from(schema.labelTable)).toHaveLength(0);
    expect(await db.select().from(schema.taskTable)).toHaveLength(0);
  });
});
