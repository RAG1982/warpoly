/**
 * jsonImportLoader.mjs — hook mínimo de resolução de módulos (Node 22 exige `with { type:
 * "json" }` em import de `.json`; `src/data/maps/index.js` usa import estático sem atributo,
 * que funciona em Vite/Vitest mas não em Node puro). Usado só por `tools/eco-curve.mjs`
 * (`node --import tools/lib/register-json-loader.mjs tools/eco-curve.mjs`), sem tocar em
 * nenhum arquivo de `src/` (fora da lane desta spec).
 */
export async function load(url, context, next) {
  if (url.endsWith('.json') && (!context.importAttributes || !context.importAttributes.type)) {
    return next(url, { ...context, importAttributes: { ...(context.importAttributes || {}), type: 'json' } });
  }
  return next(url, context);
}
