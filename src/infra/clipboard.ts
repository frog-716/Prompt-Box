/**
 * 剪贴板适配层。
 *
 * 这是 Prompt-Box 唯一「输出」提示词的方式：复制走，你自己粘贴到需要的地方。
 * 因此这里必须稳 —— 失败要如实返回 false，不能假装成功。
 */

/** 复制文本到剪贴板。返回是否成功。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopy(text);
  }
}

/**
 * 降级方案。
 *
 * navigator.clipboard 在少数场景下会因权限或焦点问题被拒，
 * 此时退回已被标记废弃、但兼容性最好的 execCommand。
 */
function legacyCopy(text: string): boolean {
  const holder = document.createElement('textarea');
  holder.value = text;
  holder.setAttribute('readonly', '');
  holder.style.position = 'fixed';
  holder.style.top = '-1000px';
  holder.style.opacity = '0';
  document.body.appendChild(holder);

  try {
    holder.select();
    return document.execCommand('copy');
  } catch (error) {
    console.error('[Prompt Box] 复制到剪贴板失败：', error);
    return false;
  } finally {
    holder.remove();
  }
}
