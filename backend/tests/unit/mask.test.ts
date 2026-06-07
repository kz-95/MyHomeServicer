import { maskPhone, maskBankAccount } from '../../src/lib/mask';

describe('maskPhone', () => {
  it('masks the last 4 digits, keeping the prefix', () => {
    expect(maskPhone('+60 12-345 6789')).toBe('+60 12-345 ****');
  });

  it('returns an empty string for empty input', () => {
    expect(maskPhone('')).toBe('');
    expect(maskPhone(null)).toBe('');
    expect(maskPhone(undefined)).toBe('');
  });

  it('fully masks very short values', () => {
    expect(maskPhone('123')).toBe('****');
  });
});

describe('maskBankAccount', () => {
  it('keeps only the last 4 digits visible', () => {
    expect(maskBankAccount('5141223344')).toBe('******3344');
  });

  it('leaves short accounts untouched', () => {
    expect(maskBankAccount('4455')).toBe('4455');
  });

  it('handles empty input', () => {
    expect(maskBankAccount('')).toBe('');
    expect(maskBankAccount(null)).toBe('');
  });
});
