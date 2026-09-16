import { AsyncLocalStorage } from 'node:async_hooks';
type RuntimeEnv = App.Platform['env'] & Record<string, unknown>;
const runtime = new AsyncLocalStorage<RuntimeEnv>();
export function withFiscus<T>(env: App.Platform['env'], task: () => T): T {
  return runtime.run(env, task);
}
export function getRuntimeEnv(): App.Platform['env'] & Record<string, any> {
  const env = runtime.getStore();
  if (!env?.DB) throw new Error('Fiscus 数据库未配置');
  return env;
}
export async function runRuntimeTask(context: { platform?: App.Platform }, task: Promise<unknown>) {
  const handled = task.catch((error) => console.error('Fiscus 通知发送失败', error));
  if (context.platform?.context) context.platform.context.waitUntil(handled);
  else await handled;
}
