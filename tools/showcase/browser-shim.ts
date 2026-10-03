/** 组件预览用的最小浏览器外壳；不接触 Chrome 用户配置或扩展存储。 */
export const browser = {
  runtime: {
    openOptionsPage(): void {},
  },
};
