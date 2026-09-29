/**
 * 全局常量。
 *
 * 凡是「写死在多处」的值都收敛到这里，避免魔法数字散落。
 */

/** chrome.storage.local 中存放全部数据的键。 */
export const STORAGE_KEY = 'promptBox';

/** 数据格式版本号，未来结构变更时用于迁移。 */
export const SCHEMA_VERSION = 1;

/** 复制成功后按钮反馈的停留时长（毫秒）。 */
export const COPY_FEEDBACK_MS = 1200;

/** 右键菜单项 id。 */
export const MENU_SAVE_SELECTION_ID = 'prompt-box-save-selection';

/** 通过右键菜单保存时，自动截取标题的最大长度。 */
export const AUTO_TITLE_MAX_LENGTH = 24;

/** 导出文件的命名前缀。 */
export const EXPORT_FILE_PREFIX = 'prompt-box-backup';
