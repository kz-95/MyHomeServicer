/**
 * Chat message guard - detects prompt injection attempts.
 * Three strikes = automatic chat ban. Admin can unban from FAQ panel.
 */
export interface InjectionResult {
  flagged: boolean;
  reason: string | null;
}

const PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /(?:ignore|forget|disregard)\s+(?:all\s+)?(?:previous|prior|earlier|above)\s+(?:instructions?|prompts?|rules?|context|conversation)/i, label: 'instruction override' },
  { regex: /you\s+are\s+(?:now|henceforth|from now on)\s+(?:a\s+)?(?:different|new|unhelpful|evil|malicious|free|unrestricted)/i, label: 'role reassignment' },
  { regex: /(?:system\s*(?:prompt|message|instruction|context)|developer\s*(?:prompt|message|note))/i, label: 'system directive reference' },
  { regex: /pretend\s+(?:you\s+are|to\s+be)\s+/i, label: 'pretending' },
  { regex: /(?:your|the)\s+(?:new\s+)?(?:instructions?|directive|guidelines?)\s+(?:is|are|now|from now on)/i, label: 'instruction injection' },
  { regex: /<\|?\s*(?:system|im_start|im_end|endoftext)\s*\|?>/i, label: 'token delimiter' },
  { regex: /\[INST\]|<<SYS>>|<\/SYS>>|\[\/INST\]/i, label: 'llama format injection' },
  { regex: /\[system\]|\[assistant\]|\[user\]|\[\/system\]|\[content\]/i, label: 'bracket role injection' },
  { regex: /output\s+(?:your|the)\s+(?:system\s*)?prompt/i, label: 'prompt extraction' },
  { regex: /repeat\s+(?:back\s+)?(?:the\s+)?(?:above|previous|exact\s+)?(?:words?|text|prompt|instructions?)/i, label: 'prompt repetition' },
];

export function checkInjection(message: string): InjectionResult {
  const trimmed = message.trim();
  for (const p of PATTERNS) {
    if (p.regex.test(trimmed)) {
      return { flagged: true, reason: p.label };
    }
  }
  return { flagged: false, reason: null };
}
