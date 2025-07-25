/**
 * @file The active_theme function
 *
 * Docs for TwigExtension::getActiveTheme (Drupal 9.3.x):
 *
 * ```
 * new TwigFunction('test_function', [$this, 'testFunction'])
 * ```
 */

export const name = "testFunction"

export const options = {}

export const acceptedArguments = []

/**
 * Gets the name of the active theme.
 *
 * @param {Object<string, ?string|Object<string, ?string>>} config
 *   The shared Drupal config.
 *
 * @returns {string}
 *   The name of the active theme.
 */
export function testFunction(config) {
  return "IT WORKS!"
}
