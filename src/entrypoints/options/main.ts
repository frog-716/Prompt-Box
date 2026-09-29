/**
 * 设置页入口。
 *
 * 与侧边栏共用同一套 ui/composables 与 domain 逻辑，
 * 只是换了一个更宽敞的容器来承载「整理类」操作。
 */

import { createApp } from 'vue';

import '@/ui/styles/global.css';
import App from '@/ui/settings/App.vue';

createApp(App).mount('#app');
