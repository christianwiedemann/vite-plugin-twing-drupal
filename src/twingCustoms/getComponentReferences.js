import fs from "fs"
import path from "path"

/**
 * Get all components that reference the given component files (reverse dependency search)
 * @param {Object} namespaces - Namespace configuration object
 * @param {Array} targetComponentFiles - Array of component file paths to find references to
 * @returns {Array} Array of file paths that reference the target components
 */
export default function getComponentReferences(
  namespaces,
  targetComponentFiles
) {
  // Convert target files to their namespaced references
  const getNamespacedReference = (filePath) => {
    // Handle absolute paths by checking if they belong to any namespace
    if (path.isAbsolute(filePath)) {
      for (const [namespace, paths] of Object.entries(namespaces)) {
        for (const namespacePath of Array.isArray(paths) ? paths : [paths]) {
          // Check if the absolute path is within this namespace directory
          if (filePath.startsWith(namespacePath)) {
            const relativePath = path
              .relative(namespacePath, filePath)
              .replace(/\\/g, "/")
            return `@${namespace}/${relativePath}`
          }
        }
      }
    }

    // If already namespaced, return as is
    if (filePath.startsWith("@")) {
      return filePath
    }

    return filePath
  }

  // Convert target files to their namespaced references
  const targetReferences = targetComponentFiles.map(getNamespacedReference)
  console.log(
    `[getComponentReferences] Looking for references to: ${targetReferences.join(
      ", "
    )}`
  )

  // Function to walk through directory and collect all .twig files
  const walkDirectory = (dir, fileList = []) => {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          walkDirectory(fullPath, fileList)
        } else if (entry.isFile() && entry.name.endsWith(".twig")) {
          fileList.push(fullPath)
        }
      }
    } catch (err) {
      console.warn(`Warning: Could not walk directory ${dir}: ${err.message}`)
    }
    return fileList
  }

  // Get all Twig files from all namespaces
  const getAllTwigFiles = () => {
    const allFiles = []

    Object.entries(namespaces).forEach(([namespace, paths]) => {
      const namespacePaths = Array.isArray(paths) ? paths : [paths]
      namespacePaths.forEach((namespacePath) => {
        const files = walkDirectory(namespacePath)
        allFiles.push(...files)
      })
    })

    return [...new Set(allFiles)] // Remove duplicates
  }

  // Extract references from Twig content
  const extractReferences = (content) => {
    const patterns = [
      /{%\s*extends\s+['"]([^'"]+)['"]\s*%}/g,
      /{{?\s*include\s*\(\s*['"]([^'"]+)['"]/g,
      /{%\s*include\s+['"]([^'"]+)['"]\s*%}/g,
      /{%\s*embed\s+['"]([^'"]+)['"](\s+with\s+{[^}]*})?\s*%}/g,
      /{%\s*import\s+['"]([^'"]+)['"]\s*%}/g,
      /{%\s*from\s+['"]([^'"]+)['"]\s*%}/g,
    ]

    const refs = patterns.flatMap((pattern) => {
      const matches = []
      let match
      while ((match = pattern.exec(content)) !== null) {
        const ref = match[1]
        // Convert mercury: format to @mercury format
        if (ref.startsWith("mercury:")) {
          const componentName = ref.replace("mercury:", "")
          matches.push(`@mercury/${componentName}/${componentName}.twig`)
        } else {
          matches.push(ref)
        }
      }
      return matches
    })
    return refs
  }

  // Find files that reference our target components
  const findReferencingFiles = () => {
    const allTwigFiles = getAllTwigFiles()
    const referencingFiles = []

    console.log(
      `[getComponentReferences] Scanning ${allTwigFiles.length} Twig files`
    )

    allTwigFiles.forEach((filePath) => {
      try {
        const content = fs.readFileSync(filePath, "utf8")
        const references = extractReferences(content)

        // Check if any of the references match our target components
        const hasTargetReference = references.some((ref) =>
          targetReferences.includes(ref)
        )

        if (hasTargetReference) {
          // Convert absolute path back to namespaced reference for consistency
          const namespacedPath = getNamespacedReference(filePath)
          referencingFiles.push({
            file: filePath,
            namespacedPath,
            references: references.filter((ref) =>
              targetReferences.includes(ref)
            ),
          })
        }
      } catch (error) {
        console.warn(
          `Warning: Could not process file ${filePath}: ${error.message}`
        )
      }
    })

    return referencingFiles
  }

  const results = findReferencingFiles()
  console.log(
    `[getComponentReferences] Found ${results.length} files referencing target components`
  )

  // Return just the file paths (or you could return the full objects with more info)
  return results.map((result) => result.file)
}
