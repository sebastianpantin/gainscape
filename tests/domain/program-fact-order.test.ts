import { describe, expect, it } from 'vitest';
import { orderFacts, programStateAt } from '@domain/index.ts';
import { setReferenceFact } from './program-fixtures/facts.ts';
import { LINEAR_AFTER_SESSION, linearEnrollment } from './program-fixtures/linear_after_session.ts';
import { refOf } from './program-fixtures/prescription-helpers.ts';

describe('facts are ordered by instant, not by timestamp text', () => {
  it("orders '2026-10-02T10:00:00Z' before '2026-10-02T10:00:00.5Z'", () => {
    const facts = [
      setReferenceFact({ id: 'half-second-later', at: '2026-10-02T10:00:00.5Z' }, 'squat', 'tm', 120),
      setReferenceFact({ id: 'on-the-second', at: '2026-10-02T10:00:00Z' }, 'squat', 'tm', 110),
    ];
    expect(orderFacts(facts).map((fact) => fact.id)).toEqual(['on-the-second', 'half-second-later']);
  });

  it('folds the half-second-later set_reference last: 120', () => {
    const facts = [
      setReferenceFact({ id: 'half-second-later', at: '2026-10-02T10:00:00.5Z' }, 'squat', 'tm', 120),
      setReferenceFact({ id: 'on-the-second', at: '2026-10-02T10:00:00Z' }, 'squat', 'tm', 110),
    ];
    expect(refOf(programStateAt(LINEAR_AFTER_SESSION, linearEnrollment(100), facts), 'squat', 'tm')).toBe(120);
  });

  it("treats '2026-10-02T10:00:00+00:00' and '2026-10-02T10:00:00.000Z' as the same instant, so the id breaks the tie", () => {
    const facts = [
      setReferenceFact({ id: 'b', at: '2026-10-02T10:00:00+00:00' }, 'squat', 'tm', 110),
      setReferenceFact({ id: 'a', at: '2026-10-02T10:00:00.000Z' }, 'squat', 'tm', 120),
    ];
    expect(orderFacts(facts).map((fact) => fact.id)).toEqual(['a', 'b']);
  });

  it("orders '2026-10-02T12:00:00+02:00' before '2026-10-02T10:30:00Z' (10:00 UTC is earlier)", () => {
    const facts = [
      setReferenceFact({ id: 'utc-half-past-ten', at: '2026-10-02T10:30:00Z' }, 'squat', 'tm', 120),
      setReferenceFact({ id: 'plus-two-noon', at: '2026-10-02T12:00:00+02:00' }, 'squat', 'tm', 110),
    ];
    expect(orderFacts(facts).map((fact) => fact.id)).toEqual(['plus-two-noon', 'utc-half-past-ten']);
  });
});

describe('a timestamp with no Z or offset is unparseable, so ordering never depends on the time zone', () => {
  it("orders '2026-10-02T10:00:00' (no zone) after '2026-10-02T23:59:59Z'", () => {
    const facts = [
      setReferenceFact({ id: 'a-no-zone', at: '2026-10-02T10:00:00' }, 'squat', 'tm', 110),
      setReferenceFact({ id: 'z-utc-late', at: '2026-10-02T23:59:59Z' }, 'squat', 'tm', 120),
    ];
    expect(orderFacts(facts).map((fact) => fact.id)).toEqual(['z-utc-late', 'a-no-zone']);
  });

  it("orders a date-only '2026-10-01' after '2026-10-02T00:00:00Z'", () => {
    const facts = [
      setReferenceFact({ id: 'a-date-only', at: '2026-10-01' }, 'squat', 'tm', 110),
      setReferenceFact({ id: 'z-utc', at: '2026-10-02T00:00:00Z' }, 'squat', 'tm', 120),
    ];
    expect(orderFacts(facts).map((fact) => fact.id)).toEqual(['z-utc', 'a-date-only']);
  });

  it('orders unparseable timestamps among themselves by id, not by their local-time reading', () => {
    const facts = [
      setReferenceFact({ id: 'b-earlier-local', at: '2026-10-02T09:00:00' }, 'squat', 'tm', 110),
      setReferenceFact({ id: 'a-later-local', at: '2026-10-02T10:00:00' }, 'squat', 'tm', 120),
    ];
    expect(orderFacts(facts).map((fact) => fact.id)).toEqual(['a-later-local', 'b-earlier-local']);
  });

  it('folds a zoned set_reference before a zone-less one: the zone-less 110 wins', () => {
    const facts = [
      setReferenceFact({ id: 'a-no-zone', at: '2026-10-02T10:00:00' }, 'squat', 'tm', 110),
      setReferenceFact({ id: 'z-utc-late', at: '2026-10-02T23:59:59Z' }, 'squat', 'tm', 120),
    ];
    expect(refOf(programStateAt(LINEAR_AFTER_SESSION, linearEnrollment(100), facts), 'squat', 'tm')).toBe(110);
  });
});
