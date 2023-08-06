import { Context, Schema, h } from 'koishi'
import { Midjourney } from "midjourney";

export const name = 'midjourney-discord'
export const usage = `## 🎮 使用

- 使用魔法，搞到配置项
- 启动插件，等待 Koishi 的指令出现
- 若控制台出现 \`TypeError: fetch failed\`，重启插件即可
- 如出错，重试任务即可
- 建议为各指令添加合适的指令别名

## 配置

- [配置项获取教程](https://github.com/erictik/midjourney-api/blob/main/README_zh.md#%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B)

- \`ServerId\` - Midjourney 的 Discord 服务器的 ID
- \`ChannelId\` - Midjourney 的 Discord 频道的 ID
- \`SalaiToken\` - Discord 的授权令牌。

## 📝 命令

- \`mj\`：查看 Midjourney 帮助。
- \`mj.clear\`：清空 MJ 任务表。
- \`mj.info\`：查看 MJ 信息。
- \`mj.parameterList\`：查看 MJ 参数列表。
- \`mj.imagine <prompt>\`：根据文字提示 \`<prompt>\` 绘制一张图片。
- \`mj.reroll <taskId>\`：重新绘制任务 \`<taskId>\` 的图片。
- \`mj.upscale <taskId> <index>\`：放大任务 \`<taskId>\` 的图片中的某一部分，\`<index>\` 可以是 1、2、3 或 4，分别对应图片的左上、右上、左下和右下四个区域。
- \`mj.variation <taskId> <index>\`：变换任务 \`<taskId>\` 的图片中的某一部分，\`<index>\` 可以是 1、2、3 或 4，分别对应图片的左上、右上、左下和右下四个区域。
- \`mj.vary <taskId> <index>\`：在放大后再变换任务 \`<taskId>\` 的图片中的某一部分，\`<index>\` 可以是 1 或 2，分别对应 Vary (Strong) 和 Vary (Subtle) 两种变换方式。
- \`mj.zoomout <taskId> <level>\`：拉远任务 \`<taskId>\` 的图片，使其显示更多背景细节，\`<level>\` 可以是 "high"、"low"、"2x" 或 "1.5x"，分别对应不同的拉远程度。

每次使用以上命令时，都会生成一个新的任务 ID，并将其保存在数据库中。

您可以使用该 ID 来对同一张图片进行不同的操作。

每张图片都会显示其对应的文字提示和任务 ID。

## 🌠 后续计划

- ⬆️、⬇️、⬅️、➡️
- 由于本神尊使用传说中的猫猫适配器，所以获取不到（我也不造）可用的图片 url，所以 blend、describe、faceSwap 等功能无法测试，就没...`

// ServerId ChannelId SalaiToken
export interface Config {
  ServerId: string
  ChannelId: string
  SalaiToken: string
}

export const Config: Schema<Config> = Schema.object({
  ServerId: Schema.string().required(),
  ChannelId: Schema.string().required(),
  SalaiToken: Schema.string().required(),
})

// TypeScript 用户需要进行类型合并
declare module 'koishi' {
  interface Tables {
    midjourney_tasks: MidjourneyTasks
  }
}

export interface MidjourneyTasks {
  id: number
  userId: string
  taskId: string
  taskHash: string
  taskFlags: number
  taskPrompt: string
  varyStrong: string
  varySubtle: string
}



export async function apply(ctx: Context, config: Config) {
  // 拓展表
  extendAllTables(ctx)

  // 获取客户端
  const client = await initClient(config.ServerId, config.ChannelId, config.SalaiToken)

  // 注册指令 - mj imagine reroll upscale variation vary zoomout blend describe shorten
  registerAllKoishiCommands(ctx, client)

  // 消除副作用
  ctx.on('dispose', () => {
    // 在插件停用时关闭客户端
    client.Close();
  })

}
function extendAllTables(ctx: Context) {
  ctx.model.extend('midjourney_tasks', {
    // 各字段类型
    id: 'unsigned',
    userId: 'string',
    taskId: 'string',
    taskHash: 'string',
    taskFlags: 'integer',
    taskPrompt: 'string',
  }, {
    // 使用自增的主键值
    autoInc: true,
  })
}

function registerAllKoishiCommands(ctx: Context, client: Midjourney) {
  // 表 ID
  const MJ_TASKS_ID = 'midjourney_tasks';
  // 消息
  const message = {
    received: '嗯~',
    error: '傻瓜~ 出错了啦 ~~ 重试一下？',
    noSuchMethod: '该任务可能没有此方法哦~',
    cleared: '任务清理成功！',
  } as const;

  // mj
  ctx.command('mj', '查看 Midjourney 帮助')
    .action(({ session }) => {
      session.execute(`mj -h`)
    })
  // clear
  ctx.command('mj.clear', '清空 MJ 任务表')
    .action(async () => {
      await ctx.model.remove(MJ_TASKS_ID, {})
      return message.cleared
    })
  // info
  ctx.command('mj.info', '查看 MJ 信息')
    .action(async () => {
      try {
        const msg = await client.Info();
const formattedMsg = `
订阅类型: ${msg.subscription}
作业模式: ${msg.jobMode}
可见性模式: ${msg.visibilityMode}
剩余快速作业时间: ${msg.fastTimeRemaining}
终身使用量: ${msg.lifetimeUsage}
休闲使用量: ${msg.relaxedUsage}
快速作业队列: ${msg.queuedJobsFast}
休闲作业队列: ${msg.queuedJobsRelax}
正在运行的作业数: ${msg.runningJobs}
`;
        return formattedMsg
      } catch (error) {
        return message.error
      }
    })
  // 参数列表
  ctx.command('mj.parameterList', '查看 MJ 参数列表')
    .action(async () => {
      return `📗 参数列表
1. --ar 横纵比 n:n 默认1:1。用于指定绘制图像的横纵比。
2. --chaos <number 0–100> 变化程度，数值越高结果越不寻常和意想不到。用于控制图像的抽象程度。
3. --fast 使用快速模式运行单个任务。加快任务完成速度，但可能降低图像质量。
4. --iw <0–2> 设置图像提示权重相对于文本权重，默认值为1。用于控制图像与文本提示之间的权重分配。
5. --no 反向提示，例如 --no plants 会尝试从图像中移除植物。用于在图像中排除某些元素。
6. --q 清晰度 .25 .5 1 分别代表: 一般,清晰,高清，默认1。控制图像的清晰度，较高的值会提高图像质量，但可能需要更长的处理时间。
7. --relax 使用放松模式运行单个任务。在较短的时间内生成较为轻松的图像。
8. --seed <0–4294967295> 用于生成初始图像网格的种子数，相同的种子数和提示将产生相似的最终图像。用于控制图像的随机性。
9. --stop <10–100> 在过程中部分完成任务，较早停止的任务可能产生模糊、细节较少的结果。用于在图像生成过程中提前停止，以节省时间。
10. --style <raw, 4a, 4b, 4c, cute, expressive, original, scenic> 切换不同的Midjourney模型版本和Niji模型版本。选择不同的绘画风格。
11. --s 风格化 1-1000 影响默认美学风格在任务中的应用程度。用于调整风格强度。
12. --tile 生成可用于创建无缝图案的重复图块的图像。生成可用于平铺的图像。
13. --turbo 使用涡轮模式运行单个任务。加快任务完成速度，但可能降低图像质量。
14. --weird <0–3000> 使用实验性参数 --weird 探索不寻常的美学。生成具有独特风格的图像。
15. --version <1, 2, 3, 4, 5, 5.1, or 5.2> 使用不同版本的Midjourney算法。选择不同的绘画算法版本。
16. --niji 使用专注于动漫风格图像的替代模型。生成具有日本动漫风格的图像。`
    })
  // imagine
  ctx.command('mj.imagine <prompt:text>', '绘图')
    .action(async ({ session }, prompt) => {
      if (!prompt) {
        return
      }
      await session.send(message.received)

      // 使用 Imagine 方法生成一张图片
      const result = await client.Imagine(prompt);
      // 判断是否生成成功
      if (!result) {
        return message.error
      }

      await ctx.model.create(MJ_TASKS_ID, { userId: session.userId, taskId: result.id, taskHash: result.hash, taskFlags: result.flags, taskPrompt: prompt })
      await session.send(`${h.at(session.userId)}\n${h.image(result.proxy_url)}\n提示词：${prompt}\n\n任务Id：${result.id}`)
    })
  // reroll
  ctx.command('mj.reroll <taskId:string>', '重新绘制')
    .action(async ({ session }, taskId: string) => {
      if (!taskId) {
        return
      }
      const taskInfo = await ctx.model.get(MJ_TASKS_ID, { taskId: taskId })
      await session.send(message.received)
      try {
        const result = await client.Reroll({
          msgId: taskInfo[0].taskId,
          hash: taskInfo[0].taskHash,
          flags: taskInfo[0].taskFlags,
        });
        await ctx.model.create(MJ_TASKS_ID, { userId: session.userId, taskId: result.id, taskHash: result.hash, taskFlags: result.flags, taskPrompt: taskInfo[0].taskPrompt })
        await session.send(`${h.at(session.userId)}\n${h.image(result.proxy_url)}\n提示词：${taskInfo[0].taskPrompt}\n\n任务Id：${result.id}`)
      } catch (error) {
        return message.noSuchMethod
      }
    })
  // upscale
  ctx.command('mj.upscale <taskId:string> <index:number>', '放大')
    .action(async ({ session }, taskId: string, index: 1 | 2 | 3 | 4) => {
      if (!taskId) {
        return
      }
      // 检查 index 是否是一个有效的数字
      if (![1, 2, 3, 4].includes(index)) {
        await session.send('请提供有效的索引(1、2、3或4)。');
        return;
      }
      const taskInfo = await ctx.model.get(MJ_TASKS_ID, { taskId: taskId })
      await session.send(message.received)
      try {
        const result = await client.Upscale({
          index: index,
          msgId: taskInfo[0].taskId as string,
          hash: taskInfo[0].taskHash,
          flags: taskInfo[0].taskFlags,
        });
        await ctx.model.create(MJ_TASKS_ID, { userId: session.userId, taskId: result.id, taskHash: result.hash, taskFlags: result.flags, taskPrompt: taskInfo[0].taskPrompt })
        await session.send(`${h.at(session.userId)}\n${h.image(result.proxy_url)}\n提示词：${taskInfo[0].taskPrompt}\n\n任务Id：${result.id}`)
      } catch (error) {
        return message.noSuchMethod
      }
    })
  // variation
  ctx.command('mj.variation <taskId:string> <index:number>', '变换')
    .action(async ({ session }, taskId: string, index: 1 | 2 | 3 | 4) => {
      if (!taskId) {
        return
      }
      // 检查 index 是否是一个有效的数字
      if (![1, 2, 3, 4].includes(index)) {
        await session.send('请提供有效的索引(1、2、3或4)。');
        return;
      }
      const taskInfo = await ctx.model.get(MJ_TASKS_ID, { taskId: taskId })
      await session.send(message.received)
      try {
        const result = await client.Variation({
          index: index,
          msgId: taskInfo[0].taskId,
          hash: taskInfo[0].taskHash,
          flags: taskInfo[0].taskFlags,
        });
        await ctx.model.create(MJ_TASKS_ID, { userId: session.userId, taskId: result.id, taskHash: result.hash, taskFlags: result.flags, taskPrompt: taskInfo[0].taskPrompt })
        await session.send(`${h.at(session.userId)}\n${h.image(result.proxy_url)}\n提示词：${taskInfo[0].taskPrompt}\n\n任务Id：${result.id}`)
      } catch (error) {
        return message.noSuchMethod
      }
    })
  // vary
  ctx.command('mj.vary <taskId:string> <index:number>', '放大后的再变换')
    .action(async ({ session }, taskId: string, index: 1 | 2 | 3 | 4) => {
      if (!taskId) {
        return
      }
      // 检查 index 是否是一个有效的数字
      if (![1, 2].includes(index)) {
        await session.send('请提供有效的索引(1、2)。\n1：Vary (Strong:强大)\n2：Vary (Subtle:微妙)');
        return;
      }
      const taskInfo = await ctx.model.get(MJ_TASKS_ID, { taskId: taskId })
      if (!taskInfo[0].varyStrong || !taskInfo[0].varySubtle) {
        return message.noSuchMethod
      }
      let customId: string;
      if (index === 1) {
        customId = taskInfo[0].varyStrong
      } else {
        customId = taskInfo[0].varySubtle
      }
      await session.send(message.received)
      try {
        const result = await client.Custom({
          msgId: taskInfo[0].taskId,
          flags: taskInfo[0].taskFlags,
          customId: customId,
        });
        await ctx.model.create(MJ_TASKS_ID, { userId: session.userId, taskId: result.id, taskHash: result.hash, taskFlags: result.flags, taskPrompt: taskInfo[0].taskPrompt })
        await session.send(`${h.at(session.userId)}\n${h.image(result.proxy_url)}\n提示词：${taskInfo[0].taskPrompt}\n\n任务Id：${result.id}`)
      } catch (error) {
        return message.noSuchMethod
      }
    })
  // zoomout
  ctx.command('mj.zoomout <taskId:string> <level:string>', '拉远')
    .action(async ({ session }, taskId: string, level: "high" | "low" | "2x" | "1.5x") => {
      if (!taskId) {
        return
      }
      // 检查 level 是否是一个有效的字符串
      if (!["high", "low", "2x", "1.5x"].includes(level)) {
        await session.send('请提供有效的 level 参数 ("high", "low", "2x", "1.5x")。');
        return;
      }
      const taskInfo = await ctx.model.get(MJ_TASKS_ID, { taskId: taskId })
      await session.send(message.received)
      try {
        const result = await client.ZoomOut({
          level: level,
          msgId: taskInfo[0].taskId,
          hash: taskInfo[0].taskHash,
          flags: taskInfo[0].taskFlags,
        });
        await ctx.model.create(MJ_TASKS_ID, { userId: session.userId, taskId: result.id, taskHash: result.hash, taskFlags: result.flags, taskPrompt: taskInfo[0].taskPrompt })
        await session.send(`${h.at(session.userId)}\n${h.image(result.proxy_url)}\n提示词：${taskInfo[0].taskPrompt}\n\n任务Id：${result.id}`)
      } catch (error) {
        return message.noSuchMethod
      }
    })
}

async function initClient(SERVER_ID: string, CHANNEL_ID: string, SALAI_TOKEN: string) {
  const client = new Midjourney({
    ServerId: SERVER_ID,
    ChannelId: CHANNEL_ID,
    SalaiToken: SALAI_TOKEN,
    Debug: false,
    Ws: true,
  });
  await client.init();
  return client
}

// 定义一个通用的获取选项函数，用于根据标签获取自定义ID
const getOption = (options: any[], label: string) => {
  return options?.find((o) => o.label === label)?.custom;
};
