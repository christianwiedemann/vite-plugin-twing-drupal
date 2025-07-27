/**
 * Custom Twing loader for SDC components that extends array loader functionality
 * Based on Twing's createArrayLoader with SDC-specific enhancements
 */

import { createSynchronousArrayLoader } from "twing"

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
 * Creates a custom loader for SDC components, extending Twing's array loader functionality
 *
 * @param {Object} templates An object where keys are template names and values are template sources
 * @param {string} name Optional name for this loader instance
 *
 * @returns {Object} A Twing loader with enhanced SDC functionality
 */

export function createSDCLoader(templates, namespaces, name = "sdc-array") {
  console.log(Object.keys(templates));
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
      const exists = baseLoader.exists(name)
      if (!exists) {
        console.warn(`[SDC Loader] Template not found: ${name}`)
      }
      return exists
    },

    isFresh: (name, time) => baseLoader.isFresh(name, time),

    // Add the critical resolve method
    resolve: (name, from = null) => {
      console.log(
        `[SDC Loader] Resolving template: ${name} ${from ? `from ${from}` : ""}`
      )
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
