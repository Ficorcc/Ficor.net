// ============================================================================
// 密码哈希（WebCrypto PBKDF2）
// Workers 环境没有 Node 的 crypto.scrypt，用原生 WebCrypto SubtleCrypto。
// ============================================================================

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * 对明文密码做 PBKDF2 哈希，返回 `pbkdf2$iterations$saltHex$hashHex` 格式。
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc(password) as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    KEY_LENGTH * 8
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(new Uint8Array(bits))}`;
}

/**
 * 校验明文密码是否匹配哈希。
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;

  const iterations = parseInt(parts[1], 10);
  const salt = fromHex(parts[2]);
  const expectedHash = parts[3];

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc(password) as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    KEY_LENGTH * 8
  );
  const actualHash = toHex(new Uint8Array(bits));

  // 常量时间比较，防侧信道
  return constantTimeEqual(actualHash, expectedHash);
}

/**
 * 检查密码强度（基本的长度要求）。
 */
export function validatePasswordStrength(password: string): { ok: boolean; message?: string } {
  if (password.length < 8) {
    return { ok: false, message: '密码至少需要 8 个字符' };
  }
  return { ok: true };
}

// --- 辅助函数 ---

function enc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
