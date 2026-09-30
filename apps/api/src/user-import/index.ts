import { HTTPException } from "hono/http-exception";
import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { isInstanceAdmin } from "../utils/is-instance-admin";
import importUsers from "./controllers/import-users";
import { importUsersResultSchema } from "./response";
import { importUsersBody } from "./schema";

const importUsersRoute = createRoute({
  method: "post",
  operationId: "importUsers",
  path: "/users",
  tags: ["Administration"],
  summary: "Import user accounts",
  description: `Create accounts in bulk from a JoyDigi Workspace export.

An address that already has an account is reported as existing and left
untouched, so re-running the same file never resets a password somebody has
already changed. Created accounts are marked email-verified, which is what
lets an SSO identity attach to them later; the API refuses this route to
anyone who is not an instance administrator.

Passwords are hashed on the way in and are never logged or returned.`,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: importUsersBody } },
    },
  },
  responses: {
    200: jsonResponse("Import finished", importUsersResultSchema),
    401: errorResponse("Unauthorized"),
    403: errorResponse("Instance administrators only"),
  },
});

const userImport = apiRouter().openapi(importUsersRoute, async (c) => {
  if (!(await isInstanceAdmin(c))) {
    throw new HTTPException(403, {
      message: "Only instance administrators can import accounts.",
    });
  }

  const { users } = c.req.valid("json");
  return c.json(await importUsers(users), 200);
});

export default userImport;
