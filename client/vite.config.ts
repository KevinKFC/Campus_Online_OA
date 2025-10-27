import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7010,           // 指定端口
    host: true,           // 监听所有网络接口
    strictPort: true,     // 端口占用时直接报错
    hmr: {
      host: "test.cityflow.cn",  // HMR 设置
    },
    proxy: {
      // 代理 /api 到后端 API 服务器
      '/api': {
        target: 'http://localhost:4000',  // 后端 API 地址
        changeOrigin: true,   // 确保正确设置 CORS
        rewrite: (path) => path.replace(/^\/api/, '')  // 去掉 /api 前缀转发到后端
      },
      // 如果有其他 API 路径需要代理，继续添加
      '/submit': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/submit/, '')
      }
    }
  }
})
