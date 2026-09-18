/**
 * Module resolver for `node --test`.
 *
 * The app is bundled by Next, so its imports are extensionless and use the
 * `@/` root alias from tsconfig.json. Node's ESM loader understands neither,
 * so the tests would otherwise have to import via different specifiers than
 * the code under test. This hook teaches node both conventions.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..')
const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs']

/** Add the extension node needs, or resolve a directory's index file. */
function withExtension(path) {
  if (existsSync(path) && !existsSync(`${path}/`)) return path
  for (const extension of EXTENSIONS) {
    if (existsSync(path + extension)) return path + extension
  }
  for (const extension of EXTENSIONS) {
    if (existsSync(`${path}/index${extension}`)) return `${path}/index${extension}`
  }
  return null
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const resolved = withExtension(resolvePath(ROOT, specifier.slice(2)))
    if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true }
  }

  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const base = dirname(fileURLToPath(context.parentURL))
    const resolved = withExtension(resolvePath(base, specifier))
    if (resolved) return { url: pathToFileURL(resolved).href, shortCircuit: true }
  }

  return nextResolve(specifier, context)
}
