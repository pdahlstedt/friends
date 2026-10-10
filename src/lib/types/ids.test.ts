import { describe, expect, it } from 'vitest';
import { toUserId } from './ids';

describe('toUserId', () => {
  it('accepts a UUID and returns it unchanged', () => {
    const id = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
    expect(toUserId(id)).toBe(id);
  });

  it('accepts upper-case hex', () => {
    expect(toUserId('3F2B8C1E-9A4D-4E6F-8B7A-1C2D3E4F5A6B')).toBe(
      '3F2B8C1E-9A4D-4E6F-8B7A-1C2D3E4F5A6B',
    );
  });

  it.each([
    '',
    'not-a-uuid',
    '3f2b8c1e9a4d4e6f8b7a1c2d3e4f5a6b',
    ' 3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b',
    '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b\n',
    'zf2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b',
  ])('rejects %j without echoing it', (value) => {
    expect(() => toUserId(value)).toThrow('Invalid user ID');
  });
});
