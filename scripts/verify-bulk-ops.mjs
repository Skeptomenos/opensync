#!/usr/bin/env node
/**
 * Verification script to ensure useBulkOperations exports are correct.
 * This doesn't require Pocketbase - just verifies the module structure.
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

// Check that the hooks/index.ts exports useBulkOperations
const indexContent = readFileSync(join(projectRoot, "src/hooks/index.ts"), "utf-8");
const hasExport = indexContent.includes('export { useBulkOperations }');
const hasTypes = indexContent.includes('BulkDeleteResult');

console.log("=== Bulk Operations Verification ===\n");
console.log(`Hook export found: ${hasExport ? "PASS" : "FAIL"}`);
console.log(`Type exports found: ${hasTypes ? "PASS" : "FAIL"}`);

// Check the hook file exists and has key functions
const hookContent = readFileSync(join(projectRoot, "src/hooks/useBulkOperations.ts"), "utf-8");
const hasDeleteFn = hookContent.includes("deleteMultipleSessions");
const hasExportFn = hookContent.includes("exportSessions");
const hasCascade = hookContent.includes("Delete all parts");
const hasCSV = hookContent.includes("escapeCSV");
const hasMarkdown = hookContent.includes("formatSessionMarkdown");
const hasProgress = hookContent.includes("onProgress");

console.log(`\nHook implementation:`);
console.log(`  deleteMultipleSessions: ${hasDeleteFn ? "PASS" : "FAIL"}`);
console.log(`  exportSessions: ${hasExportFn ? "PASS" : "FAIL"}`);
console.log(`  Cascade delete logic: ${hasCascade ? "PASS" : "FAIL"}`);
console.log(`  CSV export: ${hasCSV ? "PASS" : "FAIL"}`);
console.log(`  Markdown export: ${hasMarkdown ? "PASS" : "FAIL"}`);
console.log(`  Progress callback: ${hasProgress ? "PASS" : "FAIL"}`);

// Verify build succeeded (dist exists)
import { existsSync } from "fs";
const distExists = existsSync(join(projectRoot, "dist/index.html"));
console.log(`\nBuild output: ${distExists ? "PASS" : "FAIL"}`);

const allPass = hasExport && hasTypes && hasDeleteFn && hasExportFn && hasCascade && hasCSV && hasMarkdown && hasProgress && distExists;
console.log(`\n=== ${allPass ? "ALL CHECKS PASS" : "SOME CHECKS FAILED"} ===\n`);

process.exit(allPass ? 0 : 1);
