import { createHash } from "node:crypto";
import ts from "typescript";
import type { SourceRange } from "@dcv/shared";

export function scanNodeTokens(sourceFile: ts.SourceFile, node: ts.Node): string[] {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    sourceFile.languageVariant,
    sourceFile.text
  );
  scanner.setTextPos(node.getStart(sourceFile));

  const tokens: string[] = [];
  while (scanner.getTextPos() < node.end) {
    const token = scanner.scan();
    if (token === ts.SyntaxKind.EndOfFileToken) {
      break;
    }
    if (scanner.getTokenPos() >= node.end) {
      break;
    }
    tokens.push(scanner.getTokenText());
  }
  return tokens;
}

export function normalizeNodeText(sourceFile: ts.SourceFile, node: ts.Node): string {
  return scanNodeTokens(sourceFile, node).join(" ");
}

export function hashNode(sourceFile: ts.SourceFile, node: ts.Node | undefined): string | null {
  if (!node) {
    return null;
  }
  return createHash("sha256").update(scanNodeTokens(sourceFile, node).join("\u001f")).digest("hex");
}

export function sourceRange(sourceFile: ts.SourceFile, node: ts.Node): SourceRange {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.end);
  return {
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1
  };
}
