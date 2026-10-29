/** جلوگیری از ساخت بی‌صدای پایگاه فایل‌محور در محیط production. */
export class DatabaseConfigurationError extends Error {
  constructor() {
    super("در production باید DATABASE_URL تنظیم شود؛ PGlite فقط با HERMICAD_ALLOW_PGLITE_IN_PRODUCTION=1 برای آزمایش محلی فعال می‌شود.");
    this.name = "DatabaseConfigurationError";
  }
}

export interface DatabaseConfiguration {
  databaseUrl?: string;
  nodeEnv?: string;
  allowEmbeddedInProduction?: string;
}

export function assertDatabaseConfiguration(config: DatabaseConfiguration): void {
  if (config.nodeEnv === "production" && !config.databaseUrl?.trim() && config.allowEmbeddedInProduction !== "1") {
    throw new DatabaseConfigurationError();
  }
}
