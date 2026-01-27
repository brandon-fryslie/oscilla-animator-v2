import minimatch from "minimatch";

function isAllowed(filename, allowedGlobs) {
  // ESLint uses "<input>" for text provided via stdin
  if (!filename || filename === "<input>") return false;
  return allowedGlobs.some((g) => minimatch(filename, g, { dot: true }));
}

export default {
  rules: {
    "no-internal-defaults": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Disallow applying default values outside external-boundary modules.",
        },
        schema: [
          {
            type: "object",
            properties: {
              allowedFilePatterns: {
                type: "array",
                items: { type: "string" },
              },
              banLogicalOrAssignment: { type: "boolean" },
              banLogicalOrLiteral: { type: "boolean" },
            },
            additionalProperties: false,
          },
        ],
      },

      create(context) {
        const opts = context.options[0] ?? {};
        const allowedFilePatterns = opts.allowedFilePatterns ?? [];
        const banLogicalOrAssignment = opts.banLogicalOrAssignment ?? false;
        const banLogicalOrLiteral = opts.banLogicalOrLiteral ?? false;

        const filename = context.getFilename();
        const allowed = isAllowed(filename, allowedFilePatterns);

        if (allowed) return {};

        function report(node, msg) {
          context.report({ node, message: msg });
        }

        return {
          LogicalExpression(node) {
            // nullish coalescing
            if (node.operator === "??") {
              report(
                node,
                "Defaulting with ?? is forbidden outside external-boundary code."
              );
              return;
            }

            // optional: treat `x || <literal>` as defaulting
            if (banLogicalOrLiteral && node.operator === "||") {
              const rt = node.right?.type;
              if (rt === "Literal" || rt === "ObjectExpression" || rt === "ArrayExpression") {
                report(
                  node,
                  "Suspicious defaulting via || is forbidden outside external-boundary code."
                );
              }
            }
          },

          AssignmentExpression(node) {
            if (node.operator === "??=") {
              report(
                node,
                "Defaulting with ??= is forbidden outside external-boundary code."
              );
              return;
            }

            if (banLogicalOrAssignment && node.operator === "||=") {
              report(
                node,
                "Defaulting with ||= is forbidden outside external-boundary code."
              );
            }
          },

          AssignmentPattern(node) {
            report(
              node,
              "Default values (=) in parameters/destructuring are forbidden outside external-boundary code."
            );
          },
        };
      },
    },
  },
};