# koishi-plugin-midjourney-discord 🚀

[![npm](https://img.shields.io/npm/v/koishi-plugin-midjourney-discord?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-midjourney-discord)

## 🎈 介绍

这款插件将 Midjourney API 与 Koishi 结合，让您可以在多个平台上生成精美的图片！🎨

## 📦 安装

```
前往 Koishi 插件市场添加该插件即可
```
## 🎮 使用

- 使用魔法，搞到配置项
- 启动插件等待指令出现即可
- 建议为各指令添加合适的指令别名
- 控制台日志中的 `一言` 为自动重试记录

## 配置

- [配置项获取教程](https://github.com/erictik/midjourney-api/blob/main/README_zh.md#%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B)

- `ServerId` - Midjourney 的 Discord 服务器的 ID
- `ChannelId` - Midjourney 的 Discord 频道的 ID
- `SalaiToken` - Discord 的授权令牌。

## 📝 命令

- `mj`：查看 Midjourney 帮助。
- `mj.clear`：清空 MJ 任务表。
- `mj.info`：查看 MJ 信息。
- `mj.parameterList`：查看 MJ 参数列表。
- `mj.imagine <prompt>`：根据文字提示 `<prompt>` 绘制一张图片。
- `mj.blend <url1:string> <url2:string>`：融合。
- `mj.facewap <source:string> <target:string>`：换脸。
- `mj.shorten <prompt:text>`：优化提示。
- `mj.describe <url:text>`：描述一张图片。
- `mj.reroll <taskId>`：重新绘制任务 `<taskId>` 的图片。
- `mj.upscale <taskId> <index>`：放大任务 `<taskId>` 的图片中的某一部分，`<index>` 可以是 1、2、3 或 4，分别对应图片的左上、右上、左下和右下四个区域。
- `mj.variation <taskId> <index>`：变换任务 `<taskId>` 的图片中的某一部分，`<index>` 可以是 1、2、3 或 4，分别对应图片的左上、右上、左下和右下四个区域。
- `mj.vary <taskId> <index>`：变化比较任务 `<taskId>` 的图片中的某一部分，`<index>` 可以是 1 或 2，分别对应 Vary (Strong) 和 Vary (Subtle) 两种变换方式。
- `mj.zoomout <taskId> <level>`：拉远/扩展任务 `<taskId>` 的图片，使其显示更多背景细节，`<level>` 可以是  "2x" 或 "1.5x" 或 "custom" 分别对应不同的拉远程度。
- `mj.pan <taskId:string> <index:number>`：平移。

每次使用以上命令时，都会生成一个新的任务 ID，并将其保存在数据库中。

您可以使用该 ID 来对同一张图片进行不同的操作。

每张图片都会显示其对应的文字提示和任务 ID。

## 🌠 后续计划

- 自动图转 url
- 引用图片发送指令

## 🙏 致谢

* [Koishi](https://koishi.chat/) - 机器人框架
* [midjourney-api](https://github.com/erictik/midjourney-api) - 非官方的 MidJourney api 的 Node.js 客户端

## 📄 License

MIT License © 2023