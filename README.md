# GRE3000 Vocab App

本地网页背单词应用，使用 React + TypeScript + Vite。第一版实现阶段一、阶段二、阶段三，进度和错误计数保存在浏览器 `localStorage`。

## 数据来源

- Excel: `D:\桌面\LGU\GRE\3000-dev\3000.xlsx`
- 音频: `D:\桌面\LGU\GRE\3000-dev\3000_wav`
- 已生成数据: `src/data/vocab.ts`
- 已复制音频: `public/audio`

生成脚本会按表头 `R` 升序重排全部 3041 个词，并按 20 个词一组生成 153 组。

## 常用命令

```bash
npm install
npm run generate:data
npm run dev
npm run build
npm run lint
```

如果源 Excel 或 wav 有更新，重新运行：

```bash
npm run generate:data
```

## 本地运行

当前 dev server 可用地址：

```text
http://127.0.0.1:5173/
```
