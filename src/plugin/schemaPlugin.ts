import ts from 'typescript'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { API_SCHEMA, HMR_SCHEMA_UPDATE } from '../shared/constants'
import type { PropInfo } from '../shared/types'
import { findTsconfig } from './findTsconfig'
import type { RootRef } from './index'

export type { PropInfo }

export function extractProps(
  filePath: string,
  tsconfigPath: string,
): PropInfo[] {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    resolve(tsconfigPath, '..'),
  )

  const program = ts.createProgram([filePath], parsedConfig.options)
  const checker = program.getTypeChecker()
  const sourceFile = program.getSourceFile(filePath)

  if (!sourceFile) return []

  const props: PropInfo[] = []

  ts.forEachChild(sourceFile, (node) => {
    // Find exported function declarations or variable declarations
    let funcType: ts.Type | undefined

    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      hasExportModifier(node)
    ) {
      funcType = checker.getTypeAtLocation(node)
    } else if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      const decl = node.declarationList.declarations[0]
      if (decl) {
        funcType = checker.getTypeAtLocation(decl)
      }
    } else if (ts.isExportAssignment(node)) {
      funcType = checker.getTypeAtLocation(node.expression)
    }

    if (!funcType || props.length > 0) return

    const callSignatures = funcType.getCallSignatures()
    if (callSignatures.length === 0) return

    // React components have a single call signature: (props) => JSX
    const firstParam = callSignatures[0].getParameters()[0]
    if (!firstParam) return

    const paramType = checker.getTypeOfSymbol(firstParam)
    for (const prop of paramType.getProperties()) {
      props.push(symbolToPropInfo(prop, checker))
    }
  })

  return props
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node)
    ? ts.getModifiers(node)
    : undefined
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

/**
 * Produce a serializable default value for a TypeScript type.
 * Returns plain values for primitives/plain objects, and hydrate
 * descriptors (tagged objects with `__hydrate`) for types that
 * can't be represented as plain JSON (Promise, Date, Map, etc.).
 */
function defaultForType(
  t: ts.Type,
  checker: ts.TypeChecker,
  depth = 0,
): unknown {
  if (depth > 4) return null // prevent infinite recursion on deep/recursive types

  if (t.flags & ts.TypeFlags.Void || t.flags & ts.TypeFlags.Undefined)
    return undefined
  if (t.flags & ts.TypeFlags.Null) return null
  if (t.flags & ts.TypeFlags.String) return ''
  if (t.isStringLiteral()) return t.value
  if (t.flags & ts.TypeFlags.Number) return 0
  if (t.isNumberLiteral()) return t.value
  if (t.flags & ts.TypeFlags.Boolean || t.flags & ts.TypeFlags.BooleanLiteral)
    return false

  // Union — pick the first non-undefined/null type
  if (t.isUnion()) {
    const concrete = t.types.find(
      (u) => !(u.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)),
    )
    return concrete ? defaultForType(concrete, checker, depth) : null
  }

  // Function types (callback-returning-callback)
  if (t.getCallSignatures().length > 0) {
    const sig = t.getCallSignatures()[0]
    const retType = checker.getReturnTypeOfSignature(sig)
    return {
      __hydrate: 'Function',
      returnDefault: defaultForType(retType, checker, depth + 1),
    }
  }

  if (checker.isArrayType(t)) {
    // Tuples: produce per-element typed defaults
    const objectFlags = (t as ts.ObjectType).objectFlags ?? 0
    if (objectFlags & ts.ObjectFlags.Tuple) {
      const typeArgs = checker.getTypeArguments(t as ts.TypeReference)
      return typeArgs.map((arg) => defaultForType(arg, checker, depth + 1))
    }
    return []
  }

  // Object types — check for known non-plain types before generic fallback
  if (t.flags & ts.TypeFlags.Object) {
    const name = t.symbol?.name

    // Promise<T> → descriptor with resolved inner value
    if (name === 'Promise') {
      const typeArgs = checker.getTypeArguments(t as ts.TypeReference)
      const inner =
        typeArgs.length > 0
          ? defaultForType(typeArgs[0], checker, depth + 1)
          : undefined
      return { __hydrate: 'Promise', value: inner }
    }

    // Built-in non-plain types → descriptors
    if (name === 'Date') return { __hydrate: 'Date' }
    if (name === 'Map') return { __hydrate: 'Map' }
    if (name === 'Set') return { __hydrate: 'Set' }
    if (name === 'RegExp') return { __hydrate: 'RegExp' }

    // React elements → null is a valid React child everywhere
    if (name === 'Element' || name === 'ReactElement' || name === 'ReactNode') {
      return null
    }

    // Types with construct signatures are class instances — can't safely synthesize
    if (t.getConstructSignatures?.().length) return null

    // Plain object types — recursively build defaults for each property
    const props = t.getProperties()
    if (props.length === 0) return {}
    const obj: Record<string, unknown> = {}
    for (const prop of props) {
      const propType = checker.getTypeOfSymbol(prop)
      obj[prop.name] = defaultForType(propType, checker, depth + 1)
    }
    return obj
  }

  return null
}

function symbolToPropInfo(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
): PropInfo {
  const rawType = checker.getTypeOfSymbol(symbol)
  const required = !(symbol.flags & ts.SymbolFlags.Optional)

  // Optional props have type `T | undefined`. Strip undefined so we can
  // classify the base type (e.g. boolean, not unknown). Optionality itself
  // is tracked by the `required` flag above.
  const type = rawType.isUnion() ? checker.getNonNullableType(rawType) : rawType

  if (type.getCallSignatures().length > 0) {
    const signature = checker.typeToString(type)
    const callSig = type.getCallSignatures()[0]
    const returnType = checker.getReturnTypeOfSignature(callSig)
    const returnDefault = defaultForType(returnType, checker)
    return {
      name: symbol.name,
      type: 'function',
      required,
      signature,
      returnDefault,
    }
  }

  if (type.isUnion()) {
    const types = type.types
    const allLiterals = types.every((t) => t.isStringLiteral())
    if (allLiterals) {
      return {
        name: symbol.name,
        type: 'enum',
        required,
        enumValues: types.map((t) => (t as ts.StringLiteralType).value),
      }
    }
  }

  if (type.flags & ts.TypeFlags.String) {
    return { name: symbol.name, type: 'string', required }
  }
  if (type.flags & ts.TypeFlags.Number) {
    return { name: symbol.name, type: 'number', required }
  }
  if (
    type.flags & ts.TypeFlags.Boolean ||
    type.flags & ts.TypeFlags.BooleanLiteral
  ) {
    return { name: symbol.name, type: 'boolean', required }
  }
  if (checker.isArrayType(type)) {
    return { name: symbol.name, type: 'array', required }
  }
  if (type.flags & ts.TypeFlags.Object) {
    return { name: symbol.name, type: 'object', required }
  }

  return { name: symbol.name, type: 'unknown', required }
}

export function schemaPlugin(rootRef: RootRef): Plugin {
  return {
    name: 'observatory-schema',
    configureServer(server) {
      server.middlewares.use(API_SCHEMA, (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const componentPath = url.searchParams.get('component')

        if (!componentPath) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing component query param' }))
          return
        }

        const root = rootRef.root
        const absPath = resolve(root, componentPath)

        // Verify the file is inside the project root
        if (!absPath.startsWith(root)) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Path outside project root' }))
          return
        }

        try {
          const tsconfigPath = findTsconfig(root)
          const props = extractProps(absPath, tsconfigPath)

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ props }))
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: message }))
        }
      })
    },
    handleHotUpdate({ file, server }) {
      if (/\.[tj]sx?$/.test(file)) {
        server.hot.send(HMR_SCHEMA_UPDATE, { file })
      }
    },
  }
}
