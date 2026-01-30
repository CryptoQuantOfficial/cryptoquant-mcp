import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, chmodSync } from "fs";

const CREDENTIALS_DIR = join(homedir(), ".cryptoquant");
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, "credentials");

export interface StoredCredentials {
  api_key: string;
  created_at: string;
  validated_at: string;
}

export function getStoredApiKey(): string | null {
  try {
    if (!existsSync(CREDENTIALS_FILE)) return null;
    const data = JSON.parse(readFileSync(CREDENTIALS_FILE, "utf-8"));
    return data.api_key || null;
  } catch {
    return null;
  }
}

export function saveApiKey(apiKey: string): void {
  if (!existsSync(CREDENTIALS_DIR)) {
    mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  }

  const data: StoredCredentials = {
    api_key: apiKey,
    created_at: new Date().toISOString(),
    validated_at: new Date().toISOString(),
  };

  writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2), { encoding: "utf-8" });
  chmodSync(CREDENTIALS_FILE, 0o600);
}

export function updateValidatedAt(): void {
  try {
    if (!existsSync(CREDENTIALS_FILE)) return;
    const data = JSON.parse(readFileSync(CREDENTIALS_FILE, "utf-8")) as StoredCredentials;
    data.validated_at = new Date().toISOString();
    writeFileSync(CREDENTIALS_FILE, JSON.stringify(data, null, 2), { encoding: "utf-8" });
  } catch {
    // Validation timestamp update is non-critical
  }
}

export function clearCredentials(): void {
  try {
    if (existsSync(CREDENTIALS_FILE)) unlinkSync(CREDENTIALS_FILE);
  } catch {
    // Already deleted or inaccessible
  }
}

export function getCredentialsPath(): string {
  return CREDENTIALS_FILE;
}
