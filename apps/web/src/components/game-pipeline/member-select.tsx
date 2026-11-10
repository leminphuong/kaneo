import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useGetActiveWorkspaceUsers } from "@/hooks/queries/workspace-users/use-get-active-workspace-users";

const NONE = "__none__";

type MemberSelectProps = {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  allowEmpty?: boolean;
  disabled?: boolean;
  invalid?: boolean;
};

export function useWorkspaceMembers() {
  const { data: workspace } = useActiveWorkspace();
  const { data } = useGetActiveWorkspaceUsers(workspace?.id ?? "");
  return (data?.members ?? []).map((member) => ({
    userId: member.userId,
    name: member.user?.name || member.user?.email || member.userId,
  }));
}

function MemberSelect({
  id,
  value,
  onChange,
  allowEmpty = true,
  disabled,
  invalid,
}: MemberSelectProps) {
  const { t } = useTranslation();
  const members = useWorkspaceMembers();
  const items = [
    ...(allowEmpty
      ? [{ value: NONE, label: t("gamePipeline:form.unassigned") }]
      : []),
    ...members.map((member) => ({ value: member.userId, label: member.name })),
  ];

  return (
    <Select
      items={items}
      value={value ?? (allowEmpty ? NONE : null)}
      onValueChange={(next) =>
        onChange(!next || next === NONE ? null : (next as string))
      }
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        className="h-9 w-full text-sm"
        aria-invalid={invalid || undefined}
      >
        <SelectValue placeholder={t("gamePipeline:form.pickMember")} />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default MemberSelect;
