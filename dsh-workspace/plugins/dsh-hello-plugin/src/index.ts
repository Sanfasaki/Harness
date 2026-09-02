import { Context } from "@deepseek-ai/cordis";

export const name = "hello-plugin";

/**
 * 本插件用到的最小服务：logger。
 * 需要其他服务（如 commands、session、compaction）时在 inject 里追加，
 * 并把对应 @deepseek-ai/dsh-* 包加进 peerDependencies。
 */
export const inject = ["logger"];

export interface Config {
  /** 加载时打印的问候语 */
  greeting: string;
}

export function apply(ctx: Context, config: Partial<Config> = {}) {
  const greeting = config.greeting ?? "你好，DSH！";

  // ctx.effect 注册生命周期效应：fiber 激活时执行，禁用/热更时自动清理。
  // （本 cordis 分支没有 "ready" 事件；DSH 插件统一用 effect / ctx.on 具体事件）
  ctx.effect(() => {
    ctx.logger.info(`[hello-plugin] ${greeting}`);
  });
}
