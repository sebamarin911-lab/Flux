// Push Subscription Manager (Mocked / Disabled)

export async function subscribeToPush(): Promise<boolean> {
  return false;
}

export async function unsubscribeFromPush(): Promise<boolean> {
  return true;
}

export async function isPushSubscribed(): Promise<boolean> {
  return false;
}
