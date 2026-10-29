/** وضعیت عددی قاعده در این نسخه، تأیید قانونی یا ایمنی پروژه نیست. */
export const RULE_COMPARISON_NOTE = "این نتیجه فقط کنترل محدود است و انطباق مقرراتی یا ایمنی را احراز نمی‌کند.";

/** پیام‌های قدیمی را حفظ می‌کنیم، اما بدون توضیح حدود اعتبار نمایش/صادر نمی‌کنیم. */
export function qualifyRuleMessage(message: string): string {
  return message.includes(RULE_COMPARISON_NOTE) ? message : `${message} ${RULE_COMPARISON_NOTE}`;
}
