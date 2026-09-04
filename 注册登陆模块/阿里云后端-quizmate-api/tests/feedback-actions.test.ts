import { describe, expect, it, vi } from 'vitest';
import { createFeedbackActions } from '../src/actions/feedback.js';
import type { ActionDependencies } from '../src/types.js';

function harness() {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM account_sessions')) return { rows: [{ account_id: 'account-1', email: 'tester@example.com' }], rowCount: 1 };
    if (sql.includes('INSERT INTO user_feedback')) return { rows: [{ feedback_id: 'feedback-1', created_at: '2026-09-04T00:00:00.000Z' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const deps = { db: { query } } as unknown as ActionDependencies;
  const actions = createFeedbackActions(deps);
  const context = { requestId: 'feedback-test', clientIp: '127.0.0.1', db: deps.db } as any;
  return { submit: (input: Record<string, unknown>) => actions.get('submitFeedback')!(input, context), query };
}

describe('problem feedback', () => {
  it('stores an authenticated description and pasted data-url attachment', async () => {
    const api = harness();
    await expect(api.submit({ accountToken: 'valid-session', description: '截图后没有刷新', attachmentName: 'paste.png', attachmentType: 'image/png', attachmentData: 'data:image/png;base64,YWJj' })).resolves.toMatchObject({ feedbackId: 'feedback-1' });
    expect(api.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO user_feedback'))).toBe(true);
  });

  it('rejects empty descriptions and oversized attachments without inserting', async () => {
    const empty = harness();
    await expect(empty.submit({ accountToken: 'valid-session', description: ' ' })).rejects.toMatchObject({ code: 'FEEDBACK_DESCRIPTION_REQUIRED' });
    expect(empty.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO user_feedback'))).toBe(false);

    const large = harness();
    await expect(large.submit({ accountToken: 'valid-session', description: '附件太大', attachmentData: `data:image/png;base64,${'A'.repeat(7_000_001)}` })).rejects.toMatchObject({ code: 'FEEDBACK_ATTACHMENT_TOO_LARGE' });
    expect(large.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO user_feedback'))).toBe(false);
  });
});
