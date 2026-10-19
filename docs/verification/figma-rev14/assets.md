# 本地视觉资产

字体取自用户提供的修订14设计目录 `fonts/`，OFL许可随同保存。Noto Sans SC用于中文正文，DM Sans用于拉丁正文，Fraunces用于字标和预览英文标题；`font-display: swap`。

14个SVG来自Figma get_design_context的实际资源URL，下载后未修改根节点、viewBox或path；AppIcon通过本地导入引用，并在调用处控制尺寸。人物、播放等图标不以表情代替。

| SVG           | 字节 | 原始尺寸 | viewBox     |
| ------------- | ---- | -------- | ----------- |
| `arrow.svg`   | 373  | 20×20    | `0 0 20 20` |
| `back.svg`    | 378  | 22×22    | `0 0 22 22` |
| `cards.svg`   | 486  | 20×20    | `0 0 20 20` |
| `chart.svg`   | 443  | 20×20    | `0 0 20 20` |
| `close.svg`   | 426  | 20×20    | `0 0 20 20` |
| `heart.svg`   | 869  | 19×19    | `0 0 19 19` |
| `info.svg`    | 877  | 20×20    | `0 0 20 20` |
| `play.svg`    | 390  | 20×20    | `0 0 20 20` |
| `plus.svg`    | 394  | 20×20    | `0 0 20 20` |
| `refresh.svg` | 784  | 20×20    | `0 0 20 20` |
| `speaker.svg` | 590  | 15×15    | `0 0 15 15` |
| `upload.svg`  | 429  | 20×20    | `0 0 20 20` |
| `user.svg`    | 1176 | 17×17    | `0 0 17 17` |
| `users.svg`   | 1148 | 20×20    | `0 0 20 20` |

App.vue使用cards、upload、users、chart；表头新增使用plus；用户头像占位使用user；统计使用refresh、arrow；导入说明使用info；预览使用back、heart、play、speaker。close保留为原稿资源，当前ElDialog关闭入口复用Element Plus。动态场景图和音频仍使用鉴权API，未将示例场景图绑定为业务占位。

浏览器巡检验证可见图片完成加载且naturalWidth大于0；构建产物包含本地字体和SVG，不依赖Figma临时URL。
