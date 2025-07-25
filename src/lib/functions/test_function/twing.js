import { newTwingFunction } from "../../helpers/twing.js"
import { name, options, acceptedArguments, testFunction } from "./definition.js"

export async function callable() {
  return testFunction()
}

export default newTwingFunction(name, callable, options, acceptedArguments)
