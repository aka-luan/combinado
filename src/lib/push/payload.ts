/**
 * Web Push notification payloads for dose reminders and the 22:00 Amanhã
 * summary (PRD §10). Bodies never claim that a dose is still pending.
 */

export type PushNotificationPayload = {
  title: string;
  body: string;
  url: string;
};

export type DoseReminderInput = {
  occurrenceKey: string;
  childName: string;
  medicineName: string;
  scheduledTime: string;
  instruction?: string | null;
};

export type TomorrowSummaryInput = {
  commitmentCount: number;
  doseCount: number;
  withoutOwnerCount: number;
};

export function buildDoseReminderPayload(
  input: DoseReminderInput,
): PushNotificationPayload {
  const parts = [input.childName, input.medicineName, input.scheduledTime];
  const instruction = input.instruction?.trim();
  if (instruction) parts.push(instruction);

  return {
    title: "Hora de verificar",
    body: parts.join(", "),
    url: `/?occ=${encodeURIComponent(input.occurrenceKey)}`,
  };
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildTomorrowSummaryPayload(
  input: TomorrowSummaryInput,
): PushNotificationPayload {
  const body = [
    "Amanhã:",
    pluralize(input.commitmentCount, "compromisso", "compromissos") + ",",
    pluralize(input.doseCount, "dose", "doses") + ",",
    pluralize(input.withoutOwnerCount, "sem responsável", "sem responsável") +
      ".",
  ].join(" ");

  return {
    title: "Combinado",
    body,
    url: "/?amanha=1",
  };
}
