import { describe, expect, it } from "vitest"
import { resolve } from "node:path"
import precompileTwig from "../src/vite-plugin-precompile-twig.js"

function createPlugin() {
  return precompileTwig({
    include: /\.twig(\?.*)?$/,
    namespaces: {
      jabba: ["tests/fixtures/jabba"],
      tests: ["tests/fixtures"],
    },
  })
}

const loadCtx = {
  error(message) {
    throw new Error(message)
  },
}

describe("shared twing env", () => {
  it("compiles each template as a thin render wrapper over virtual:twing-env", () => {
    const plugin = createPlugin()
    const button = plugin.load.call(
      loadCtx,
      resolve("tests/fixtures/button.twig")
    )
    const field = plugin.load.call(
      loadCtx,
      resolve("tests/fixtures/field.twig")
    )

    expect(plugin.resolveId("virtual:twing-env")).toBe("virtual:twing-env")
    expect(button).toContain("from 'virtual:twing-env'")
    expect(field).toContain("from 'virtual:twing-env'")
    expect(button).not.toContain("const allSources")
    expect(field).not.toContain("const allSources")
    expect(button).toContain("env.render(")
    expect(field).toContain("env.render(")
  })

  it("emits the template cache once and keeps svg sources", () => {
    const plugin = createPlugin()
    const shared = plugin.load.call(loadCtx, "virtual:twing-env")

    expect(shared).toContain("const allSources")
    expect(shared).toContain("createSynchronousEnvironment")
    expect(shared).toMatch(/knife\.svg/)
    // Unique template bodies are declared once (t0, t1, …), then aliased
    // across relative, cwd-relative, and @namespace keys.
    expect(shared).toMatch(/const t0 = /)
    expect(shared).toMatch(/'button\.twig': t\d+/)
    expect(shared).toMatch(/'@tests\/button\.twig': t\d+/)
    const svgDecls = shared.match(/const t\d+ = "<svg /g) || []
    expect(svgDecls).toHaveLength(1)
  })
})
