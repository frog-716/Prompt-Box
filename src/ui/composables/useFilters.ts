/**
 * 筛选状态。
 *
 * 只负责「当前想看哪一批」，不碰数据本身。搜索、文件夹、标签三者
 * 可以叠加，标签之间是「与」关系（都命中才显示）。
 */

import { computed, ref, type Ref } from 'vue';

import { filterPrompts } from '@/domain/prompt';
import type { Prompt, PromptFilter } from '@/domain/types';

export type FolderSelection = string | null | 'all';

export function useFilters(prompts: Ref<Prompt[]>) {
  const query = ref('');
  const folderId = ref<FolderSelection>('all');
  const tags = ref<string[]>([]);

  const activeFilterCount = computed(
    () => (folderId.value === 'all' ? 0 : 1) + tags.value.length,
  );

  const visible = computed<Prompt[]>(() => {
    const filter: PromptFilter = {
      query: query.value,
      folderId: folderId.value,
      tags: tags.value,
    };
    return filterPrompts(prompts.value, filter);
  });

  function selectFolder(next: FolderSelection): void {
    folderId.value = folderId.value === next ? 'all' : next;
  }

  function toggleTag(tag: string): void {
    tags.value = tags.value.includes(tag)
      ? tags.value.filter((item) => item !== tag)
      : [...tags.value, tag];
  }

  function clearTags(): void {
    tags.value = [];
  }

  function reset(): void {
    query.value = '';
    folderId.value = 'all';
    tags.value = [];
  }

  return {
    query,
    folderId,
    tags,
    activeFilterCount,
    visible,
    selectFolder,
    toggleTag,
    clearTags,
    reset,
  };
}
