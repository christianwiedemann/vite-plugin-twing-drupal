import { createFunction } from 'twing';

const newTwingFunction = (name, callable, options, acceptedArguments = []) =>
  createFunction(
    name,
    callable,
    acceptedArguments,
    options,
  );

export default newTwingFunction;
