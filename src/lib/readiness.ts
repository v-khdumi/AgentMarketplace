export async function checkReadiness(options: {
  configured: boolean;
  checkStorage: () => Promise<unknown>;
  timeoutMs?: number;
}): Promise<boolean> {
  if (!options.configured) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(options.checkStorage),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Storage readiness timed out.")), options.timeoutMs ?? 5000);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}