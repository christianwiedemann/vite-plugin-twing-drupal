/**
 * Custom Twing loader for SDC components that extends array loader functionality
 * Based on Twing's createArrayLoader with SDC-specific enhancements
 */

// twing is CJS (index.cjs). Under a pnpm-strict consumer the module is served
// raw, so a named ESM import yields no binding — default-import the CJS module
// object and destructure instead.
import twing from "twing"
const { createSynchronousArrayLoader } = twing

/**
 * Determines if a template name refers to an SDC component
 * @param {string} name - Template name to check
 * @returns {boolean} True if the template is an SDC component
 */
const isSDC = (name) => name.includes("@") || name.includes("/")

/**
 * Resolves a template using namespace:template syntax
 * @param {string[]} templateParts - Array containing namespace and template name
 * @param {Object} templates - Object containing all available templates
 * @returns {Object} Template source object with code, path and name
 * @throws {Error} If template cannot be found
 */
const getTemplateByColon = (templateParts, templates) => {
  const [namespace, templateName] = templateParts

  // Find the first template that matches the namespace and template name pattern
  const matchingEntry = Object.entries(templates).find(
    ([key, _]) =>
      key.startsWith(`@${namespace}`) && key.endsWith(`${templateName}.twig`)
  )

  if (matchingEntry) {
    const [key, value] = matchingEntry
    return {
      code: value,
      path: key,
      name: key,
    }
  }

  throw new Error(
    `Template "${templateName}" in namespace "${namespace}" does not exist.`
  )
}

/**
 * Resolves a colon-syntax template name (e.g. "my_theme:button") to its
 * @namespace key in the templates object (e.g. "@my_theme/button/button.twig").
 * Returns the matching key or null if not found.
 */
const resolveColonName = (name, templates) => {
  if (!name.includes(":")) return null
  const [namespace, templateName] = name.split(":")
  const matchingEntry = Object.entries(templates).find(
    ([key, _]) =>
      key.startsWith(`@${namespace}`) && key.endsWith(`${templateName}.twig`)
  )
  return matchingEntry ? matchingEntry[0] : null
}

/**
 * Creates a custom loader for SDC components, extending Twing's array loader functionality
 *
 * @param {Object} templates An object where keys are template names and values are template sources
 * @param {string} name Optional name for this loader instance
 *
 * @returns {Object} A Twing loader with enhanced SDC functionality
 */

export function createSDCLoader(templates, namespaces, name = "sdc-array") {
  // Get the base array loader
  const baseLoader = createSynchronousArrayLoader(templates)

  // Create a wrapper around the base loader to add SDC-specific functionality
  const enhancedLoader = {
    // Critical method to get source directly - required by Twing internals
    getSource: (name) => {
      console.log(`[SDC Loader] Getting source for: ${name}`)

      // If baseLoader has getSource method, use it
      if (typeof baseLoader.getSource === "function" && !name.includes(":")) {
        return baseLoader.getSource(name)
      }

      // Otherwise, try to implement our own based on templates
      if (templates[name] !== undefined) {
        return {
          code: templates[name],
          path: name,
          name: name,
        }
      }

      return getTemplateByColon(name.split(":"), templates)
    },

    // Forward other methods directly to the base loader
    getSourceContext: (name) => {
      console.log(`[SDC Loader] Loading template: ${name}`)
      return baseLoader.getSourceContext(name)
    },

    getCacheKey: (name) => baseLoader.getCacheKey(name),

    exists: (name) => {
      if (baseLoader.exists(name)) return true
      // Check colon-syntax: "namespace:template" → "@namespace/.../template.twig"
      const resolved = resolveColonName(name, templates)
      if (resolved) return true
      console.warn(`[SDC Loader] Template not found: ${name}`)
      return false
    },

    isFresh: (name, time) => baseLoader.isFresh(name, time),

    // Add the critical resolve method
    resolve: (name, from = null) => {
      console.log(
        `[SDC Loader] Resolving template: ${name} ${from ? `from ${from}` : ""}`
      )

      // Resolve relative paths (./foo.twig, ../bar.twig) against the parent template
      if (from && (name.startsWith("./") || name.startsWith("../"))) {
        const dir = from.substring(0, from.lastIndexOf("/"))
        const parts = `${dir}/${name}`.split("/")
        const normalized = []
        for (const part of parts) {
          if (part === "..") normalized.pop()
          else if (part !== ".") normalized.push(part)
        }
        const resolved = normalized.join("/")
        if (templates[resolved] !== undefined) {
          // Register under the relative key so getSource can find it
          templates[name] = templates[resolved]
          return resolved
        }
      }

      // Check colon-syntax: "namespace:template" → "@namespace/.../template.twig"
      const colonResolved = resolveColonName(name, templates)
      if (colonResolved) return colonResolved

      // If baseLoader has resolve method, use it
      if (typeof baseLoader.resolve === "function") {
        return baseLoader.resolve(name, from)
      }
      // Otherwise provide basic resolution logic
      return name
    },

    // Ensure we have all the necessary methods expected by Twing
    getContents: baseLoader.getContents
      ? (name) => baseLoader.getContents(name)
      : (name) => {
          if (templates[name] !== undefined) {
            return templates[name]
          }
          throw new Error(`Template "${name}" does not exist.`)
        },

    getPaths: baseLoader.getPaths
      ? () => baseLoader.getPaths()
      : () => Object.keys(templates),

    // Add any methods from the original ArrayLoader that we might need
    addTemplates: (newTemplates) => {
      // Add the templates to our local cache
      Object.assign(templates, newTemplates)

      // If the base loader has this method, forward to it
      if (typeof baseLoader.addTemplates === "function") {
        baseLoader.addTemplates(newTemplates)
      }
    },

    setTemplate: (name, template) => {
      // Update our local cache
      templates[name] = template

      // If the base loader has this method, forward to it
      if (typeof baseLoader.setTemplate === "function") {
        baseLoader.setTemplate(name, template)
      }
    },

    // Custom method to load a template and enhance it with SDC metadata
    load: async (env, name, path = null) => {
      try {
        // Get the template from the base loader
        const template = await baseLoader.load(env, name, path)
        // Check if this is an SDC component (based on naming conventions)

        if (isSDC(name, namespaces)) {
          // We can't modify the template directly, but we can create a wrapper with additional functionality
          const enhancedRender = async (context) => {
            // Add SDC-specific context variables if needed
            const enhancedContext = {
              ...context,
              _sdc: {
                componentName: name.split("/").pop().replace(".twig", ""),
                isSDC: true,
                loadedAt: new Date().toISOString(),
              },
            }

            // Call the original render method
            return template.render(enhancedContext)
          }

          // Return a template with the enhanced render method
          return {
            ...template,
            render: enhancedRender,
          }
        }

        // Return the original template for non-SDC templates
        return template
      } catch (error) {
        console.error(`[SDC Loader] Error loading template ${name}:`, error)
        throw error
      }
    },
  }

  return enhancedLoader
}

export default createSDCLoader
