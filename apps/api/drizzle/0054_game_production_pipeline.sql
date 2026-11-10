CREATE TABLE "game_card" (
	"task_id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"code" text NOT NULL,
	"producer_id" text,
	"qa_id" text,
	"is_sample" boolean DEFAULT false NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evaluation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"kpi" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checklist" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approvals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creation_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_card_project_code_unique" UNIQUE("project_id","code")
);
--> statement-breakpoint
CREATE TABLE "project_pipeline" (
	"project_id" text PRIMARY KEY NOT NULL,
	"template_key" text NOT NULL,
	"template_version" integer NOT NULL,
	"config" jsonb NOT NULL,
	"last_game_number" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_template" (
	"id" text PRIMARY KEY NOT NULL,
	"template_key" text NOT NULL,
	"version" integer NOT NULL,
	"config" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_template_key_version_unique" UNIQUE("template_key","version")
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "creation_key" text;--> statement-breakpoint
ALTER TABLE "game_card" ADD CONSTRAINT "game_card_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "game_card" ADD CONSTRAINT "game_card_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "game_card" ADD CONSTRAINT "game_card_producer_id_user_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "game_card" ADD CONSTRAINT "game_card_qa_id_user_id_fk" FOREIGN KEY ("qa_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_pipeline" ADD CONSTRAINT "project_pipeline_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_template" ADD CONSTRAINT "project_template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "game_card_projectId_idx" ON "game_card" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_card_project_creation_key_unique" ON "game_card" USING btree ("project_id","creation_key") WHERE "game_card"."creation_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "project_workspace_creation_key_unique" ON "project" USING btree ("workspace_id","creation_key") WHERE "project"."creation_key" is not null;