import crypto from 'node:crypto';

// scrypt N=2^15, r=8, p=1 cần ~32 MiB; mặc định `maxmem` của Node cũng là 32 MiB
// nên phải nới ra, nếu không lời gọi sẽ ném lỗi "memory limit exceeded".
const PARAMS = { N: 32768, r: 8, p: 1 };
const KEY_LENGTH = 64;
const MAX_N = 1 << 17;

function scrypt(password, salt, { N, r, p }) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: 256 * N * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Băm mật khẩu, kết quả tự mang theo tham số: `scrypt$N$r$p$salt$hash`. */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

/** @returns {Promise<boolean>} */
export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (N < 2 || N > MAX_N || r < 1 || r > 16 || p < 1 || p > 4) return false;
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (expected.length !== KEY_LENGTH) return false;
  const actual = await scrypt(password, salt, { N, r, p });
  return crypto.timingSafeEqual(actual, expected);
}

// Dùng khi email không tồn tại, để thời gian phản hồi giống hệt trường hợp sai mật khẩu.
let dummyHash;
export async function verifyAgainstDummy(password) {
  dummyHash ??= await hashPassword(crypto.randomBytes(16).toString('hex'));
  await verifyPassword(password, dummyHash);
  return false;
}
