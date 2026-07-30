export type PushConfig = {
  vapidPublicKey: string;
};

type EnvSource = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY?: string;
};

export function readPushConfig(env: EnvSource): PushConfig | null {
  const vapidPublicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!vapidPublicKey) return null;
  return { vapidPublicKey };
}

export function getPushConfig(): PushConfig | null {
  return readPushConfig({
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  });
}
