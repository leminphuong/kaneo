import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none__";

type OptionSelectProps<T extends string> = {
  id?: string;
  value: T | null | undefined;
  options: readonly { value: T; label: string }[];
  onChange: (value: T | null) => void;
  // When set, an extra first option clears the value.
  emptyLabel?: string;
  disabled?: boolean;
};

function OptionSelect<T extends string>({
  id,
  value,
  options,
  onChange,
  emptyLabel,
  disabled,
}: OptionSelectProps<T>) {
  const items = [
    ...(emptyLabel ? [{ value: NONE, label: emptyLabel }] : []),
    ...options,
  ];
  return (
    <Select
      items={items}
      value={value ?? (emptyLabel ? NONE : null)}
      onValueChange={(next) =>
        onChange(!next || next === NONE ? null : (next as T))
      }
      disabled={disabled}
    >
      <SelectTrigger id={id} className="h-9 w-full text-sm">
        <SelectValue />
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

export default OptionSelect;
