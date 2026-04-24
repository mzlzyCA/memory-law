#!/usr/bin/env bun

import { ensureCliStorageDirs, getAgentSessionTmpDir, getCliStorageDir } from "./storage";

export function getWelcomeMessage(): string {
  return "memory-law CLI is ready.";
}

if (import.meta.main) {
  await ensureCliStorageDirs();
  console.log(getWelcomeMessage());
  console.log(`CLI storage: ${getCliStorageDir()}`);
  console.log(`Agent sessions tmp: ${getAgentSessionTmpDir()}`);
}
