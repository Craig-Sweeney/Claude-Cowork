import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import pkg from 'node-machine-id';
const { machineIdSync } = pkg;

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits

/**
 * 生成基于机器 ID 的加密密钥
 * 使用机器唯一标识 + 盐值生成固定密钥
 */
function deriveKey(): Buffer {
  const machineId = machineIdSync(true); // 传入 true 获取原始机器ID
  const salt = 'open-claude-cowork-2026'; // 应用特定盐值
  
  // 使用 SHA-256 派生密钥
  return createHash('sha256')
    .update(machineId + salt)
    .digest();
}

/**
 * 加密字符串
 * @param plaintext 明文
 * @returns Base64 编码的加密数据（格式：iv:authTag:ciphertext）
 */
export function encryptString(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  // 组合格式：iv:authTag:ciphertext
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
}

/**
 * 解密字符串
 * @param encrypted 加密数据（Base64 格式）
 * @returns 明文字符串
 */
export function decryptString(encrypted: string): string {
  const key = deriveKey();
  
  const [ivB64, authTagB64, ciphertext] = encrypted.split(':');
  
  if (!ivB64 || !authTagB64 || !ciphertext) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');
  
  return plaintext;
}

/**
 * 检查加密是否可用
 */
export function isEncryptionAvailable(): boolean {
  try {
    const test = encryptString('test');
    const result = decryptString(test);
    return result === 'test';
  } catch {
    return false;
  }
}
