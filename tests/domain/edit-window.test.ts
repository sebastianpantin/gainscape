import { describe, expect, it } from 'vitest';
import { EDIT_WINDOW_DAYS, isSessionEditable, isWithinEditWindow } from '@domain/index.ts';
import { DAY_MS } from './fixtures.ts';

const now = Date.parse('2026-09-30T12:00:00.000Z');
const windowMs = EDIT_WINDOW_DAYS * DAY_MS;

describe('isWithinEditWindow', () => {
  it('includes a session that started exactly 7 days ago', () => {
    expect(isWithinEditWindow(new Date(now - windowMs).toISOString(), now)).toBe(true);
  });

  it('excludes a session that started 7 days and 1 ms ago', () => {
    expect(isWithinEditWindow(new Date(now - windowMs - 1).toISOString(), now)).toBe(false);
  });
});

describe('isSessionEditable', () => {
  it('allows a session inside the window', () => {
    expect(isSessionEditable({ historyOnly: false, startedAt: new Date(now - windowMs).toISOString() }, now)).toBe(
      true,
    );
  });

  it('refuses a session outside the window', () => {
    expect(isSessionEditable({ historyOnly: false, startedAt: new Date(now - windowMs - 1).toISOString() }, now)).toBe(
      false,
    );
  });

  it('refuses a history-only session even inside the window', () => {
    expect(isSessionEditable({ historyOnly: true, startedAt: new Date(now).toISOString() }, now)).toBe(false);
  });
});
