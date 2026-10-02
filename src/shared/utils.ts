/**
 * 通用工具函数。与业务无关，任何层都可以用。
 */

/** 生成唯一 id。crypto.randomUUID 是 Web 标准，浏览器与 Node 均可用。 */
export function createId(): string {
  return crypto.randomUUID();
}

/** 当前时间戳（毫秒）。集中一处，方便测试时替换。 */
export function timestamp(): number {
  return Date.now();
}

/** 把时间戳格式化成「2026-09-29 20:31」这样的短文本。 */
export function formatDateTime(value: number): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** 从一段文字里挑一个合适的标题：取第一行，过长则截断。 */
export function deriveTitle(content: string, maxLength: number): string {
  const firstLine = content.split('\n').find((line) => line.trim().length > 0) ?? '';
  const trimmed = firstLine.trim();
  if (!trimmed) return '未命名提示词';
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}…` : trimmed;
}
