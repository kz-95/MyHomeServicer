/**
 * Unit tests — questionSchemaSchema validation and checkQuestionSchemaImmutability.
 *
 * Tests Zod schema parsing and immutability enforcement for category question schemas.
 * No mocks, no DB calls — pure function tests.
 */

import {
  questionSchemaSchema,
  QuestionSchema,
  checkQuestionSchemaImmutability,
} from '../../src/lib/json-schemas';

// ── questionSchemaSchema — valid ────────────────────────────────────────────────

describe('questionSchemaSchema — valid', () => {
  it('parses minimal item [{ key, label, type }]', () => {
    const data = [{ key: 'q', label: 'Q', type: 'text' }] as const;
    const result = questionSchemaSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0].key).toBe('q');
      expect(result.data[0].label).toBe('Q');
      expect(result.data[0].type).toBe('text');
    }
  });

  it('parses full schema with options (radio question with 2 options)', () => {
    const data = [
      {
        key: 'rooms',
        label: 'Number of rooms',
        type: 'radio',
        required: true,
        priced: false,
        description: 'How many rooms?',
        sortOrder: 1,
        active: true,
        options: [
          { value: '1', label: '1 room', sortOrder: 0, active: true },
          { value: '2', label: '2 rooms', sortOrder: 1, active: true },
        ],
      },
    ] as const;
    const result = questionSchemaSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].options).toHaveLength(2);
      expect(result.data[0].options?.[0].value).toBe('1');
      expect(result.data[0].options?.[1].value).toBe('2');
    }
  });

  it('accepts active: false on question and option', () => {
    const data = [
      {
        key: 'q1',
        label: 'Q1',
        type: 'checkbox',
        active: false,
        options: [{ value: 'a', label: 'A', active: false }],
      },
    ] as const;
    const result = questionSchemaSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].active).toBe(false);
      expect(result.data[0].options?.[0].active).toBe(false);
    }
  });

  it('accepts empty array []', () => {
    const data: QuestionSchema = [];
    const result = questionSchemaSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });
});

// ── questionSchemaSchema — invalid ──────────────────────────────────────────────

describe('questionSchemaSchema — invalid', () => {
  it('rejects unsupported type "select"', () => {
    const data = [{ key: 'q', label: 'Q', type: 'select' }];
    const result = questionSchemaSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects empty key ""', () => {
    const data = [{ key: '', label: 'Q', type: 'text' }];
    const result = questionSchemaSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects empty option value ""', () => {
    const data = [
      {
        key: 'q',
        label: 'Q',
        type: 'radio',
        options: [{ value: '', label: 'Option' }],
      },
    ];
    const result = questionSchemaSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

// ── checkQuestionSchemaImmutability — allowed changes ────────────────────────────

describe('checkQuestionSchemaImmutability — allowed changes', () => {
  const base: QuestionSchema = [
    {
      key: 'rooms',
      label: 'Number of rooms',
      type: 'radio',
      priced: true,
      options: [
        { value: '1', label: '1 room' },
        { value: '2', label: '2 rooms' },
      ],
    },
    { key: 'notes', label: 'Special notes', type: 'text' },
  ];

  it('returns null for identical schema', () => {
    const error = checkQuestionSchemaImmutability(base, base);
    expect(error).toBeNull();
  });

  it('returns null when label changed', () => {
    const incoming: QuestionSchema = [
      {
        key: 'rooms',
        label: 'How many rooms?',
        type: 'radio',
        priced: true,
        options: [
          { value: '1', label: '1 room' },
          { value: '2', label: '2 rooms' },
        ],
      },
      { key: 'notes', label: 'Special notes', type: 'text' },
    ];
    const error = checkQuestionSchemaImmutability(base, incoming);
    expect(error).toBeNull();
  });

  it('returns null when new question added', () => {
    const incoming: QuestionSchema = [
      ...base,
      { key: 'photos', label: 'Upload photos', type: 'text' },
    ];
    const error = checkQuestionSchemaImmutability(base, incoming);
    expect(error).toBeNull();
  });

  it('returns null when new option added to existing question', () => {
    const incoming: QuestionSchema = [
      {
        key: 'rooms',
        label: 'Number of rooms',
        type: 'radio',
        priced: true,
        options: [
          { value: '1', label: '1 room' },
          { value: '2', label: '2 rooms' },
          { value: '3', label: '3 rooms' },
        ],
      },
      { key: 'notes', label: 'Special notes', type: 'text' },
    ];
    const error = checkQuestionSchemaImmutability(base, incoming);
    expect(error).toBeNull();
  });

  it('returns null when question set active: false', () => {
    const incoming: QuestionSchema = [
      {
        key: 'rooms',
        label: 'Number of rooms',
        type: 'radio',
        priced: true,
        active: false,
        options: [
          { value: '1', label: '1 room' },
          { value: '2', label: '2 rooms' },
        ],
      },
      { key: 'notes', label: 'Special notes', type: 'text' },
    ];
    const error = checkQuestionSchemaImmutability(base, incoming);
    expect(error).toBeNull();
  });

  it('returns null when option set active: false', () => {
    const incoming: QuestionSchema = [
      {
        key: 'rooms',
        label: 'Number of rooms',
        type: 'radio',
        priced: true,
        options: [
          { value: '1', label: '1 room', active: false },
          { value: '2', label: '2 rooms' },
        ],
      },
      { key: 'notes', label: 'Special notes', type: 'text' },
    ];
    const error = checkQuestionSchemaImmutability(base, incoming);
    expect(error).toBeNull();
  });
});

// ── checkQuestionSchemaImmutability — violations ─────────────────────────────────

describe('checkQuestionSchemaImmutability — violations', () => {
  const base: QuestionSchema = [
    {
      key: 'rooms',
      label: 'Number of rooms',
      type: 'radio',
      priced: true,
      options: [
        { value: '1', label: '1 room' },
        { value: '2', label: '2 rooms' },
      ],
    },
    { key: 'notes', label: 'Special notes', type: 'text' },
  ];

  it('returns error matching /notes/ when notes question removed', () => {
    const incoming: QuestionSchema = [
      {
        key: 'rooms',
        label: 'Number of rooms',
        type: 'radio',
        priced: true,
        options: [
          { value: '1', label: '1 room' },
          { value: '2', label: '2 rooms' },
        ],
      },
    ];
    const error = checkQuestionSchemaImmutability(base, incoming);
    expect(error).not.toBeNull();
    expect(error).toMatch(/notes/);
  });

  it('returns error matching /"1"/ when option value "1" removed from rooms', () => {
    const incoming: QuestionSchema = [
      {
        key: 'rooms',
        label: 'Number of rooms',
        type: 'radio',
        priced: true,
        options: [{ value: '2', label: '2 rooms' }],
      },
      { key: 'notes', label: 'Special notes', type: 'text' },
    ];
    const error = checkQuestionSchemaImmutability(base, incoming);
    expect(error).not.toBeNull();
    expect(error).toMatch(/"1"/);
  });

  it('returns non-null when empty array passed (all questions removed)', () => {
    const incoming: QuestionSchema = [];
    const error = checkQuestionSchemaImmutability(base, incoming);
    expect(error).not.toBeNull();
  });
});
