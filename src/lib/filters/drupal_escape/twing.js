export function escape(escapedValue) {
  return escapedValue;
}

import { newTwingFilter } from "../../helpers/twing.js"
import { name, options, acceptedArguments } from "./definition.js"

export const callable = escape

export default newTwingFilter(name, callable, options, acceptedArguments)
