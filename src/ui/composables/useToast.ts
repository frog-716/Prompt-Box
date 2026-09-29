/**
 * 轻量提示。
 *
 * 只做一件事：给用户一句「刚才那下成了没有」的反馈。
 * 不弹窗、不阻塞操作。
 */

import { ref } from 'vue';

import { COPY_FEEDBACK_MS } from '@/shared/constants';

export type ToastTone = 'info' | 'error';

export function useToast() {
  const message = ref('');
  const tone = ref<ToastTone>('info');
  let timer: ReturnType<typeof setTimeout> | undefined;

  function show(text: string, options: { tone?: ToastTone; duration?: number } = {}): void {
    message.value = text;
    tone.value = options.tone ?? 'info';
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      message.value = '';
    }, options.duration ?? COPY_FEEDBACK_MS);
  }

  return { message, tone, show };
}
