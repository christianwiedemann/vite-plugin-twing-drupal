import fs from "fs"
import path from "path"

/**
 * Get JavaScript dependencies for component files by analyzing Twig template dependencies
 * @param {Object} namespaces - Namespace configuration object
 * @param {Array} componentFiles - Array of component file paths
 * @returns {Array} Array of JavaScript file paths
 */
export default function getComponentDependencies(namespaces, componentFiles) {
  const findFileInNamespaces = (filePath) => {
    // Handle namespaced paths (e.g., @mercury/heading/heading.twig)
    if (filePath.startsWith("@")) {
      const [namespace, ...rest] = filePath.slice(1).split("/")
      const namespacePaths = namespaces[namespace]

      if (namespacePaths) {
        const relativePath = rest.join("/")
        for (const namespacePath of Array.isArray(namespacePaths)
          ? namespacePaths
          : [namespacePaths]) {
          const fullPath = path.join(namespacePath, relativePath)

          if (fs.existsSync(fullPath)) {
            return { path: fullPath, namespace }
          }
        }
      }
      return null
    }

    const filePathWithoutTwig = filePath.replace(".twig", "")
    const [baseName, variant] = filePathWithoutTwig.split("~")
    const fileName = variant ? `${baseName}~${variant}` : baseName

    for (const [namespace, paths] of Object.entries(namespaces)) {
      for (const namespacePath of Array.isArray(paths) ? paths : [paths]) {
        // Construct path following the convention
        const fullPath = path.join(namespacePath, baseName, `${fileName}.twig`)

        if (fs.existsSync(fullPath)) {
          return { path: fullPath, namespace }
        }
      }
    }

    return null
  }

  const getJsPath = (twigPath) => {
    // Convert the Twig path to a potential JS path
    const jsPath = twigPath.replace(".twig", ".js")
    return fs.existsSync(jsPath) ? jsPath : null
  }

  const extractDependencies = (content) => {
    const patterns = [
      /{%\s*extends\s+['"]([^'"]+)['"]\s*%}/g,
      /{{?\s*include\s*\(\s*['"]([^'"]+)['"]/g, // Updated to catch include() with parameters
      /{%\s*include\s+['"]([^'"]+)['"]\s*%}/g, // Keep original include pattern
      /{%\s*embed\s+['"]([^'"]+)['"](\s+with\s+{[^}]*})?\s*%}/g, // Updated to handle with clause
      /{%\s*import\s+['"]([^'"]+)['"]\s*%}/g,
      /{%\s*from\s+['"]([^'"]+)['"]\s*%}/g,
    ]

    const deps = patterns.flatMap((pattern) => {
      const matches = []
      let match
      while ((match = pattern.exec(content)) !== null) {
        const dep = match[1]
        // Convert mercury: format to @mercury format
        if (dep.startsWith("mercury:")) {
          const componentName = dep.replace("mercury:", "")
          matches.push(`@mercury/${componentName}/${componentName}.twig`)
        } else {
          matches.push(dep)
        }
      }
      return matches
    })
    return deps
  }

  const processFile = (filePath, processed = new Set()) => {
    if (processed.has(filePath)) {
      return []
    }
    processed.add(filePath)

    const fileInfo = findFileInNamespaces(filePath)
    if (!fileInfo) {
      return []
    }

    try {
      const content = fs.readFileSync(fileInfo.path, "utf8")

      // Get Twig dependencies from the content
      const twigDeps = extractDependencies(content)
      // Process each Twig dependency recursively and collect their JS files
      const twigDepResults = twigDeps.flatMap((dep) => {
        // If it's a mercury: dependency, convert it to the proper format
        if (dep.startsWith("mercury:")) {
          const componentName = dep.replace("mercury:", "")
          const twigPath = `@mercury/${componentName}/${componentName}.twig`
          return processFile(twigPath, processed)
        }
        return processFile(dep, processed)
      })

      // Get the JS file for the current component if it exists
      const jsPath = getJsPath(fileInfo.path)

      // Return all JS paths (current component + twig dependencies)
      return jsPath ? [jsPath, ...twigDepResults] : twigDepResults
    } catch (error) {
      console.warn(
        `Warning: Could not process file ${filePath}: ${error.message}`
      )
      return []
    }
  }

  // Process all component files and get unique JS paths
  const jsFiles = [
    ...new Set(componentFiles.flatMap((file) => processFile(file))),
  ]

  return jsFiles
}
