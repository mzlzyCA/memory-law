#!/usr/bin/env bun

export function getWelcomeMessage(): string {
  return "memory-law CLI is ready.";
}

if (import.meta.main) {
  console.log(getWelcomeMessage());
}
