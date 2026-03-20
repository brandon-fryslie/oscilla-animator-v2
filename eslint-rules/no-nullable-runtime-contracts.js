function isRawContractName(name) {
  return (
    name.startsWith('Raw') ||
    name.startsWith('External') ||
    name.startsWith('Input')
  );
}

function containsNullishType(typeNode) {
  if (!typeNode) {
    return false;
  }
  if (typeNode.type === 'TSNullKeyword' || typeNode.type === 'TSUndefinedKeyword') {
    return true;
  }
  if (typeNode.type === 'TSParenthesizedType') {
    return containsNullishType(typeNode.typeAnnotation);
  }
  if (typeNode.type === 'TSUnionType') {
    return typeNode.types.some(containsNullishType);
  }
  return false;
}

function paramName(param) {
  if (param.type === 'Identifier') {
    return param.name;
  }
  if (param.type === 'AssignmentPattern' && param.left.type === 'Identifier') {
    return param.left.name;
  }
  if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
    return param.argument.name;
  }
  return 'parameter';
}

function paramIsOptional(param) {
  if (param.type === 'Identifier') {
    return param.optional === true;
  }
  if (param.type === 'AssignmentPattern' && param.left.type === 'Identifier') {
    return param.left.optional === true;
  }
  return false;
}

function paramTypeAnnotation(param) {
  if (param.type === 'Identifier') {
    return param.typeAnnotation?.typeAnnotation ?? null;
  }
  if (param.type === 'AssignmentPattern' && param.left.type === 'Identifier') {
    return param.left.typeAnnotation?.typeAnnotation ?? null;
  }
  if (param.type === 'RestElement' && param.argument.type === 'Identifier') {
    return param.argument.typeAnnotation?.typeAnnotation ?? null;
  }
  return null;
}

function reportTypeLiteralMembers(context, members) {
  for (const member of members) {
    if (member.type === 'TSPropertySignature') {
      if (member.optional) {
        context.report({
          node: member,
          messageId: 'optionalProperty',
        });
      }
      if (member.typeAnnotation && containsNullishType(member.typeAnnotation.typeAnnotation)) {
        context.report({
          node: member.typeAnnotation,
          messageId: 'nullableType',
        });
      }
    }

    if (member.type === 'TSMethodSignature') {
      for (const param of member.params) {
        if (paramIsOptional(param)) {
          context.report({
            node: param,
            messageId: 'optionalParameter',
            data: { name: paramName(param) },
          });
        }
        const typeAnnotation = paramTypeAnnotation(param);
        if (containsNullishType(typeAnnotation)) {
          context.report({
            node: param,
            messageId: 'nullableParameter',
            data: { name: paramName(param) },
          });
        }
      }
    }
  }
}

function reportFunctionParams(context, params) {
  for (const param of params) {
    if (paramIsOptional(param)) {
      context.report({
        node: param,
        messageId: 'optionalParameter',
        data: { name: paramName(param) },
      });
    }
    const typeAnnotation = paramTypeAnnotation(param);
    if (containsNullishType(typeAnnotation)) {
      context.report({
        node: param,
        messageId: 'nullableParameter',
        data: { name: paramName(param) },
      });
    }
    if (typeAnnotation?.type === 'TSTypeLiteral') {
      reportTypeLiteralMembers(context, typeAnnotation.members);
    }
  }
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow nullable and optional runtime contracts outside Raw*/External*/Input* boundary shapes.',
    },
    schema: [],
    messages: {
      nullableType:
        'Runtime contracts must be total after normalization. Use a Raw*/External*/Input* boundary type or a tagged state object instead of nullable members.',
      optionalProperty:
        'Runtime contracts must not use optional properties. Normalize boundary data into a total contract before it reaches core runtime code.',
      optionalParameter:
        "Runtime contracts must not use optional parameter '{{ name }}'. Normalize the boundary input before calling into runtime code.",
      nullableParameter:
        "Runtime contracts must not accept nullable parameter '{{ name }}'. Normalize the boundary input before calling into runtime code.",
      nonNullAssertion:
        'Non-null assertions bypass the runtime contract. Encode the lifecycle state in data instead of asserting ad hoc completeness.',
    },
  },
  create(context) {
    return {
      TSInterfaceDeclaration(node) {
        if (isRawContractName(node.id.name)) {
          return;
        }
        reportTypeLiteralMembers(context, node.body.body);
      },
      TSTypeAliasDeclaration(node) {
        if (isRawContractName(node.id.name)) {
          return;
        }
        if (containsNullishType(node.typeAnnotation)) {
          context.report({
            node: node.typeAnnotation,
            messageId: 'nullableType',
          });
        }
        if (node.typeAnnotation.type === 'TSTypeLiteral') {
          reportTypeLiteralMembers(context, node.typeAnnotation.members);
        }
      },
      FunctionDeclaration(node) {
        if (node.id?.name?.startsWith('normalize')) {
          return;
        }
        reportFunctionParams(context, node.params);
      },
      TSNonNullExpression(node) {
        context.report({
          node,
          messageId: 'nonNullAssertion',
        });
      },
    };
  },
};
