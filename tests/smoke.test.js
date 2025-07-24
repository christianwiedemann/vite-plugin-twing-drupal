import Markup from "../dist/test.js"
import { describe, expect, it } from "vitest"
import { createEnvironment, createSynchronousEnvironment } from 'twing';
describe("Basic smoke test", () => {
  it("Should support includes", async () => {
    console.log(Markup);

    const markup = await Markup.render(createEnvironment(), {'the': 'variables', 'go': 'here'});

    expect(markup).toMatchSnapshot()
    expect(markup).toContain("Nested include")
    expect(markup).toContain("Relative include")
  })
})
