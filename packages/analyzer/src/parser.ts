import ts from "typescript";
import type {
  DeclarationKind,
  DeclarationModel,
  Diagnostic,
  FileModel,
  HeritageModel,
  ImportRecord,
  MemberKind,
  MemberModel,
  Visibility
} from "@dcv/shared";
import { hashNode, normalizeNodeText, sourceRange } from "./ast.js";

export interface ParseFileInput {
  path: string;
  content: string;
  contentHash: string;
  scriptKind: "ts" | "tsx";
}

type FunctionLikeNode = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

type CallableNode =
  | FunctionLikeNode
  | ts.MethodDeclaration
  | ts.MethodSignature
  | ts.ConstructorDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration;

type ClassLikeNode = ts.ClassDeclaration | ts.ClassExpression;

interface ExportInfo {
  exportedNames: Set<string>;
  defaultNames: Set<string>;
}

export function parseFile(input: ParseFileInput): FileModel {
  const sourceFile = ts.createSourceFile(
    input.path,
    input.content,
    ts.ScriptTarget.Latest,
    true,
    input.scriptKind === "tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const exportInfo = collectExportInfo(sourceFile);
  const declarations: DeclarationModel[] = [];
  const imports: ImportRecord[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const record = importRecordFromDeclaration(statement);
      if (record) {
        imports.push(record);
      }
      continue;
    }

    if (ts.isImportEqualsDeclaration(statement)) {
      const record = importRecordFromEquals(statement);
      if (record) {
        imports.push(record);
      }
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      const record = reExportRecord(statement);
      if (record) {
        imports.push(record);
      }
      continue;
    }

    if (ts.isClassDeclaration(statement)) {
      const declaration = classDeclaration(statement, exportInfo, sourceFile);
      if (declaration) {
        declarations.push(declaration);
      }
      continue;
    }

    if (ts.isInterfaceDeclaration(statement)) {
      declarations.push(interfaceDeclaration(statement, exportInfo, sourceFile));
      continue;
    }

    if (ts.isEnumDeclaration(statement)) {
      declarations.push(enumDeclaration(statement, exportInfo, sourceFile));
      continue;
    }

    if (ts.isTypeAliasDeclaration(statement)) {
      declarations.push(typeAliasDeclaration(statement, exportInfo, sourceFile));
      continue;
    }

    if (ts.isFunctionDeclaration(statement)) {
      const declaration = functionDeclaration(statement, exportInfo, sourceFile);
      if (declaration) {
        declarations.push(declaration);
      }
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      declarations.push(...variableFunctions(statement, exportInfo, sourceFile));
      continue;
    }

    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const declaration = defaultExportExpression(statement.expression, sourceFile);
      if (declaration) {
        declarations.push(declaration);
      }
    }
  }

  return {
    contentHash: input.contentHash,
    scriptKind: input.scriptKind,
    imports,
    declarations,
    diagnostics: parseDiagnostics(sourceFile)
  };
}

function collectExportInfo(sourceFile: ts.SourceFile): ExportInfo {
  const exportedNames = new Set<string>();
  const defaultNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        const localName = element.propertyName?.text ?? element.name.text;
        if (element.name.text === "default") {
          defaultNames.add(localName);
        }
        exportedNames.add(localName);
      }
      continue;
    }

    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      exportedNames.add(statement.expression.text);
      defaultNames.add(statement.expression.text);
    }
  }

  return { exportedNames, defaultNames };
}

function classDeclaration(
  node: ts.ClassDeclaration,
  exportInfo: ExportInfo,
  sourceFile: ts.SourceFile
): DeclarationModel | null {
  const name = declarationName(node.name, hasModifier(node, ts.SyntaxKind.DefaultKeyword));
  if (!name) {
    return null;
  }
  return classLike(node, name, exportFlags(node, name, exportInfo), sourceFile);
}

function classExpression(
  node: ts.ClassExpression,
  name: string,
  sourceFile: ts.SourceFile
): DeclarationModel {
  return classLike(node, name, { exported: true, defaultExport: true }, sourceFile);
}

function classLike(
  node: ClassLikeNode,
  name: string,
  flags: { exported: boolean; defaultExport: boolean },
  sourceFile: ts.SourceFile
): DeclarationModel {
  return {
    kind: "class",
    name,
    exported: flags.exported,
    defaultExport: flags.defaultExport,
    abstract: hasModifier(node, ts.SyntaxKind.AbstractKeyword),
    declare: hasModifier(node, ts.SyntaxKind.DeclareKeyword),
    async: false,
    signature: null,
    type: null,
    members: node.members
      .map((member) => classMember(member, sourceFile))
      .filter((member): member is MemberModel => member !== null),
    heritage: heritageOf(node, sourceFile),
    bodyHash: null,
    sourceRange: sourceRange(sourceFile, node)
  };
}

function interfaceDeclaration(
  node: ts.InterfaceDeclaration,
  exportInfo: ExportInfo,
  sourceFile: ts.SourceFile
): DeclarationModel {
  return {
    kind: "interface",
    name: node.name.text,
    exported: exportFlags(node, node.name.text, exportInfo).exported,
    defaultExport: exportFlags(node, node.name.text, exportInfo).defaultExport,
    abstract: false,
    declare: hasModifier(node, ts.SyntaxKind.DeclareKeyword),
    async: false,
    signature: null,
    type: null,
    members: node.members
      .map((member) => interfaceMember(member, sourceFile))
      .filter((member): member is MemberModel => member !== null),
    heritage: heritageOf(node, sourceFile),
    bodyHash: null,
    sourceRange: sourceRange(sourceFile, node)
  };
}

function enumDeclaration(
  node: ts.EnumDeclaration,
  exportInfo: ExportInfo,
  sourceFile: ts.SourceFile
): DeclarationModel {
  const flags = exportFlags(node, node.name.text, exportInfo);
  return {
    kind: "enum",
    name: node.name.text,
    exported: flags.exported,
    defaultExport: flags.defaultExport,
    abstract: false,
    declare: hasModifier(node, ts.SyntaxKind.DeclareKeyword),
    async: false,
    signature: null,
    type: null,
    members: node.members.map((member) => ({
      kind: "enum-member",
      name: memberName(member.name, sourceFile),
      visibility: "public",
      static: false,
      readonly: false,
      optional: false,
      abstract: false,
      async: false,
      signature: null,
      type: null,
      bodyHash: hashNode(sourceFile, member.initializer),
      sourceRange: sourceRange(sourceFile, member)
    })),
    heritage: [],
    bodyHash: null,
    sourceRange: sourceRange(sourceFile, node)
  };
}

function typeAliasDeclaration(
  node: ts.TypeAliasDeclaration,
  exportInfo: ExportInfo,
  sourceFile: ts.SourceFile
): DeclarationModel {
  const flags = exportFlags(node, node.name.text, exportInfo);
  return {
    kind: "type",
    name: node.name.text,
    exported: flags.exported,
    defaultExport: flags.defaultExport,
    abstract: false,
    declare: hasModifier(node, ts.SyntaxKind.DeclareKeyword),
    async: false,
    signature: null,
    type: normalizeNodeText(sourceFile, node.type),
    members: [],
    heritage: [],
    bodyHash: null,
    sourceRange: sourceRange(sourceFile, node)
  };
}

function functionDeclaration(
  node: ts.FunctionDeclaration,
  exportInfo: ExportInfo,
  sourceFile: ts.SourceFile
): DeclarationModel | null {
  const defaultExport = hasModifier(node, ts.SyntaxKind.DefaultKeyword);
  const name = declarationName(node.name, defaultExport);
  if (!name) {
    return null;
  }
  return functionLike(node, name, exportFlags(node, name, exportInfo), sourceFile);
}

function variableFunctions(
  statement: ts.VariableStatement,
  exportInfo: ExportInfo,
  sourceFile: ts.SourceFile
): DeclarationModel[] {
  const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
  const declare = hasModifier(statement, ts.SyntaxKind.DeclareKeyword);
  const functions: DeclarationModel[] = [];

  for (const declaration of statement.declarationList.declarations) {
    if (!ts.isIdentifier(declaration.name)) {
      continue;
    }
    const initializer = declaration.initializer;
    if (!initializer || (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer))) {
      continue;
    }
    const flags = exportFlags(declaration.name, declaration.name.text, exportInfo);
    functions.push(
      functionLike(
        initializer,
        declaration.name.text,
        { exported: exported || flags.exported, defaultExport: flags.defaultExport },
        sourceFile,
        declare
      )
    );
  }

  return functions;
}

function defaultExportExpression(
  expression: ts.Expression,
  sourceFile: ts.SourceFile
): DeclarationModel | null {
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return functionLike(
      expression,
      "default",
      { exported: true, defaultExport: true },
      sourceFile
    );
  }
  if (ts.isClassExpression(expression)) {
    return classExpression(expression, expression.name?.text ?? "default", sourceFile);
  }
  return null;
}

function functionLike(
  node: FunctionLikeNode,
  name: string,
  flags: { exported: boolean; defaultExport: boolean },
  sourceFile: ts.SourceFile,
  declare = false
): DeclarationModel {
  return {
    kind: "function",
    name,
    exported: flags.exported,
    defaultExport: flags.defaultExport,
    abstract: false,
    declare: declare || hasModifier(node, ts.SyntaxKind.DeclareKeyword),
    async: hasModifier(node, ts.SyntaxKind.AsyncKeyword),
    signature: functionSignature(name, node, sourceFile),
    type: node.type ? normalizeNodeText(sourceFile, node.type) : null,
    members: [],
    heritage: [],
    bodyHash: hashNode(sourceFile, node.body),
    sourceRange: sourceRange(sourceFile, node)
  };
}

function classMember(
  member: ts.ClassElement,
  sourceFile: ts.SourceFile
): MemberModel | null {
  if (ts.isPropertyDeclaration(member)) {
    const name = memberName(member.name, sourceFile);
    return memberModel(member, name, "property", {
      sourceFile,
      type: member.type ? normalizeNodeText(sourceFile, member.type) : null,
      signature: null,
      bodyHash: hashNode(sourceFile, member.initializer)
    });
  }

  if (ts.isMethodDeclaration(member)) {
    const name = memberName(member.name, sourceFile);
    return memberModel(member, name, "method", {
      sourceFile,
      type: member.type ? normalizeNodeText(sourceFile, member.type) : null,
      signature: functionSignature(name, member, sourceFile),
      bodyHash: hashNode(sourceFile, member.body)
    });
  }

  if (ts.isConstructorDeclaration(member)) {
    return memberModel(member, "constructor", "constructor", {
      sourceFile,
      type: null,
      signature: functionSignature("constructor", member, sourceFile),
      bodyHash: hashNode(sourceFile, member.body)
    });
  }

  if (ts.isGetAccessorDeclaration(member)) {
    const name = memberName(member.name, sourceFile);
    const returnType = member.type ? normalizeNodeText(sourceFile, member.type) : "";
    return memberModel(member, name, "getter", {
      sourceFile,
      type: member.type ? returnType : null,
      signature: `get ${name}()${returnType ? `: ${returnType}` : ""}`,
      bodyHash: hashNode(sourceFile, member.body)
    });
  }

  if (ts.isSetAccessorDeclaration(member)) {
    const name = memberName(member.name, sourceFile);
    return memberModel(member, name, "setter", {
      sourceFile,
      type: member.type ? normalizeNodeText(sourceFile, member.type) : null,
      signature: `set ${name}(${member.parameters
        .map((parameter) => parameterText(sourceFile, parameter))
        .join(", ")})`,
      bodyHash: hashNode(sourceFile, member.body)
    });
  }

  return null;
}

function interfaceMember(
  member: ts.TypeElement,
  sourceFile: ts.SourceFile
): MemberModel | null {
  if (ts.isPropertySignature(member)) {
    return memberModel(member, memberName(member.name, sourceFile), "property", {
      sourceFile,
      type: member.type ? normalizeNodeText(sourceFile, member.type) : null,
      signature: null,
      bodyHash: null
    });
  }

  if (ts.isMethodSignature(member)) {
    const name = memberName(member.name, sourceFile);
    return memberModel(member, name, "method", {
      sourceFile,
      type: member.type ? normalizeNodeText(sourceFile, member.type) : null,
      signature: functionSignature(name, member, sourceFile),
      bodyHash: null
    });
  }

  return null;
}

function memberModel(
  node: ts.Node,
  name: string,
  kind: MemberKind,
  details: {
    sourceFile: ts.SourceFile;
    type: string | null;
    signature: string | null;
    bodyHash: string | null;
  }
): MemberModel {
  return {
    kind,
    name,
    visibility: memberVisibility(node),
    static: hasModifier(node, ts.SyntaxKind.StaticKeyword),
    readonly: hasModifier(node, ts.SyntaxKind.ReadonlyKeyword),
    optional: hasQuestionToken(node),
    abstract: hasModifier(node, ts.SyntaxKind.AbstractKeyword),
    async: hasModifier(node, ts.SyntaxKind.AsyncKeyword),
    signature: details.signature,
    type: details.type,
    bodyHash: details.bodyHash,
    sourceRange: sourceRange(details.sourceFile, node)
  };
}

function functionSignature(
  name: string,
  node: CallableNode,
  sourceFile: ts.SourceFile
): string {
  const typeParameters =
    node.typeParameters && node.typeParameters.length > 0
      ? `<${node.typeParameters.map((parameter) => normalizeNodeText(sourceFile, parameter)).join(", ")}>`
      : "";
  const parameters = node.parameters.map((parameter) => parameterText(sourceFile, parameter));
  const returnType = node.type ? `: ${normalizeNodeText(sourceFile, node.type)}` : "";
  return `${name}${typeParameters}(${parameters.join(", ")})${returnType}`;
}

function parameterText(sourceFile: ts.SourceFile, parameter: ts.ParameterDeclaration): string {
  const rest = parameter.dotDotDotToken ? "..." : "";
  const parameterName = normalizeNodeText(sourceFile, parameter.name);
  const optional = parameter.questionToken ? "?" : "";
  const type = parameter.type ? `: ${normalizeNodeText(sourceFile, parameter.type)}` : "";
  return `${rest}${parameterName}${optional}${type}`;
}

function heritageOf(
  node: ts.ClassLikeDeclaration | ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile
): HeritageModel[] {
  const heritage: HeritageModel[] = [];
  for (const clause of node.heritageClauses ?? []) {
    const kind = clause.token === ts.SyntaxKind.ExtendsKeyword ? "extends" : "implements";
    for (const type of clause.types) {
      heritage.push({
        kind,
        name: normalizeNodeText(sourceFile, type.expression)
      });
    }
  }
  return heritage;
}

function importRecordFromDeclaration(node: ts.ImportDeclaration): ImportRecord | null {
  if (!ts.isStringLiteral(node.moduleSpecifier)) {
    return null;
  }

  const clause = node.importClause;
  const bindings: ImportRecord["bindings"] = [];
  if (clause?.name) {
    bindings.push({ imported: "default", local: clause.name.text });
  }
  if (clause?.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) {
      bindings.push({ imported: "*", local: clause.namedBindings.name.text });
    } else {
      for (const element of clause.namedBindings.elements) {
        bindings.push({
          imported: element.propertyName?.text ?? element.name.text,
          local: element.name.text
        });
      }
    }
  }

  return {
    specifier: node.moduleSpecifier.text,
    typeOnly: clause?.isTypeOnly ?? false,
    reExport: false,
    starReExport: false,
    bindings
  };
}

function importRecordFromEquals(node: ts.ImportEqualsDeclaration): ImportRecord | null {
  if (!ts.isExternalModuleReference(node.moduleReference)) {
    return null;
  }
  const expression = node.moduleReference.expression;
  if (!expression || !ts.isStringLiteral(expression)) {
    return null;
  }
  return {
    specifier: expression.text,
    typeOnly: node.isTypeOnly,
    reExport: false,
    starReExport: false,
    bindings: [{ imported: "=", local: node.name.text }]
  };
}

function reExportRecord(node: ts.ExportDeclaration): ImportRecord | null {
  if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) {
    return null;
  }

  const clause = node.exportClause;
  const bindings: ImportRecord["bindings"] = [];
  let starReExport = false;

  if (!clause) {
    starReExport = true;
  } else if (ts.isNamespaceExport(clause)) {
    bindings.push({ imported: "*", local: clause.name.text });
  } else {
    for (const element of clause.elements) {
      bindings.push({
        imported: element.propertyName?.text ?? element.name.text,
        local: element.name.text
      });
    }
  }

  return {
    specifier: node.moduleSpecifier.text,
    typeOnly: node.isTypeOnly,
    reExport: true,
    starReExport,
    bindings
  };
}

function exportFlags(
  node: ts.Node,
  name: string,
  exportInfo: ExportInfo
): { exported: boolean; defaultExport: boolean } {
  return {
    exported: hasModifier(node, ts.SyntaxKind.ExportKeyword) || exportInfo.exportedNames.has(name),
    defaultExport:
      hasModifier(node, ts.SyntaxKind.DefaultKeyword) || exportInfo.defaultNames.has(name)
  };
}

function declarationName(
  name: ts.Identifier | ts.StringLiteral | undefined,
  defaultExport: boolean
): string | null {
  if (name) {
    return name.text;
  }
  return defaultExport ? "default" : null;
}

function memberName(name: ts.PropertyName, sourceFile: ts.SourceFile): string {
  if (ts.isPrivateIdentifier(name)) {
    return name.escapedText.toString();
  }
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return `[${normalizeNodeText(sourceFile, name)}]`;
}

function memberVisibility(node: ts.Node): Visibility {
  if (hasModifier(node, ts.SyntaxKind.PrivateKeyword)) {
    return "private";
  }
  if (hasModifier(node, ts.SyntaxKind.ProtectedKeyword)) {
    return "protected";
  }
  if (ts.isPropertyDeclaration(node) || ts.isMethodDeclaration(node)) {
    if (ts.isPrivateIdentifier(node.name)) {
      return "private";
    }
  }
  return "public";
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return modifiers?.some((modifier) => modifier.kind === kind) ?? false;
}

function hasQuestionToken(node: ts.Node): boolean {
  return "questionToken" in node && Boolean((node as { questionToken?: ts.QuestionToken }).questionToken);
}

function parseDiagnostics(sourceFile: ts.SourceFile): Diagnostic[] {
  const diagnostics = (
    sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.DiagnosticWithLocation[] }
  ).parseDiagnostics;

  return (diagnostics ?? []).map((diagnostic) => {
    const position =
      diagnostic.start === undefined
        ? null
        : sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
    return {
      severity: "error",
      code: `TS${diagnostic.code}`,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
      ...(position ? { line: position.line + 1, column: position.character + 1 } : {})
    } satisfies Diagnostic;
  });
}

export function declarationKindOf(node: ts.Node): DeclarationKind | null {
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
    return "class";
  }
  if (ts.isInterfaceDeclaration(node)) {
    return "interface";
  }
  if (ts.isEnumDeclaration(node)) {
    return "enum";
  }
  if (ts.isTypeAliasDeclaration(node)) {
    return "type";
  }
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node)
  ) {
    return "function";
  }
  return null;
}
