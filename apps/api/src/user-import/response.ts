import { z } from "../openapi";

export const importUsersResultSchema = z
  .object({
    created: z.number().int().openapi({ description: "Accounts created." }),
    existing: z
      .number()
      .int()
      .openapi({ description: "Addresses that already had an account." }),
    failed: z.number().int().openapi({ description: "Rows that failed." }),
    results: z.array(
      z.object({
        email: z.string(),
        status: z.enum(["created", "exists", "error"]),
        message: z.string().optional().openapi({
          description:
            "Why the row failed. Never contains the password from the file.",
        }),
      }),
    ),
  })
  .openapi("ImportUsersResult");
