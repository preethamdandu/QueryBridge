import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function collectGraphqlFiles(dirPath: string): string[] {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectGraphqlFiles(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".graphql")) {
      files.push(fullPath);
    }
  }

  return files;
}

export function loadTypeDefs(schemaDirPath: string): string[] {
  const graphqlFiles = collectGraphqlFiles(schemaDirPath);
  return graphqlFiles.map((filePath) => readFileSync(filePath, "utf8"));
}
