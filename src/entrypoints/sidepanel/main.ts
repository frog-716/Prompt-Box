/**
 * 侧边栏入口。
 *
 * 只做挂载，不含业务逻辑 —— 所有逻辑都在 ui / composables / domain 里。
 */

import { createApp } from 'vue';

import '@/ui/styles/global.css';
import App from '@/ui/sidepanel/App.vue';

createApp(App).mount('#app');
