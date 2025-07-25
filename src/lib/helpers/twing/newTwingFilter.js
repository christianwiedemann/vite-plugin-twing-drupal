import { createFilter } from "twing"

const newTwingFilter = (name, callable, options, acceptedArguments = []) =>
  createFilter(
    name,
    callable,
    // @TODO File bug report; 3rd argument should be options.
    acceptedArguments,
    options
  )

export default newTwingFilter
