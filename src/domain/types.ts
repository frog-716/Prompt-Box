/**
 * 领域模型定义。
 *
 * 这一层是纯类型，不引入任何浏览器 API，也不依赖 Vue。
 * 上层（infra / ui）依赖它，它不依赖任何上层。
 */

/** 一条提示词。 */
export interface Prompt {
  id: string;
  title: string;
  content: string;
  /** 所属文件夹；null 表示未归类。 */
  folderId: string | null;
  /** 已归一化的标签（小写、去重、无 # 前缀）。 */
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

/** 一个文件夹。文件夹是单层结构，不支持嵌套。 */
export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

/** 落盘到 chrome.storage.local 的完整数据快照。 */
export interface PromptBoxData {
  version: number;
  prompts: Prompt[];
  folders: Folder[];
}

/** 新建或编辑提示词时，界面提交的字段。 */
export interface PromptDraft {
  title: string;
  content: string;
  folderId: string | null;
  tags: string[];
}

/** 标签及其被引用次数，用于渲染筛选栏。 */
export interface TagStat {
  name: string;
  count: number;
}

/** 列表当前的筛选条件。 */
export interface PromptFilter {
  query: string;
  folderId: string | null | 'all';
  tags: string[];
}
