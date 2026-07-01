# GRE3000 Vocab App

一个本地运行的 GRE 词汇背诵网页应用。界面参考 Anki 的卡片式学习体验，支持桌面端和手机端自适应，词表进度、错题次数和阶段记录都保存在浏览器 `localStorage` 中。

![Home](docs/screenshots/home.png)

## GitHub Description 建议

可以把 GitHub 仓库右侧 About 里的 Description 写成：

```text
An Anki-style local GRE vocabulary trainer built with React, TypeScript and Vite.
```

如果想用中文，也可以写：

```text
本地运行的 Anki 风格 GRE 词汇背诵网页应用，支持发音、选择题复习、错题统计和词典搜索。
```

推荐 Topics：

```text
gre, vocabulary, react, typescript, vite, anki-style, localstorage
```

## 功能介绍

- 使用全部 3041 个 GRE 词汇，按 Excel 的 `R` 列乱序排序。
- 每 20 个词为一组，最后一组不足 20 个。
- 阶段一：显示单词、音标、中文释义、英文释义，并自动播放新词发音。
- 阶段二：显示单词和 4 个中文释义选项，答错后显示正确释义和英文释义。
- 阶段三：只复习已经通过阶段二的词，可按错误次数筛选或按错误次数倒序复习。
- 上一个单词区域支持查看释义和重新播放发音。
- 主页内置词典搜索，可快速查询单词、释义、发音、所在组和错误次数。
- 所有学习进度保存在本机浏览器中，不需要账号或网络服务。

## 截图教学

### 1. 从主页开始学习

主页会显示总词数、已通过阶段二的词数、已完成组数，以及阶段一/二、阶段三和词典入口。

![Home](docs/screenshots/home.png)

点击 **继续下一组** 会从还没完成的组开始；点击 **重背所选组** 可以重新背诵指定组。

### 2. 阶段一：建立单词和释义的视觉绑定

阶段一左侧显示单词和发音按钮，右侧直接显示中文释义。这样的布局用于把单词词形和中文含义放在同一个视觉区域里，方便建立记忆关联。

![Stage One](docs/screenshots/stage-one.png)

操作方式：

1. 听系统自动播放的新词发音。
2. 看左侧单词和右侧中文释义。
3. 需要时点击喇叭按钮重复发音。
4. 点击 **下一个** 进入下一词。
5. 本组背完后自动进入阶段二。

### 3. 阶段二：中文释义选择题

阶段二只显示单词和 4 个中文释义选项。每次进入下一个单词时会自动播放发音。

![Stage Two](docs/screenshots/stage-two.png)

操作方式：

1. 看单词，听发音。
2. 从 4 个中文释义中选择正确答案。
3. 选对后自动进入下一个词。
4. 选错后显示正确中文释义和英文释义，并把该词错误次数加 1。
5. 本组结束后会重测本组错词，直到全部正确。

顶部的 **上一个单词** 区域可以回看上一词的中英文释义，也可以点击小喇叭重新听上一词发音。

### 4. 使用词典搜索

主页的词典栏目可以直接搜索单词、中文释义或英文释义。点击结果或 **打开完整词典** 可以进入详细查询页。

![Dictionary](docs/screenshots/dictionary.png)

词典页会显示：

- 单词和发音
- UK / US 音标
- 中文释义
- 英文释义
- 所在组
- 全局序号
- 当前错误次数

## 本地运行

```bash
npm install
npm run dev
```

默认访问地址：

```text
http://127.0.0.1:5173/
```

构建生产版本：

```bash
npm run build
```

代码检查：

```bash
npm run lint
```

## 数据生成

源数据默认来自：

```text
D:\桌面\LGU\GRE\3000-dev\3000.xlsx
D:\桌面\LGU\GRE\3000-dev\3000_wav
```

重新生成静态词表和复制音频：

```bash
npm run generate:data
```

生成结果：

- `src/data/vocab.ts`
- `public/audio/*.wav`

当前仓库已经包含生成后的词表数据和音频文件，因此 clone 后可以直接运行。

## 技术栈

- React
- TypeScript
- Vite
- lucide-react
- localStorage

## 注意事项

- 学习进度只保存在当前浏览器中，清除浏览器数据会丢失进度。
- 这是本机网页版本，不包含账号、云同步、后端服务或远程部署。
- 如果公开仓库，请确认词表和音频素材有公开分享权限。
