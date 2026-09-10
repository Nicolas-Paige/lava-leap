import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    plugins: [vue()],
    server: {
        open: true,
        host: true,
        proxy: {
            // 本地开发时将 /api 请求转发到 EdgeOne Function
            // 部署后不需要此配置，EdgeOne 会自动路由
            '/api': {
                target: 'https://game.andio.top',
                changeOrigin: true,
            },
        },
    },
    assetsInclude: ['**/*.glb', '**/*.mp4']
})
