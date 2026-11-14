import ts from 'typescript';

const allowedMath = new Set(['abs', 'ceil', 'floor', 'round', 'min', 'max', 'sign', 'imul', 'sqrt']);
export function moduleSpecifiers(source: string): string[] {
  const out: string[] = [];
  const file = ts.createSourceFile('guard.ts', source, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) out.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      const arg = node.arguments[0]; if (arg && ts.isStringLiteral(arg)) out.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file); return out;
}
export function forbiddenImport(specifier: string): boolean {
  return /^(?:node:|electron(?:\/|$)|pixi\.js(?:\/|$))/.test(specifier) || /(?:^|\/)(?:app|render|input)(?:\/|$)/.test(specifier) || /(?:^|\/)tests(?:\/|$)/.test(specifier);
}
/** Reject Math escapes as well as calls: aliases/destructuring cannot bypass the allowlist. */
export function deterministicViolations(source: string): string[] {
  const file = ts.createSourceFile('guard.ts', source, ts.ScriptTarget.Latest, true);
  const errors: string[] = moduleSpecifiers(source).filter(forbiddenImport).map((p) => `forbidden import ${p}`);
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AsteriskAsteriskToken, ts.SyntaxKind.AsteriskAsteriskEqualsToken].includes(node.operatorToken.kind)) errors.push('exponentiation');
    if (ts.isIdentifier(node)) {
      const p = node.parent;
      const propertyName = ts.isPropertyAccessExpression(p) && p.name === node || (ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p)) && p.name === node;
      if (node.text === 'Math') {
        const access = (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p)) && p.expression === node ? p : null;
        const method = access && (ts.isPropertyAccessExpression(access) ? access.name.text : access.argumentExpression && ts.isStringLiteral(access.argumentExpression) ? access.argumentExpression.text : '');
        if (!access || !method || !allowedMath.has(method)) errors.push('unapproved Math access');
      }
      if (['Date', 'performance', 'document', 'window', 'navigator', 'crypto', 'setTimeout', 'setInterval', 'requestAnimationFrame'].includes(node.text) && !propertyName) errors.push(`platform global ${node.text}`);
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const name = ts.isPropertyAccessExpression(node) ? node.name.text : node.argumentExpression && ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : '';
      if (ts.isIdentifier(node.expression) && node.expression.text === 'globalThis' && ['Math', 'Date', 'performance', 'document', 'window', 'crypto'].includes(name)) errors.push(`globalThis.${name}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file); return errors;
}
