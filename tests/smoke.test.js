import Markup from "../dist/test.js"
import { describe, expect, it } from "vitest"
describe("Basic smoke test", () => {
  it("Should support includes", async () => {

    const markup = Markup.render({
      'the': 'variables',
      'go': 'here',
      'attributes': {
        'class': 'provided-class'
      },
      'contentfunction': ()=>{ return 'content function'},
      'markup': '<div>Sample Markup</div>',
      'array': ['<div>Sample Markup</div>', '<div>Sample Markup2</div>']
    });

    expect(markup).toMatchSnapshot()
    expect(markup).toContain("Nested include")
    expect(markup).toContain("Relative include")
  })
})
