import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";

/** Field names as they appear in the JoyDigi Workspace export. */
export type UserToImport = {
  ho_ten: string;
  ten_dang_nhap: string;
  email: string;
  mat_khau_mac_dinh: string;
};

async function importUsers(users: UserToImport[]) {
  const response = await client.import.users.$post({ json: { users } });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return response.json();
}

export default importUsers;
