import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7010,      // ← 指定端口
    strictPort: true // ← 7010被占用时直接报错（可选）
    // open: true     // ← 启动后自动打开浏览器（可选）
  }
})
