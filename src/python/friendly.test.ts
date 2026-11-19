import { describe, expect, it } from 'vitest';
import { explainError } from './friendly';

describe('explainError', () => {
  it('passes on Python suggestions for typos', () => {
    expect(explainError('NameError', "name 'pirnt' is not defined. Did you mean: 'print'?").friendly).toBe(
      "Python doesn't know the name 'pirnt'. Did you mean 'print'?",
    );
  });

  it('explains unclosed brackets and quotes', () => {
    expect(explainError('SyntaxError', "'(' was never closed").friendly).toMatch(/bracket \( was opened/);
    expect(explainError('SyntaxError', 'unterminated string literal (detected at line 1)').friendly).toMatch(/closing quote/);
  });

  it('uses the game text for bot errors', () => {
    const e = explainError('OutOfEnergy', 'not enough energy for that.');
    expect(e).toEqual({ friendly: 'Not enough energy for that.', tip: expect.stringMatching(/battery/) });
  });

  it('falls back to something sensible', () => {
    expect(explainError('OverflowError', 'too big').friendly).toBe('Python stopped with a OverflowError: too big');
  });
});
