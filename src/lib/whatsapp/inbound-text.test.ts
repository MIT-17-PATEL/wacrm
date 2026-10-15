import { describe, expect, it } from 'vitest';

import { extractInboundText, normalizeForMatch } from './inbound-text';

describe('extractInboundText', () => {
  it('reads a typed text body', () => {
    expect(
      extractInboundText({ type: 'text', text: { body: 'interested' } })
    ).toEqual({ text: 'interested', payload: null });
  });

  it('reads a template quick-reply tap (type "button")', () => {
    expect(
      extractInboundText({
        type: 'button',
        button: { text: 'Not Interested', payload: 'NOT_INTERESTED' },
      })
    ).toEqual({ text: 'Not Interested', payload: 'NOT_INTERESTED' });
  });

  it('reads an interactive button_reply', () => {
    expect(
      extractInboundText({
        type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: { id: 'btn_yes', title: 'Yes' },
        },
      })
    ).toEqual({ text: 'Yes', payload: 'btn_yes' });
  });

  it('reads an interactive list_reply', () => {
    expect(
      extractInboundText({
        type: 'interactive',
        interactive: {
          type: 'list_reply',
          list_reply: { id: 'row_2', title: '3 BHK' },
        },
      })
    ).toEqual({ text: '3 BHK', payload: 'row_2' });
  });

  it('returns nulls for types without reply text, and for empty fields', () => {
    expect(extractInboundText({ type: 'image' })).toEqual({
      text: null,
      payload: null,
    });
    expect(extractInboundText({ type: 'text', text: { body: '' } })).toEqual({
      text: null,
      payload: null,
    });
    expect(extractInboundText({ type: 'button', button: {} })).toEqual({
      text: null,
      payload: null,
    });
  });
});

describe('normalizeForMatch', () => {
  it('trims and lower-cases', () => {
    expect(normalizeForMatch('  Not Interested \n')).toBe('not interested');
  });
});
