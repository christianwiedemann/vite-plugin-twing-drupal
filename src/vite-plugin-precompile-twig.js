// plugins/vite-plugin-precompile-twig.js
import { readdirSync, readFileSync, existsSync } from "fs"
import { resolve, relative, dirname, join } from "path"
import { fileURLToPath } from "url"
import getComponentReferences from "./loader/getComponentReferences.js"

// Get current file directory.
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Resolve namespace paths, supporting multiple directories per namespace
 * @param {Object} namespaces - Namespace configuration
 * @param {string} cwd - Current working directory
 * @returns {Object} - Resolved namespace paths
 */
function resolveNamespacePaths(namespaces, cwd) {
  const resolvedNamespaces = {}

  Object.entries(namespaces).forEach(([namespace, paths]) => {
    const pathsArray = Array.isArray(paths) ? paths : [paths]
    resolvedNamespaces[namespace] = pathsArray.map((path) => resolve(cwd, path))
  })

  return resolvedNamespaces
}

/**
 * Get all template directories from namespaces
 * @param {Object} namespaces - Namespace configuration
 * @param {string} cwd - Current working directory
 * @returns {Array} - Array of resolved template directory paths
 */
function getTemplateDirPaths(namespaces, cwd) {
  const templateDirs = Object.values(namespaces)?.flatMap((namespace) =>
    Array.isArray(namespace) ? namespace : [namespace]
  )

  return templateDirs.map((dir) => resolve(cwd, dir))
}

/**
 * Walk directory and collect Twig templates
 * @param {string} dir - Directory to walk
 * @param {Object} filemap - Map to store templates
 * @param {string} prefix - Prefix for template paths
 * @returns {Object} - Map of template paths to content
 */
function collectTemplatesFromDirectory(dir, filemap = {}, prefix = "") {
  try {
    const entries = readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const full = resolve(dir, entry.name)

      if (entry.isDirectory()) {
        collectTemplatesFromDirectory(
          full,
          filemap,
          prefix ? `${prefix}/${entry.name}` : entry.name
        )
      } else if (entry.isFile() && /\.twig$/.test(entry.name)) {
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
        filemap[relativePath] = readFileSync(full, "utf8")
      }
    }
  } catch (err) {
    console.warn(`Warning: Could not walk directory ${dir}: ${err.message}`)
  }

  return filemap
}

/**
 * Load templates from template directories
 * @param {Array} templateDirPaths - Array of template directory paths
 * @returns {Object} - Map of template paths to content
 */
function loadTemplatesFromDirectories(templateDirPaths) {
  const templates = {}

  templateDirPaths.forEach((dirPath) => {
    try {
      const dirTemplates = collectTemplatesFromDirectory(dirPath)
      Object.entries(dirTemplates).forEach(([path, content]) => {
        templates[path] = content
      })
    } catch (err) {
      console.error(
        `Error loading templates from directory "${dirPath}": ${err.message}`
      )
    }
  })

  return templates
}

/**
 * Load templates from namespace directories
 * @param {Object} resolvedNamespaces - Resolved namespace paths
 * @returns {Object} - Map of namespaced template paths to content
 */
function loadTemplatesFromNamespaces(resolvedNamespaces) {
  const templates = {}

  Object.entries(resolvedNamespaces).forEach(([namespace, dirPaths]) => {
    dirPaths.forEach((dir) => {
      try {
        const namespacedTemplates = collectTemplatesFromDirectory(dir)
        Object.entries(namespacedTemplates).forEach(([path, content]) => {
          templates[`@${namespace}/${path}`] = content
        })
      } catch (err) {
        console.error(
          `Error loading templates from namespace "${namespace}" directory "${dir}": ${err.message}`
        )
      }
    })
  })

  return templates
}

/**
 * Load all templates from directories and namespaces
 * @param {Array} templateDirPaths - Template directory paths
 * @param {Object} resolvedNamespaces - Resolved namespace paths
 * @returns {Object} - Map of all template paths to content
 */
function loadAllTemplates(templateDirPaths, resolvedNamespaces) {
  const directoryTemplates = loadTemplatesFromDirectories(templateDirPaths)
  const namespaceTemplates = loadTemplatesFromNamespaces(resolvedNamespaces)

  return { ...directoryTemplates, ...namespaceTemplates }
}

/**
 * Try to resolve template from namespace path
 * @param {string} path - Template path
 * @param {Object} resolvedNamespaces - Resolved namespace paths
 * @param {Object} templateSources - Template cache
 * @returns {Object|null} - Resolved template or null
 */
function resolveNamespacedTemplate(path, resolvedNamespaces, templateSources) {
  if (!path.startsWith("@")) {
    return null
  }

  const [, namespace, ...rest] = path.split("/")
  const namespacePaths = resolvedNamespaces[namespace]

  if (!namespacePaths) {
    return null
  }

  const relativePath = rest.join("/")

  for (const dir of namespacePaths) {
    const fullPath = resolve(dir, relativePath)
    if (existsSync(fullPath)) {
      const key = `@${namespace}/${relativePath}`
      const content = readFileSync(fullPath, "utf8")
      templateSources[key] = content
      return { key, content }
    }
  }

  return null
}

/**
 * Try to resolve template from template directories
 * @param {string} path - Template path
 * @param {Array} templateDirPaths - Template directory paths
 * @param {Object} templateSources - Template cache
 * @returns {Object|null} - Resolved template or null
 */
function resolveFromTemplateDirs(path, templateDirPaths, templateSources) {
  for (const dirPath of templateDirPaths) {
    const fullPath = resolve(dirPath, path)
    if (existsSync(fullPath)) {
      const key = path
      const content = readFileSync(fullPath, "utf8")
      templateSources[key] = content
      return { key, content }
    }
  }

  return null
}

/**
 * Try to resolve template as absolute path
 * @param {string} path - Template path
 * @param {Array} templateDirPaths - Template directory paths
 * @param {Object} resolvedNamespaces - Resolved namespace paths
 * @param {Object} templateSources - Template cache
 * @returns {Object|null} - Resolved template or null
 */
function resolveAbsolutePath(
  path,
  templateDirPaths,
  resolvedNamespaces,
  templateSources
) {
  if (!existsSync(path)) {
    return null
  }

  // Check template directories
  for (const dirPath of templateDirPaths) {
    if (path.startsWith(dirPath)) {
      const relativePath = relative(dirPath, path).replace(/\\/g, "/")
      const content = readFileSync(path, "utf8")
      templateSources[relativePath] = content
      return { key: relativePath, content }
    }
  }

  // Check namespace directories
  for (const [namespace, dirPaths] of Object.entries(resolvedNamespaces)) {
    for (const dir of dirPaths) {
      if (path.startsWith(dir)) {
        const relativePath = relative(dir, path).replace(/\\/g, "/")
        const key = `@${namespace}/${relativePath}`
        const content = readFileSync(path, "utf8")
        templateSources[key] = content
        return { key, content }
      }
    }
  }

  // Use as is if not under any managed directory
  const content = readFileSync(path, "utf8")
  templateSources[path] = content
  return { key: path, content }
}

/**
 * Try to resolve template by finding matching template keys
 * @param {string} path - Template path
 * @param {Object} templateSources - Template cache
 * @returns {Object|null} - Resolved template or null
 */
function resolveByTemplateKey(path, templateSources) {
  const key = Object.keys(templateSources).find((k) =>
    k.endsWith(path.replace(/\\/g, "/"))
  )

  if (key) {
    return { key, content: templateSources[key] }
  }

  return null
}

/**
 * Create template resolver function
 * @param {Array} templateDirPaths - Template directory paths
 * @param {Object} resolvedNamespaces - Resolved namespace paths
 * @param {Object} templateSources - Template cache
 * @returns {Function} - Template resolver function
 */
function createTemplateResolver(
  templateDirPaths,
  resolvedNamespaces,
  templateSources
) {
  return function resolveTemplate(path) {
    // Try namespaced path first
    const namespacedResult = resolveNamespacedTemplate(
      path,
      resolvedNamespaces,
      templateSources
    )
    if (namespacedResult) return namespacedResult

    // Try template directories
    const templateDirResult = resolveFromTemplateDirs(
      path,
      templateDirPaths,
      templateSources
    )
    if (templateDirResult) return templateDirResult

    // Try relative paths within template directories
    for (const dirPath of templateDirPaths) {
      if (path.startsWith(dirPath)) {
        const relativePath = relative(dirPath, path).replace(/\\/g, "/")
        if (templateSources[relativePath]) {
          return { key: relativePath, content: templateSources[relativePath] }
        }
      }
    }

    // Try absolute path
    const absoluteResult = resolveAbsolutePath(
      path,
      templateDirPaths,
      resolvedNamespaces,
      templateSources
    )
    if (absoluteResult) return absoluteResult

    // Try namespace directories with direct paths
    for (const [namespace, dirPaths] of Object.entries(resolvedNamespaces)) {
      for (const dir of dirPaths) {
        if (path.startsWith(dir)) {
          const relativePath = relative(dir, path).replace(/\\/g, "/")
          const key = `@${namespace}/${relativePath}`
          if (templateSources[key]) {
            return { key, content: templateSources[key] }
          }

          if (existsSync(path)) {
            const content = readFileSync(path, "utf8")
            templateSources[key] = content
            return { key, content }
          }
        }

        const fullPath = resolve(dir, path)
        if (existsSync(fullPath)) {
          const content = readFileSync(fullPath, "utf8")
          const key = `@${namespace}/${path}`
          templateSources[key] = content
          return { key, content }
        }
      }
    }

    // Last resort: find by template key match
    return resolveByTemplateKey(path, templateSources)
  }
}

/**
 * Generate module content for Twig template
 * @param {string} key - Template key
 * @param {Object} templateSources - All template sources
 * @param {Object} resolvedNamespaces - Resolved namespace paths
 * @param {string} cwd - Current working directory
 * @returns {string} - Generated module content
 */
function generateModuleContent(key, templateSources, resolvedNamespaces, cwd) {
  const allSourcesString = Object.entries(templateSources)
    .map(
      ([templateKey, templateContent]) =>
        `'${templateKey}': ${JSON.stringify(templateContent)}`
    )
    .join(",\n    ")

  const twingNamespacesString = Object.keys(resolvedNamespaces)
    .map(
      (namespace) =>
        `'${namespace}': ${JSON.stringify(resolvedNamespaces[namespace])}`
    )
    .join(",\n    ")

  return `
    import { createEnvironment } from 'twing';

    import { addDrupalExtensions } from '/${relative(
      cwd,
      resolve(__dirname, "./lib/twing.js")
    )}';
    import createSDCLoader from '/${relative(
      cwd,
      resolve(__dirname, "./loader/createSDCLoader.js")
    )}';
    
  
    // Include all templates, including namespaced ones.
    const allSources = {
      ${allSourcesString}
    };

    const twingNamespaces = {
      ${twingNamespacesString}
    };
    
    // Create a loader and environment.
    const loader = createSDCLoader(allSources, twingNamespaces);
    const env = createEnvironment(loader);
    addDrupalExtensions(env);
    
    
    /**
     * Renders the preloaded Twig template.
     * @param {Object} context - the Twig context
     * @returns {Promise<string>}
     */
    export function render(context = {}) {
      return env.render('${key}', context);
    }

    // Add default export to support both import styles.
    export default render;
  `
}

/**
 * Create HMR helper functions
 * @param {Function} resolveTemplate - Template resolver function
 * @param {Object} resolvedNamespaces - Resolved namespace paths
 * @param {Object} templateSources - Template cache
 * @returns {Object} - HMR helper functions
 */
function createHMRHelpers(
  resolveTemplate,
  resolvedNamespaces,
  templateSources
) {
  function resolveTemplateWithErrorHandling(filePath) {
    try {
      const resolved = resolveTemplate(filePath)
      if (!resolved) {
        console.warn(`[HMR] Could not resolve template: ${filePath}`)
        return null
      }
      return resolved
    } catch (error) {
      console.error(
        `[HMR] Error resolving template ${filePath}: ${error.message}`
      )
      return null
    }
  }

  function getTemplatesForUpdate(originalFile) {
    const originalTemplate = resolveTemplateWithErrorHandling(originalFile)
    if (!originalTemplate) {
      return []
    }

    return [originalTemplate]
  }

  function updateTemplateCache(templates) {
    templates.forEach((template) => {
      const componentUpdated = template.key.split("/").pop()
      const templateSourcesAffected = Object.keys(templateSources).filter(
        (key) => key.endsWith(componentUpdated)
      )

      templateSourcesAffected.forEach((key) => {
        templateSources[key] = template.content
      })
    })
  }

  function findAffectedModules(server, templateKeys) {
    const affectedModules = []
    const seenModuleIds = new Set()
    const referencingFiles = templateKeys.map((key) => {
      return getComponentReferences(resolvedNamespaces, [key])
    })

    for (const moduleId of server.moduleGraph.idToModuleMap.keys()) {
      const module = server.moduleGraph.getModuleById(moduleId)

      if (
        isModuleAffectedByTemplates(module, templateKeys, referencingFiles) &&
        !seenModuleIds.has(moduleId)
      ) {
        affectedModules.push(module)
        seenModuleIds.add(moduleId)
      }
    }
    return affectedModules
  }

  function isModuleAffectedByTemplates(module, templateKeys, referencingFiles) {
    if (module && module.file && module.file.endsWith(".twig")) {
      return (
        referencingFiles.flat().some((file) => file.endsWith(module.file)) ||
        templateKeys.some((key) => key.endsWith(module.file))
      )
    }

    return false
  }

  return {
    resolveTemplateWithErrorHandling,
    getTemplatesForUpdate,
    updateTemplateCache,
    findAffectedModules,
    isModuleAffectedByTemplates,
  }
}

/**
 * Main Vite plugin function
 * @param {Object} options - Plugin options
 * @returns {Object} - Vite plugin configuration
 */
export default function precompileTwigPlugin(options = {}) {
  const { include = /\.twig(\?.*)?$/, namespaces = {} } = options

  const cwd = typeof process !== "undefined" ? process.cwd() : "."

  // Initialize paths and templates
  const templateDirPaths = getTemplateDirPaths(namespaces, cwd)
  const resolvedNamespaces = resolveNamespacePaths(namespaces, cwd)
  const templateSources = loadAllTemplates(templateDirPaths, resolvedNamespaces)

  console.log(
    `[Twig] Loaded ${
      Object.keys(templateSources).length
    } templates (including namespaces)`
  )

  // Create resolver and HMR helpers
  const resolveTemplate = createTemplateResolver(
    templateDirPaths,
    resolvedNamespaces,
    templateSources
  )
  const templateToModuleMap = new Map()
  const hmrHelpers = createHMRHelpers(
    resolveTemplate,
    resolvedNamespaces,
    templateSources
  )

  return {
    name: "vite-plugin-precompile-twig",
    enforce: "pre",

    resolveId(importee) {
      return include.test(importee) ? importee : null
    },

    load(id) {
      const clean = id.split("?")[0]
      if (!include.test(clean)) return null

      console.log(`[Twig] Resolving template: ${clean}`)
      const resolved = resolveTemplate(clean)

      if (!resolved) {
        console.error(`Cannot find template: ${clean}`)
        console.error(
          `Available templates: ${Object.keys(templateSources).join(", ")}`
        )
        console.error(`Template directories: ${templateDirPaths.join(", ")}`)
        console.error(`Namespaces: ${JSON.stringify(resolvedNamespaces)}`)
        this.error(`Cannot find template: ${clean}`)
      }

      const { key } = resolved

      // Track this module for HMR
      if (!templateToModuleMap.has(key)) {
        templateToModuleMap.set(key, new Set())
      }
      templateToModuleMap.get(key).add(id)

      return generateModuleContent(
        key,
        templateSources,
        resolvedNamespaces,
        cwd
      )
    },

    handleHotUpdate({ file, server }) {
      if (!file.endsWith(".twig")) {
        return
      }

      console.log(`[HMR] Processing Twig file change: ${file}`)

      try {
        const templatesToUpdate = hmrHelpers.getTemplatesForUpdate(file)

        if (templatesToUpdate.length === 0) {
          console.warn(`[HMR] No templates to update for: ${file}`)
          return []
        }

        hmrHelpers.updateTemplateCache(templatesToUpdate)

        const templateKeys = templatesToUpdate.map((template) => template.key)
        const affectedModules = hmrHelpers.findAffectedModules(
          server,
          templateKeys
        )

        console.log(`[HMR] Found ${affectedModules.length} affected modules`)

        return affectedModules
      } catch (error) {
        console.error(
          `[HMR] Error processing template update for ${file}: ${error.message}`
        )
        return []
      }
    },
  }
}
