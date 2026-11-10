import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { projectTemplateTable } from "../database/schema";
import {
  BUILT_IN_TEMPLATE,
  BUILT_IN_TEMPLATE_VERSION,
  builtInTemplateConfig,
  GAME_PIPELINE_TEMPLATE_KEY,
  type PipelineConfig,
  pipelineConfigSchema,
} from "./config";

export type TemplateVersion = {
  key: typeof GAME_PIPELINE_TEMPLATE_KEY;
  version: number;
  name: string;
  description: string;
  project: { name: string; description: string; icon: string };
  config: PipelineConfig;
  updatedAt: Date | null;
};

function builtIn(): TemplateVersion {
  return {
    key: BUILT_IN_TEMPLATE.key,
    version: BUILT_IN_TEMPLATE_VERSION,
    name: BUILT_IN_TEMPLATE.name,
    description: BUILT_IN_TEMPLATE.description,
    project: { ...BUILT_IN_TEMPLATE.project },
    config: builtInTemplateConfig(),
    updatedAt: null,
  };
}

// A template holds no people, dates or column ids: those belong to the
// project created from it.
export function neutralizeTemplateConfig(
  config: PipelineConfig,
): PipelineConfig {
  return {
    ...config,
    startDate: "2000-01-01",
    deadline: null,
    defaults: {
      ...config.defaults,
      producerId: null,
      developerId: null,
      qaId: null,
    },
    stages: config.stages.map(({ columnId: _columnId, ...stage }) => stage),
  };
}

export async function getLatestTemplate(): Promise<TemplateVersion> {
  const [row] = await db
    .select()
    .from(projectTemplateTable)
    .where(eq(projectTemplateTable.templateKey, GAME_PIPELINE_TEMPLATE_KEY))
    .orderBy(desc(projectTemplateTable.version))
    .limit(1);
  if (!row) return builtIn();
  const parsed = pipelineConfigSchema.safeParse(row.config);
  if (!parsed.success) return builtIn();
  return {
    ...builtIn(),
    version: row.version,
    config: parsed.data,
    updatedAt: row.createdAt,
  };
}

export async function assertKnownTemplateVersion(key: string, version: number) {
  if (key !== GAME_PIPELINE_TEMPLATE_KEY) {
    throw new HTTPException(400, { message: "Unknown project template" });
  }
  if (version === BUILT_IN_TEMPLATE_VERSION) return;
  const [row] = await db
    .select({ id: projectTemplateTable.id })
    .from(projectTemplateTable)
    .where(
      and(
        eq(projectTemplateTable.templateKey, key),
        eq(projectTemplateTable.version, version),
      ),
    )
    .limit(1);
  if (!row) {
    throw new HTTPException(400, {
      message: "Unknown project template version",
    });
  }
}

export async function saveTemplateVersion(
  config: PipelineConfig,
  userId: string,
): Promise<TemplateVersion> {
  const latest = await getLatestTemplate();
  const version = latest.version + 1;
  const [row] = await db
    .insert(projectTemplateTable)
    .values({
      templateKey: GAME_PIPELINE_TEMPLATE_KEY,
      version,
      config: neutralizeTemplateConfig(config),
      createdBy: userId,
    })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    throw new HTTPException(409, {
      message: "Another administrator saved a newer version; reload and retry",
    });
  }
  return {
    ...latest,
    version,
    config: neutralizeTemplateConfig(config),
    updatedAt: row.createdAt,
  };
}
