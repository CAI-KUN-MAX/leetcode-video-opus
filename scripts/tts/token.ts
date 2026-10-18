import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import RPCClient from '@alicloud/pop-core';

/**
 * NLS Token（有效期 24 小时）的获取与本地缓存。
 * 缓存放在 .cache/ 下，避免每次运行都调用 CreateToken。
 */

const CACHE_FILE = path.resolve(process.cwd(), '.cache', 'nls-token.json');
/** 提前 5 分钟视为过期，避免临界时间点拿到即将失效的 Token */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

interface CachedToken {
  token: string;
  /** Unix 毫秒时间戳 */
  expireAt: number;
}

interface CreateTokenResponse {
  Token?: {
    Id?: string;
    /** Unix 秒时间戳 */
    ExpireTime?: number;
  };
}

function readCachedToken(): string | null {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const cached = JSON.parse(raw) as CachedToken;
    if (
      typeof cached.token === 'string' &&
      cached.token.length > 0 &&
      typeof cached.expireAt === 'number' &&
      cached.expireAt - EXPIRY_MARGIN_MS > Date.now()
    ) {
      return cached.token;
    }
  } catch {
    // 文件不存在或内容损坏，直接重新获取
  }
  return null;
}

function writeCachedToken(token: string, expireAt: number): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    const payload: CachedToken = { token, expireAt };
    fs.writeFileSync(CACHE_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } catch (error) {
    // 缓存失败不影响主流程
    console.warn(`[token] 写入缓存失败：${String(error)}`);
  }
}

/**
 * 获取 NLS Token，优先读本地缓存。
 * @param options.forceRefresh 忽略缓存，强制重新获取
 */
export async function getNlsToken(
  options: { forceRefresh?: boolean } = {},
): Promise<string> {
  if (!options.forceRefresh) {
    const cached = readCachedToken();
    if (cached) {
      return cached;
    }
  }

  const accessKeyId = process.env.ALIYUN_AK_ID;
  const accessKeySecret = process.env.ALIYUN_AK_SECRET;
  const region = process.env.NLS_REGION || 'cn-shanghai';

  if (!accessKeyId || !accessKeySecret) {
    throw new Error('缺少 ALIYUN_AK_ID / ALIYUN_AK_SECRET，请检查 .env 文件');
  }

  const client = new RPCClient({
    accessKeyId,
    accessKeySecret,
    endpoint: `https://nls-meta.${region}.aliyuncs.com`,
    apiVersion: '2019-02-28',
  });

  const response = await client.request<CreateTokenResponse>('CreateToken', {});

  const token = response.Token?.Id;
  if (!token) {
    throw new Error(`CreateToken 未返回 Token：${JSON.stringify(response)}`);
  }

  const rawExpire = response.Token?.ExpireTime ?? 0;
  // 文档中是 Unix 秒，这里做一次容错：大于 1e12 视为毫秒
  const expireAt =
    rawExpire > 1e12 ? rawExpire : rawExpire > 0 ? rawExpire * 1000 : Date.now() + 23 * 60 * 60 * 1000;

  writeCachedToken(token, expireAt);
  return token;
}
