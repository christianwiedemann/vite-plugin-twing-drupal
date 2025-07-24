import { createFilter } from "twing";

const returnInput = [
  async function (_executionContext, c) {
    return c;
  },
  [{ name: "c", defaultValue: "" }],
];
export default [
  createFilter(
    "clean_class",
    async function (_executionContext, c) {
      return c
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^[0-9]+/, "")
        .toLowerCase();
    },
    [{ name: "c", defaultValue: "" }]
  ),
  createFilter(
    "t",
    async function (_executionContext, text, replacements) {
      if (replacements && typeof replacements === "object") {
        let result = text;
        Object.keys(replacements).forEach((key) => {
          // Escape special regex characters in the key for safe replacement
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          result = result.replace(
            new RegExp(escapedKey, "g"),
            replacements[key]
          );
        });
        return result;
      }
      return text;
    },
    [
      { name: "text", defaultValue: "" },
      { name: "replacements", defaultValue: null },
    ]
  ),
  createFilter("t", ...returnInput),
  createFilter(
    "clean_unique_id",
    async function (_executionContext, id) {
      return `${id}-${crypto.randomUUID()}`;
    },
    [{ name: "id", defaultValue: "" }]
  ),
  createFilter(
    "without",
    async function (_executionContext, obj, ...keys) {
      if (!obj || typeof obj !== "object") {
        return obj;
      }

      // Collect all non-undefined keys to remove
      const keysToRemove = keys.filter((key) => key !== undefined);

      const result = { ...obj };
      keysToRemove.forEach((key) => {
        delete result[key];
      });

      return result;
    },
    [{ name: "obj", defaultValue: {} }],
    { is_variadic: true }
  ),
];
