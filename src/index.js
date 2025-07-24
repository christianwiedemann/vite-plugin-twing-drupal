import { TwingEnvironment, TwingLoaderFilesystem } from "twing"
import { join, resolve, dirname } from "node:path"
import { existsSync, readdirSync } from "node:fs"
import { normalizePath } from "vite"

const FRAMEWORK_REACT = "react"
const FRAMEWORK_HTML = "html"

const defaultOptions = {
  namespaces: {},
  filters: {},
  functions: {},
  globalContext: {},
  framework: FRAMEWORK_HTML,
  pattern: /\.(twig)(\?.*)?$/,
}

const findInChildDirectories = (directory, component) => {
  const files = readdirSync(directory, { recursive: true })
  for (const file of files) {
    const filePath = join(directory, file)
    if (file.endsWith(`/${component}.twig`)) {
      return filePath
    }
  }
  return null
}

const resolveFile = (directory, file) => {
  const filesToTry = [file, `${file}.twig`, `${file}.html.twig`]
  for (const ix in filesToTry) {
    const path = resolve(filesToTry[ix])
    if (existsSync(path)) {
      return normalizePath(path)
    }
    const withDir = resolve(directory, filesToTry[ix])
    if (existsSync(withDir)) {
      return normalizePath(withDir)
    }
  }
  return normalizePath(resolve(directory, file))
}

const resolveNamespaceOrComponent = (namespaces, template) => {
  let resolveTemplate = template
  const isNamespace = template.includes(":")

  // Support for SDC.
  if (isNamespace) {
    const [namespace, component] = template.split(":")
    resolveTemplate = `@${namespace}/${component}/${component}`
  }

  // Create the full path for the namespace
  let expandedPath = resolveTemplate
  if (resolveTemplate.startsWith("@")) {
    const [, namespace, ...rest] = resolveTemplate.split("/")
    expandedPath = join(namespaces[namespace], ...rest)
  }

  // If file not found and we are in namespace -> search deeper.
  if (!existsSync(expandedPath) && isNamespace) {
    const [namespace, component] = template.split(":")
    let foundFile = findInChildDirectories(namespaces[namespace], component)
    if (existsSync(foundFile)) {
      expandedPath = foundFile
    }
  }

  return expandedPath
}

const setupTwingEnvironment = (options) => {
  const loader = new TwingLoaderFilesystem("/")

  // Register namespaces
  Object.entries(options.namespaces).forEach(([namespace, path]) => {
    loader.addPath(path, namespace)
  })

  const twing = new TwingEnvironment(loader, {
    debug: true,
    strict_variables: false,
    cache: false,
  })

  // Register custom functions
  Object.entries(options.functions).forEach(([name, func]) => {
    func(twing)
  })

  return twing
}

const errorHandler =
  (id, isDefault = true) =>
  (e) => {
    if (isDefault) {
      return {
        code: `export default () => 'An error occurred whilst rendering ${id}: ${e.toString()} ${e.stack}';`,
        map: null,
      }
    }
    return {
      code: null,
      map: null,
    }
  }

const plugin = (options = {}) => {
  options = { ...defaultOptions, ...options }
  let twing

  return {
    name: "vite-plugin-twing-drupal",
    configResolved({ root }) {
      if (!options.root) {
        options.root = root
      }
      twing = setupTwingEnvironment(options)
    },
    async shouldTransformCachedModule(src, id) {
      return options.pattern.test(id)
    },
    async transform(src, id) {
      if (options.pattern.test(id)) {
        let frameworkInclude = ""
        let frameworkTransform =
          "const frameworkTransform = async (html) => html;"
        let asTwigJs = id.match(/\?twig$/)

        if (options.framework === FRAMEWORK_REACT && !asTwigJs) {
          frameworkInclude = `import React from 'react'`
          frameworkTransform = `const frameworkTransform = (html) => React.createElement('div', {dangerouslySetInnerHTML: {'__html': html}});`
        }

        if (asTwigJs) {
          id = id.slice(0, -5)
        }

        try {
          const normalizedPath = normalizePath(id)

          const output = `
            import { TwingEnvironment, TwingLoaderArray } from 'twing';
            import DrupalAttribute from 'drupal-attribute';
            import { addDrupalExtensions } from 'drupal-twig-extensions/twing';
            ${frameworkInclude}

            const loader = new TwingLoaderArray({
              '/home/cw/projects/vite-plugin-twing-drupal/tests/fixtures/mockup.twig': 
            });
            const twing = new TwingEnvironment(loader, {
              debug: true,
              strict_variables: false,
              cache: false
            });

            addDrupalExtensions(twing);

            ${frameworkTransform}

            export default async (context = {}) => {
              try {
                let defaultAttributes = context.defaultAttributes ? context.defaultAttributes : [];
                if (!Array.isArray(defaultAttributes)) {
                  defaultAttributes = Object.entries(defaultAttributes);
                }
                
                const template = await twing.load('${normalizedPath}');
                const html = await template.render({
                  attributes: new DrupalAttribute(defaultAttributes),
                  ...${JSON.stringify(options.globalContext)},
                  ...context
                });
                
                return await frameworkTransform(html);
              } catch (e) {
                return frameworkTransform('An error occurred whilst rendering ${id}: ' + e.toString());
              }
            }`

          return {
            code: output,
            map: null,
          }
        } catch (e) {
          return errorHandler(id)(e)
        }
      }
    },
  }
}

export default plugin
