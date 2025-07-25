import { createFunction } from "twing"

/**
 * Simple test function.
 */
async function testFunction() {
  return "IT WORKS!"
}

export function initEnvironment(twingEnvironment, config = {}) {
  const func = createFunction('testFunction', testFunction, []);
  twingEnvironment.addFunction(func);
}