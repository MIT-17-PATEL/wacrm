/**
 * The user-visible text of an inbound WhatsApp message, whatever
 * envelope Meta delivered it in.
 *
 * The same words reach us three ways, and every consumer that reads
 * "what did the customer say" must treat them alike — a keyword trigger,
 * a Collect input node and a button/list match inside a Flow all need
 * "Not Interested" to look the same whether it was typed or tapped:
 *
 *   - `text`        typed message                → `text.body`
 *   - `button`      quick-reply tap on a TEMPLATE → `button.text`
 *                   (broadcasts), payload in `button.payload`
 *   - `interactive` tap on our own buttons / list → `button_reply.title`
 *                   or `list_reply.title`, id as the payload
 *
 * Other types (media, location, reactions…) carry no reply text and
 * return `{ text: null, payload: null }`; callers fall back to whatever
 * they already derive for those (e.g. a media caption).
 */

/** The subset of Meta's inbound message object this helper reads. */
export interface InboundTextSource {
  type: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
}

export interface InboundText {
  /** What the customer typed or the label they tapped. Null if none. */
  text: string | null;
  /**
   * Stable value behind a tap: the template button's `payload`, or the
   * `id` we put on an interactive button / list row. Null for typed text.
   */
  payload: string | null;
}

export function extractInboundText(message: InboundTextSource): InboundText {
  switch (message.type) {
    case 'text':
      return { text: message.text?.body || null, payload: null };
    case 'button':
      return {
        text: message.button?.text || null,
        payload: message.button?.payload || null,
      };
    case 'interactive': {
      const reply =
        message.interactive?.button_reply ?? message.interactive?.list_reply;
      return { text: reply?.title || null, payload: reply?.id || null };
    }
    default:
      return { text: null, payload: null };
  }
}

/**
 * Normalisation shared by every text comparison on the Flows side
 * (keyword triggers, If/else equals/contains, button-title matching):
 * surrounding whitespace and letter case never decide a match.
 */
export function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase();
}
