import { getRequestConfig } from 'next-intl/server';
import type { AbstractIntlMessages } from 'next-intl';
import { routing } from './routing';

type Messages = AbstractIntlMessages;

function mergeMessages(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = out[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      baseValue &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue)
    ) {
      out[key] = mergeMessages(baseValue as Messages, value as Messages);
    } else {
      out[key] = value as Messages[string];
    }
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested && (routing.locales as readonly string[]).includes(requested)
      ? requested
      : routing.defaultLocale;
  const messages = (await import(`./messages/${locale}.json`)).default as Messages;
  const fallbackMessages = locale === 'zh'
    ? (await import('./messages/en.json')).default as Messages
    : null;
  return {
    locale,
    messages: fallbackMessages ? mergeMessages(fallbackMessages, messages) : messages,
  };
});
