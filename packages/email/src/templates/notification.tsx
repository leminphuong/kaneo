import { Link, Section, Text } from "@react-email/components";
import React from "react";
import { resolveEmailLocale } from "./resolve-locale";
import { EmailShell, styles } from "./shell";

void React;

export type NotificationEmailProps = {
  title: string;
  message: string;
  actionUrl?: string | null;
  actionLabel?: string;
  locale?: string | null;
};

const messages = {
  en: {
    preview: "You have a new JOYDIGI TASK notification",
    subtitle: "A notification matched your delivery preferences.",
    footer: "JOYDIGI TASK notification",
    actionLabel: "Open in JOYDIGI TASK",
  },
  de: {
    preview: "Du hast eine neue JOYDIGI TASK-Benachrichtigung",
    subtitle:
      "Eine Benachrichtigung entspricht deinen Zustellungs-Einstellungen.",
    footer: "JOYDIGI TASK-Benachrichtigung",
    actionLabel: "In JOYDIGI TASK oeffnen",
  },
  vi: {
    preview: "Bạn có thông báo mới từ JOYDIGI TASK",
    subtitle: "Một thông báo khớp với tùy chọn nhận thông báo của bạn.",
    footer: "Thông báo JOYDIGI TASK",
    actionLabel: "Mở trong JOYDIGI TASK",
  },
  ja: {
    preview: "JOYDIGI TASK の新しい通知",
    subtitle: "配信設定に一致する通知がありました。",
    footer: "JOYDIGI TASK 通知",
    actionLabel: "JOYDIGI TASK で開く",
  },
} as const;

const NotificationEmail = ({
  title,
  message,
  actionUrl,
  actionLabel,
  locale,
}: NotificationEmailProps) => {
  const copy = messages[resolveEmailLocale(locale)];

  return (
    <EmailShell preview={copy.preview} title={title} subtitle={copy.subtitle}>
      <Section>
        <Text style={styles.paragraph}>{message}</Text>
        {actionUrl ? (
          <Link style={styles.button} href={actionUrl}>
            {actionLabel ?? copy.actionLabel}
          </Link>
        ) : null}
        <Section style={styles.divider} />
        <Text style={styles.footer}>{copy.footer}</Text>
      </Section>
    </EmailShell>
  );
};

NotificationEmail.PreviewProps = {
  title: "Task assigned to you",
  message: "You were assigned to Design account notifications.",
  actionUrl: "https://kaneo.app",
} as NotificationEmailProps;

export default NotificationEmail;
