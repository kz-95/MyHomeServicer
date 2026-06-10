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

import { nextStepBlocks, computeNextCards, extractAddress, extractName, matchQuestionAnswer } from '../../src/services/chat.service';

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

describe('extractAddress — free-text address crediting (breaks the address loop)', () => {
  it('captures an address with a 5-digit postcode', () => {
    expect(extractAddress('88 jalan pju 5/20, kota damansara, petaling jaya 47810')).toContain('47810');
  });

  it('captures an address from a street marker + number (no postcode)', () => {
    expect(extractAddress('no 12 jalan ampang')).toMatch(/jalan ampang/i);
  });

  it('picks the address line out of a noisy message', () => {
    const got = extractAddress('need this asap please. 6 jalan ss15/4, subang jaya 47500. thanks');
    expect(got).toContain('47500');
  });

  it('returns undefined for a message with no address signal', () => {
    expect(extractAddress('need this asap please')).toBeUndefined();
    expect(extractAddress('ya that one')).toBeUndefined();
    expect(extractAddress('huh')).toBeUndefined();
  });

  it('does not treat a bare number / budget as an address', () => {
    expect(extractAddress('budget around rm1239')).toBeUndefined();
  });
});

describe('extractAddress — strips conversational filler (rojak wrapper)', () => {
  it('drops "eh boss, ... lor, can help anot?" around the address', () => {
    const got = extractAddress('eh boss, 18 jalan tempua 5, bandar puchong jaya 47100 lor, can help anot?');
    expect(got).toBe('18 jalan tempua 5, bandar puchong jaya 47100');
  });

  it('pulls the address out of a multi-clause dump and ignores the phone', () => {
    const got = extractAddress("i prlu cuci kete, reach me at 1496992730, i'm at 15 persiaran apec, cyberjaya, 63000");
    expect(got).toContain('15 persiaran apec');
    expect(got).toContain('63000');
    expect(got).not.toContain('1496992730');
  });

  it('still returns undefined when there is no address signal', () => {
    expect(extractAddress('eh boss, can help anot?')).toBeUndefined();
  });
});

describe('extractName — registers a typed name, rejects junk', () => {
  it('captures an explicit lead-in and drops a trailing filler word', () => {
    expect(extractName("eh boss, name's lina lah, can help anot?")).toBe('Lina');
    expect(extractName("i'm hafiz")).toBe('Hafiz');
    expect(extractName('my name is Kumar')).toBe('Kumar');
    expect(extractName('call me Zack')).toBe('Zack');
  });

  it('rejects the classic false positive "I\'m from KL"', () => {
    expect(extractName("i'm from KL")).toBeUndefined();
  });

  it('takes a bare token ONLY at the name step', () => {
    expect(extractName('Hafiz', { allowBare: true })).toBe('Hafiz');
    expect(extractName('Hafiz')).toBeUndefined();           // no lead-in, bare not allowed
    expect(extractName('okay', { allowBare: true })).toBeUndefined(); // stopword
  });
});

describe('matchQuestionAnswer — confirms a typed radio answer in any language', () => {
  const areaQ = {
    type: 'radio',
    options: [
      { value: 'bathtub', label: 'Bathtub', labelI18n: { en: 'Bathtub', ms: 'Tab mandi', zh: '浴缸', ta: 'குளியல் தொட்டி' } },
      { value: 'toilet_wc', label: 'Toilet / WC', labelI18n: { en: 'Toilet / WC', ms: 'Tandas', zh: '马桶', ta: 'கழிப்பறை' } },
    ],
  };

  it('matches the English option label', () => {
    expect(matchQuestionAnswer(areaQ, 'Bathtub')).toBe('bathtub');
  });

  it('matches the option value', () => {
    expect(matchQuestionAnswer(areaQ, 'toilet_wc')).toBe('toilet_wc');
  });

  it('matches a localized (zh / ms) label — the i18n loop fix', () => {
    expect(matchQuestionAnswer(areaQ, '浴缸')).toBe('bathtub');
    expect(matchQuestionAnswer(areaQ, 'Tandas')).toBe('toilet_wc');
  });

  it('matches an option wrapped in rojak filler', () => {
    expect(matchQuestionAnswer(areaQ, 'eh boss, bathtub sia, can help anot?')).toBe('bathtub');
  });

  it('returns undefined when nothing matches', () => {
    expect(matchQuestionAnswer(areaQ, 'something unrelated entirely')).toBeUndefined();
  });

  it('captures a bare number for a number/quantity question', () => {
    expect(matchQuestionAnswer({ type: 'number' }, 'about 50')).toBe('50');
  });
});

describe('matchQuestionAnswer — checkbox free-text credits the answer (loop fix)', () => {
  const heavyQ = {
    type: 'checkbox',
    options: [
      { value: 'fridge', label: 'Fridge', labelI18n: { en: 'Fridge', zh: '冰箱' } },
      { value: 'sofa', label: 'Sofa', labelI18n: { en: 'Sofa', zh: '沙发' } },
      { value: 'piano', label: 'Piano', labelI18n: { en: 'Piano', zh: '钢琴' } },
    ],
  };
  const airconQ = {
    type: 'checkbox',
    options: [
      { value: 'wall_chemical', label: 'Wall Unit — Chemical Cleaning (Recommended)', labelI18n: { ms: 'Unit Dinding — Pencucian Kimia (Disyorkan)' } },
      { value: 'wall_general', label: 'Wall Unit — General Cleaning' },
    ],
  };

  it('credits a localized checkbox label (冰箱 → fridge) as an array — the run-1 heavy_items loop', () => {
    expect(matchQuestionAnswer(heavyQ, '冰箱')).toEqual(['fridge']);
  });

  it('credits the exact English option label (case-insensitive)', () => {
    expect(matchQuestionAnswer(airconQ, 'wall unit — chemical cleaning (recommended)')).toEqual(['wall_chemical']);
  });

  it('credits the ms option label — the run-3/5 aircon_service loop', () => {
    expect(matchQuestionAnswer(airconQ, 'Unit Dinding — Pencucian Kimia (Disyorkan)')).toEqual(['wall_chemical']);
  });

  it('credits multiple options mentioned in one free-text answer', () => {
    expect(matchQuestionAnswer(heavyQ, 'fridge and sofa')).toEqual(['fridge', 'sofa']);
  });

  it('returns undefined when no option matches', () => {
    expect(matchQuestionAnswer(heavyQ, 'something unrelated')).toBeUndefined();
  });
});
