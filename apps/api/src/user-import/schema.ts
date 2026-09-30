import { z } from "../openapi";

/**
 * Field names match the JSON exported from JoyDigi Workspace, so the file is
 * uploaded as-is rather than being reshaped by hand first.
 */
export const importUsersBody = z.object({
  users: z
    .array(
      z.object({
        ho_ten: z.string().trim().min(1).max(200).openapi({
          description: "Full name, stored as the account name.",
          example: "Le Minh Phuong",
        }),
        ten_dang_nhap: z.string().trim().min(1).max(100).openapi({
          description:
            "Username in the source system. Recorded for reference only: accounts here are identified by email.",
          example: "phuong",
        }),
        email: z.string().trim().email().max(254).openapi({
          description:
            "Identity of the account. Matched case-insensitively against existing accounts.",
          example: "phuong@joydigi.net",
        }),
        mat_khau_mac_dinh: z.string().min(8).max(128).openapi({
          description:
            "Initial password, used only when the account is created. Never stored in plain text and never returned.",
        }),
      }),
    )
    .min(1)
    .max(500)
    .openapi({
      description:
        "Accounts to import. Capped at 500 per request so one upload cannot tie up the API.",
    }),
});
