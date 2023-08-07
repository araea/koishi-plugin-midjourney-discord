import { Context, Logger, Schema, h, is } from 'koishi'
import { MJOptions, Midjourney } from "midjourney";

export const name = 'midjourney-discord'
export const logger = new Logger('Midjourney')
export const usage = `## 🎮 使用

- 订阅 Midjourney 会员
- 根据配置项获取教程填写配置项
- 启动插件等待指令出现即可
- 建议为各指令添加合适的指令别名
- 控制台日志中的 \`一言\` 为自动重试记录

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
- \`mj.blend <url1:string> <url2:string>\`：融合。
- \`mj.facewap <source:string> <target:string>\`：换脸。
- \`mj.shorten <prompt:text>\`：优化提示。
- \`mj.describe <url:text>\`：描述一张图片。
- \`mj.reroll <taskId>\`：重新绘制任务 \`<taskId>\` 的图片。
- \`mj.upscale <taskId> <index>\`：放大任务 \`<taskId>\` 的图片中的某一部分，\`<index>\` 可以是 1、2、3 或 4，分别对应图片的左上、右上、左下和右下四个区域。
- \`mj.variation <taskId> <index>\`：变换任务 \`<taskId>\` 的图片中的某一部分，\`<index>\` 可以是 1、2、3 或 4，分别对应图片的左上、右上、左下和右下四个区域。
- \`mj.vary <taskId> <index>\`：变化比较任务 \`<taskId>\` 的图片中的某一部分，\`<index>\` 可以是 1 或 2，分别对应 Vary (Strong) 和 Vary (Subtle) 两种变换方式。
- \`mj.zoomout <taskId> <level>\`：拉远/扩展任务 \`<taskId>\` 的图片，使其显示更多背景细节，\`<level>\` 可以是  "2x" 或 "1.5x" 或 "custom" 分别对应不同的拉远程度。
- \`mj.pan <taskId:string> <index:number>\`：平移。

每次使用以上命令时，都会生成一个新的任务 ID，并将其保存在数据库中。

您可以使用该 ID 来对同一张图片进行不同的操作。

每张图片都会显示其对应的文字提示和任务 ID。

## 🌠 后续计划

- 自动图转 url
- 引用图片发送指令
`

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
  options: MJOptions[]
}



export async function apply(ctx: Context, config: Config) {
  // 拓展表
  extendAllTables(ctx)

  // 使用重试函数来初始化客户端
  const client = await retry(() => initClient(config.ServerId, config.ChannelId, config.SalaiToken));

  // 注册指令 - mj imagine blend facewap shorten describe reroll upscale variation vary zoomout pan 
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
    options: 'json'
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
    invalidUrl: '请输入有效的 url！'
  } as const;

  // mj
  ctx.command('mj', '查看 Midjourney 帮助')
    .action(({ session }) => {
      session.execute(`mj -h`)
    })
  // clear
  ctx.command('mj.clear', '清空任务表')
    .action(async () => {
      await ctx.model.remove(MJ_TASKS_ID, {})
      return message.cleared
    })
  // info
  ctx.command('mj.info', '查看 Info 信息')
    .action(async ({ session }) => {
      try {
        await session.send(message.received)
        // 使用async/await语法
        const obj = await retry(() => client.Info());
        // 使用Object.entries()方法
        let entries = Object.entries(obj);
        // 定义一个字典，将英文的属性名替换成中文的属性名
        const dict = {
          subscription: '订阅类型',
          jobMode: '工作模式',
          visibilityMode: '可见性模式',
          fastTimeRemaining: '快速模式剩余时间',
          lifetimeUsage: '总使用量',
          relaxedUsage: '放松模式使用量',
          queuedJobsFast: '快速模式排队任务数',
          queuedJobsRelax: '放松模式排队任务数',
          runningJobs: '正在运行的任务'
        };
        // 使用String.prototype.replace()方法的第二个参数为一个函数
        // 使用字符串插值
        let text = entries.map(([key, value]) => {
          return `${dict[key]}：${value.replace(/<t:(\d+)>/, (match: any, p1: number) => {
            // 使用Date.prototype.toLocaleDateString()方法
            return `<t:${new Date(p1 * 1000).toLocaleDateString()}>`;
          })}`;
        }).join('\n');
        return text;
      } catch (error) {
        return message.error;
      }



    })
  // 参数列表
  ctx.command('mj.parameterList', '参数列表')
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
      const result = await retry(() => client.Imagine(prompt))
      // 判断是否生成成功
      if (!result) {
        return message.error
      }

      await ctx.model.create(MJ_TASKS_ID, { userId: session.userId, taskId: result.id, taskHash: result.hash, taskFlags: result.flags, taskPrompt: prompt, options: result.options })
      await sendMsg(session, session.userId, result.proxy_url, prompt, result.id)
    })
  // blend
  ctx.command('mj.blend <url1:string> <url2:string>', '融合')
    .action(async ({ session }, url1, url2) => {
      if (!url1 || !url2 || !isValidUrl(url1) || !isValidUrl(url2)) {
        return message.invalidUrl
      }
      await session.send(message.received)

      // 使用 Imagine 方法生成一张图片
      const result = await retry(() => client.Imagine(`${url1} ${url2}`))
      // 判断是否生成成功
      if (!result) {
        return message.error
      }

      await ctx.model.create(MJ_TASKS_ID, { userId: session.userId, taskId: result.id, taskHash: result.hash, taskFlags: result.flags, taskPrompt: `${url1} ${url2}`, options: result.options })
      await sendMsg(session, session.userId, result.proxy_url, `${url1} ${url2}`, result.id)
    })
  // facewap
  ctx.command('mj.facewap <source:string> <target:string>', '换脸')
    .action(async ({ session }, source, target) => {
      if (!source || !target || !isValidUrl(source) || !isValidUrl(target)) {
        return message.invalidUrl
      }
      await session.send(message.received)

      // 使用 Imagine 方法生成一张图片
      const result = await retry(() => client.FaceSwap(target, source))
      // 判断是否生成成功
      if (!result) {
        return message.error
      }
      await session.send(h.image(result.proxy_url))
    })
  // shorten
  ctx.command('mj.shorten <prompt:text>', '优化提示')
    .action(async ({ session }, prompt) => {
      if (!prompt) {
        return
      }
      await session.send(message.received)

      // 使用 Imagine 方法生成一张图片
      const result = await retry(() => client.Shorten(prompt))
      // 判断是否生成成功
      if (!result) {
        return message.error
      }
      return `${h.at(session.userId)} ~\n优化提示成功！\n优化后的提示词：\n${result.prompts.join("\n")}`;
    })
  // describe
  ctx.command('mj.describe <url:text>', '描述一张图片')
    .action(async ({ session }, url) => {


      if (!url || !isValidUrl(url)) {
        return message.invalidUrl
      }


      await session.send(message.received)

      // 使用 Imagine 方法生成一张图片
      const result = await retry(() => client.Describe(url))
      // 判断是否生成成功
      if (!result) {
        return message.error
      }
      return `${h.at(session.userId)} ~\n描述成功！\n${result.descriptions.join("\n")}`;
    })
  // reroll
  ctx.command('mj.reroll <taskId:string>', '重新绘制')
    .action(async ({ session }, taskId: string) => {
      if (!taskId) {
        return
      }
      const taskInfo = await ctx.model.get(MJ_TASKS_ID, { taskId: taskId })
      await session.send(message.received)
      const rerollCustomID = taskInfo[0].options?.find((o) => o.label === "🔄")?.custom;
      if (!rerollCustomID) {
        return message.noSuchMethod
      }
      const result = await retry(() => client.Custom({
        msgId: taskInfo[0].taskId,
        customId: rerollCustomID,
        flags: taskInfo[0].taskFlags,
      }))
      await ctx.model.create(MJ_TASKS_ID, { userId: session.userId, taskId: result.id, taskHash: result.hash, taskFlags: result.flags, taskPrompt: taskInfo[0].taskPrompt, options: result.options })
      await sendMsg(session, session.userId, result.proxy_url, taskInfo[0].taskPrompt, result.id)
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
      const upscaleCustomID = taskInfo[0].options?.find((o) => o.label === `U${index}`)?.custom;
      if (!upscaleCustomID) {
        return message.noSuchMethod
      }
      const result = await retry(() => client.Custom({
        msgId: taskInfo[0].taskId as string,
        customId: upscaleCustomID,
        flags: taskInfo[0].taskFlags,
      }))
      await ctx.model.create(MJ_TASKS_ID, { userId: session.userId, taskId: result.id, taskHash: result.hash, taskFlags: result.flags, taskPrompt: taskInfo[0].taskPrompt, options: result.options })
      await sendMsg(session, session.userId, result.proxy_url, taskInfo[0].taskPrompt, result.id)
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
      const variationCustomID = taskInfo[0].options?.find((o) => o.label === `V${index}`)?.custom;
      if (!variationCustomID) {
        return message.noSuchMethod
      }
      const result = await retry(() => client.Custom({
        msgId: taskInfo[0].taskId,
        customId: variationCustomID,
        flags: taskInfo[0].taskFlags,
      }))
      await ctx.model.create(MJ_TASKS_ID, { userId: session.userId, taskId: result.id, taskHash: result.hash, taskFlags: result.flags, taskPrompt: taskInfo[0].taskPrompt, options: result.options })
      await sendMsg(session, session.userId, result.proxy_url, taskInfo[0].taskPrompt, result.id)
    })
  // vary
  ctx.command('mj.vary <taskId:string> <index:number>', '变化比较')
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
      let customName: string;
      if (index === 1) {
        customName = 'Vary (Strong)'
      } else {
        customName = 'Vary (Subtle)'
      }
      await session.send(message.received)
      const varyCustomID = taskInfo[0].options?.find((o) => o.label === `${customName}`)?.custom;
      if (!varyCustomID) {
        return message.noSuchMethod
      }
      const result = await retry(() => client.Custom({
        msgId: taskInfo[0].taskId,
        customId: varyCustomID,
        flags: taskInfo[0].taskFlags,
      }))
      await ctx.model.create(MJ_TASKS_ID, { userId: session.userId, taskId: result.id, taskHash: result.hash, taskFlags: result.flags, taskPrompt: taskInfo[0].taskPrompt, options: result.options })
      await sendMsg(session, session.userId, result.proxy_url, taskInfo[0].taskPrompt, result.id)
    })
  // zoomout
  ctx.command('mj.zoomout <taskId:string> <level:string>', '拉远/扩展')
    .action(async ({ session }, taskId: string, level: "2x" | "1.5x" | "custom") => {
      if (!taskId) {
        return
      }
      // 检查 level 是否是一个有效的字符串
      if (!["2x", "1.5x", "custom"].includes(level)) {
        await session.send('请提供有效的 level 参数 ("2x", "1.5x", ""custom"")。');
        return
      }
      const taskInfo = await ctx.model.get(MJ_TASKS_ID, { taskId: taskId })
      let customName: string;
      if (level === '2x') {
        customName = 'Zoom Out 2x'
      } else if (level === '1.5x') {
        customName = 'Zoom Out 1.5x'
      } else {
        customName = 'Custom Zoom'
      }
      await session.send(message.received)
      const zoomoutCustomID = taskInfo[0].options?.find((o) => o.label === `${customName}`)?.custom;
      if (!zoomoutCustomID) {
        return message.noSuchMethod
      }
      const result = await retry(() => client.Custom({
        msgId: taskInfo[0].taskId,
        customId: zoomoutCustomID,
        flags: taskInfo[0].taskFlags,
      }))
      await ctx.model.create(MJ_TASKS_ID, { userId: session.userId, taskId: result.id, taskHash: result.hash, taskFlags: result.flags, taskPrompt: taskInfo[0].taskPrompt, options: result.options })
      await sendMsg(session, session.userId, result.proxy_url, taskInfo[0].taskPrompt, result.id)
    })

  // pan
  ctx.command('mj.pan <taskId:string> <index:number>', '平移')
    .action(async ({ session }, taskId: string, index: 1 | 2 | 3 | 4) => {
      if (!taskId) {
        return
      }
      // 检查 index 是否是一个有效的数字
      if (![1, 2, 3, 4].includes(index)) {
        await session.send('请提供有效的索引(1、2、3或4)。\n1：⬆️\n2：⬇️\n3：⬅️\n4：➡️');
        return;
      }
      const taskInfo = await ctx.model.get(MJ_TASKS_ID, { taskId: taskId })
      let customName: string;
      if (index === 1) {
        customName = '⬆️'
      } else if (index === 2) {
        customName = '⬇️'
      } else if (index === 3) {
        customName = '⬅️'
      } else {
        customName = '➡️'
      }
      await session.send(message.received)
      const panCustomID = taskInfo[0].options?.find((o) => o.label === `${customName}`)?.custom;
      if (!panCustomID) {
        return message.noSuchMethod
      }
      const result = await retry(() => client.Custom({
        msgId: taskInfo[0].taskId,
        customId: panCustomID,
        flags: taskInfo[0].taskFlags,
      }))
      await ctx.model.create(MJ_TASKS_ID, { userId: session.userId, taskId: result.id, taskHash: result.hash, taskFlags: result.flags, taskPrompt: taskInfo[0].taskPrompt, options: result.options })
      await sendMsg(session, session.userId, result.proxy_url, taskInfo[0].taskPrompt, result.id)
    })

}

// 初始化客户端
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

// 定义一个辅助函数来重试具有指数回退的函数
async function retry<T>(
  func: () => Promise<T>,
  retries = 3,
  delay = 500,
): Promise<T> {
  let lastError: Error;
  for (let i = 0; i < retries; i++) {
    try {
      return await func();
    } catch (error) {
      // 定义一个函数，用于请求一言的 api
      async function requestHitokoto() {
        // 使用fetch方法来发送请求
        const response = await fetch('https://v1.hitokoto.cn/');
        // 判断响应是否成功
        if (response.ok) {
          // 解析响应为json格式
          const data = await response.json();
          // 返回一言的内容
          return data.hitokoto;
        } else {
          // 抛出错误信息
          throw new Error(`请求失败，状态码：${response.status}`);
        }
      }

      // 定义一个函数，用于显示提示词
      async function showTip() {
        try {
          // 调用 requestHitokoto 函数来获取一言
          // 使用重试函数来请求一言的 api
          const hitokoto = await retry(() => requestHitokoto());

          // 记录提示
          logger.error(hitokoto);
        } catch (error) {
          // 记录错误
          logger.error(error.message);
        }
      }
      await showTip();
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delay * (2 ** i)));
    }
  }
  throw lastError;
}

async function sendMsg(session: any, userId: string, proxy_url: string, prompt: string, id: string) {
  await session.send(`${h.at(userId)}\n${h.image(proxy_url)}\n提示词：${prompt}\n\n任务Id：${id}`)
}

// 定义判断 url 是否有效的函数
function isValidUrl(string: string): boolean {
  let url: URL;
  try {
    url = new URL(string);
  } catch (_) {
    return false;
  }
  return true;
}