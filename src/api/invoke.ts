import { invoke } from "@tauri-apps/api/core";

import { toAppError } from "./error";

export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (err) {
    throw toAppError(err);
  }
}
