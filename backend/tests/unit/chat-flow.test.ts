/**
 * Unit tests — deterministic quote-flow card logic.
 *
 * Pins the behaviour of the two PURE functions that drive the in-chat quote flow:
 *   - nextStepBlocks(collected)        — fixed field order, never skips ahead
 *   - computeNextCards(collected, answered, questions, lang) — the card-confirm turn
 *     short-circuit (LLM skipped): next field / next question / review, with dedup + i18n.
 *
 * These are the flow's load-bearing invariants. Keeping them under test means a future
 * refactor (or a code-simplifier pass) that quietly changes the order, drops the dedup,
 * or breaks the question->review handoff FAILS here instead of shipping a regression.
 * No DB, no LLM, no mocks.
 */

import { nextStepBlocks, computeNextCards } from '../../src/services/chat.service';

const ALL_BASE = [
  'preferredDate',
  'timeSlot',
  'address',
  'budgetMax',
  'contactName',
  'contactNumber',
];

const keys = (blocks: Array<{ data: Record<string, unknown> }>) =>
  blocks.map((b) => b.data['key']);

function question(key: string, required = false) {
  return {
    key,
    label: `Question ${key}`,
    type: 'radio',
    required,
    options: [{ value: 'a', label: 'Option A' }],
  };
}

describe('nextStepBlocks — fixed quote field order', () => {
  it('asks date + time first when nothing is collected', () => {
    expect(keys(nextStepBlocks([]))).toEqual(['preferredDate', 'timeSlot']);
  });

  it('keeps asking date + time until BOTH are collected', () => {
    expect(keys(nextStepBlocks(['preferredDate']))).toEqual(['preferredDate', 'timeSlot']);
    expect(keys(nextStepBlocks(['timeSlot']))).toEqual(['preferredDate', 'timeSlot']);
  });

  it('asks address + propertyType after date + time', () => {
    expect(keys(nextStepBlocks(['preferredDate', 'timeSlot']))).toEqual(['address', 'propertyType']);
  });

  it('drops the propertyType prompt once it is collected', () => {
    expect(keys(nextStepBlocks(['preferredDate', 'timeSlot', 'propertyType']))).toEqual(['address']);
  });

  it('asks budget after address (budget before contact)', () => {
    expect(keys(nextStepBlocks(['preferredDate', 'timeSlot', 'address']))).toEqual(['budgetMax']);
  });

  it('asks name + phone after budget', () => {
    expect(keys(nextStepBlocks(['preferredDate', 'timeSlot', 'address', 'budgetMax']))).toEqual([
      'contactName',
      'contactNumber',
    ]);
  });

  it('asks only the still-missing contact field', () => {
    expect(
      keys(nextStepBlocks(['preferredDate', 'timeSlot', 'address', 'budgetMax', 'contactName'])),
    ).toEqual(['contactNumber']);
  });

  it('returns the review card once every base field is collected', () => {
    expect(nextStepBlocks(ALL_BASE)).toEqual([{ type: 'quote_prefill', data: {} }]);
  });
});

describe('computeNextCards — card-confirm turn (LLM skipped)', () => {
  it('emits date + time when nothing is collected', () => {
    expect(keys(computeNextCards([], [], []))).toEqual(['preferredDate', 'timeSlot']);
  });

  it('drops an already-confirmed field so a card is never re-shown', () => {
    // date confirmed -> only the time card remains (no duplicate date card).
    expect(keys(computeNextCards(['preferredDate'], [], []))).toEqual(['timeSlot']);
  });

  it('never re-emits a confirmed field card', () => {
    const blocks = computeNextCards(['preferredDate', 'timeSlot'], [], []);
    expect(blocks.every((b) => b.data['key'] !== 'preferredDate' && b.data['key'] !== 'timeSlot')).toBe(true);
  });

  it('goes straight to the review when base fields are done and there are no questions', () => {
    expect(computeNextCards(ALL_BASE, [], [])).toEqual([{ type: 'quote_prefill', data: {} }]);
  });

  it('asks the FIRST unanswered question before the review', () => {
    const blocks = computeNextCards(ALL_BASE, [], [question('q1'), question('q2')]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('quote_question');
    expect(blocks[0].data['key']).toBe('q1');
  });

  it('advances to the next unanswered question', () => {
    const blocks = computeNextCards(ALL_BASE, ['q1'], [question('q1'), question('q2')]);
    expect(blocks[0].data['key']).toBe('q2');
  });

  it('shows the review once every question is answered', () => {
    expect(computeNextCards(ALL_BASE, ['q1', 'q2'], [question('q1'), question('q2')])).toEqual([
      { type: 'quote_prefill', data: {} },
    ]);
  });

  it('localizes the question label + options and carries qtype/required', () => {
    const q = {
      key: 'color',
      label: 'Color?',
      labelI18n: { en: 'Color?', ms: 'Warna?' },
      type: 'radio',
      required: true,
      options: [{ value: 'red', label: 'Red', labelI18n: { en: 'Red', ms: 'Merah' } }],
    };
    const [card] = computeNextCards(ALL_BASE, [], [q], 'ms');
    expect(card.data['label']).toBe('Warna?');
    expect(card.data['qtype']).toBe('radio');
    expect(card.data['required']).toBe(true);
    expect((card.data['options'] as Array<{ label: string }>)[0].label).toBe('Merah');
  });

  it('falls back to the canonical label when no translation exists for the language', () => {
    const [card] = computeNextCards(ALL_BASE, [], [question('q1')], 'zh');
    expect(card.data['label']).toBe('Question q1');
  });
});
