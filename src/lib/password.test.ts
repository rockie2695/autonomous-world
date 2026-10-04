import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, PASSWORD_MIN_LENGTH } from './password';

// 這些測試會真的跑 argon2，而 argon2 是記憶體硬（19 MiB／次）。整個檔案的測試
// 數量刻意保持很小，否則 CI 會變成記憶體測試而不是密碼測試。
// These tests really run argon2, which is memory-hard (19 MiB per call). The case
// count is deliberately tiny so the suite stays a password test rather than a memory
// benchmark.

describe('hashPassword / verifyPassword', () => {
  it('should accept the correct password', async () => {
    const encoded = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(encoded, 'correct horse battery staple')).toBe(true);
  });

  it('should reject a wrong password', async () => {
    const encoded = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(encoded, 'Correct horse battery staple')).toBe(false);
    expect(await verifyPassword(encoded, '')).toBe(false);
    expect(await verifyPassword(encoded, 'correct horse battery stapl')).toBe(false);
  });

  it('should never store the plaintext', async () => {
    // 資料庫裡只放編碼雜湊。若這條失敗，代表有路徑把明文寫下去了。
    // The database only ever holds an encoded hash. If this fails, some path is
    // persisting the plaintext.
    const plain = 'a-very-distinctive-passphrase';
    const encoded = await hashPassword(plain);
    expect(encoded).not.toContain(plain);
    // argon2 的 PHC 編碼字串 / the PHC-encoded argon2 string
    expect(encoded).toMatch(/^\$argon2id\$/);
  });

  it('should salt, so the same password hashes differently every time', async () => {
    // 沒有 salt 的話，同密碼的兩個帳號雜湊會一樣，資料庫一被拿到就全數同時破解。
    // Without a salt, two accounts sharing a password would share a hash and fall
    // together the moment the database leaks.
    const a = await hashPassword('same-password-here');
    const b = await hashPassword('same-password-here');
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, 'same-password-here')).toBe(true);
    expect(await verifyPassword(b, 'same-password-here')).toBe(true);
  });

  it('should return false for a malformed hash instead of throwing', async () => {
    // 登入流程不該因為一筆格式錯誤的資料就整個 500 / A sign-in must not 500 because
    // one row is malformed
    expect(await verifyPassword('', 'anything')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
    expect(await verifyPassword('$argon2id$v=19$m=1,t=1,p=1$bad', 'anything')).toBe(
      false
    );
  });
});

describe('PASSWORD_MIN_LENGTH', () => {
  it('should follow the NIST SP 800-63B floor', () => {
    // NIST SP 800-63B 要求至少 8 碼，並建議不要再加上字元組成規則 /
    // NIST SP 800-63B asks for at least 8 characters and advises against adding
    // composition rules
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});