import syntaxJSXPlugin from 'babel-plugin-syntax-jsx';

const VIDOM = 'vidom',
    NODE_BUILDER = '__vnode__',
    CHILDREN_NORMALIZER = '__vnormalizer__';

export default function({ types }) {
    let autoRequire,
        requireNode,
        requireNormalizer;

    function buildNodeExpr(tagExpr) {
        return types.callExpression(
            autoRequire?
                types.identifier(NODE_BUILDER) :
                types.memberExpression(types.identifier(VIDOM), types.identifier('node')),
            [tagExpr]);
    }

    function buildChildrenExpr(children, prevExpr) {
        const normalizedChildren = normalizeChildren(children);

        return normalizedChildren?
            types.callExpression(
                types.memberExpression(
                    prevExpr,
                    types.identifier('setChildren')),
                [normalizedChildren]) :
            prevExpr;
    }

    function buildAttrsExpr(attrs, prevExpr, file) {
        let res = prevExpr,
            attrList = [],
            objList = [],
            attrsExpr,
            nsExpr,
            keyExpr,
            htmlExpr,
            refExpr,
            pushAttrs = () => {
                if(!attrList.length) {
                    return;
                }

                objList.push(types.objectExpression(attrList));
                attrList = [];
            };

        attrs.forEach(attr => {
            if(types.isJSXSpreadAttribute(attr)) {
                pushAttrs();
                objList.push(attr.argument);
            }
            else {
                switch(attr.name.name) {
                    case 'xmlns':
                        nsExpr = getValueExpr(attr.value);
                    break;

                    case 'key':
                        keyExpr = getValueExpr(attr.value);
                    break;

                    case 'html':
                        htmlExpr = getValueExpr(attr.value);
                    break;

                    case 'ref':
                        refExpr = getValueExpr(attr.value);
                    break;

                    default:
                        attrList.push(
                            types.objectProperty(
                                types.stringLiteral(attr.name.name),
                                types.isJSXExpressionContainer(attr.value)?
                                    attr.value.expression :
                                    attr.value || types.booleanLiteral(true)));
                }
            }
        });

        pushAttrs();

        if(objList.length) {
            if(objList.length === 1) {
                attrsExpr = objList[0];
            }
            else {
                if(!types.isObjectExpression(objList[0])) {
                    objList.unshift(types.objectExpression([]));
                }

                attrsExpr = types.callExpression(file.addHelper('extends'), objList);
            }
        }

        if(nsExpr) {
            res = types.callExpression(
                types.memberExpression(res, types.identifier('setNs')),
                [nsExpr]);
        }

        if(keyExpr) {
            res = types.callExpression(
                types.memberExpression(res, types.identifier('setKey')),
                [keyExpr]);
        }

        if(attrsExpr) {
            res = types.callExpression(
                types.memberExpression(res, types.identifier('setAttrs')),
                [attrsExpr]);
        }

        if(refExpr) {
            res = types.callExpression(
                types.memberExpression(res, types.identifier('setRef')),
                [refExpr]);
        }

        if(htmlExpr) {
            res = types.callExpression(
                types.memberExpression(res, types.identifier('setHtml')),
                [htmlExpr]);
        }

        return res;
    }

    function getValueExpr(value) {
        return types.isJSXExpressionContainer(value)? value.expression : value;
    }

    function normalizeChildren(children) {
        let hasTextNodes = false,
            hasJSXExpressions = false,
            res = children.reduce((acc, child) => {
                if(types.isJSXText(child)) {
                    child = cleanJSXText(child);

                    if(child) {
                        hasTextNodes = true;
                        acc.push(child);
                    }
                }
                else if(types.isJSXExpressionContainer(child)) {
                    if(!types.isJSXEmptyExpression(child.expression)) {
                        hasJSXExpressions = true;
                        acc.push(child.expression);
                    }
                }
                else {
                    acc.push(child);
                }

                return acc;
            }, []);

        if(hasJSXExpressions) {
            requireNormalizer = true;
            return types.callExpression(
                autoRequire?
                    types.identifier(CHILDREN_NORMALIZER) :
                    types.memberExpression(types.identifier(VIDOM), types.identifier('normalizeChildren')),
                [res.length > 1? types.arrayExpression(res) : res[0]]);
        }

        if(hasTextNodes && res.length > 1) {
            res = res.map(child => child.type === 'StringLiteral'?
                types.callExpression(
                    types.memberExpression(
                        buildNodeExpr(types.stringLiteral('plaintext')),
                        types.identifier('setChildren')),
                        [child]) :
                child);
        }

        return res.length > 1?
            types.arrayExpression(res) :
            res[0];
    }

    function cleanJSXText(node) {
        const lines = node.value.split(/\r\n|\n|\r/);
        let lastNonEmptyLine = 0;

        lines.forEach((line, i) => {
            if(line.match(/[^ \t]/)) {
                lastNonEmptyLine = i;
            }
        });

        let str = '';

        lines.forEach((line, i) => {
            const isFirstLine = i === 0,
                isLastLine = i === lines.length - 1,
                isLastNonEmptyLine = i === lastNonEmptyLine;

            let trimmedLine = line.replace(/\t/g, ' ');

            if(!isFirstLine) {
                trimmedLine = trimmedLine.replace(/^[ ]+/, '');
            }

            if(!isLastLine) {
                trimmedLine = trimmedLine.replace(/[ ]+$/, '');
            }

            if(trimmedLine) {
                if(!isLastNonEmptyLine) {
                    trimmedLine += ' ';
                }

                str += trimmedLine;
            }
        });

        if(str) {
            return types.stringLiteral(str);
        }
    }

    function buildJSXIdentifierExpression(node, parent) {
        if(types.isJSXIdentifier(node)) {
            if(node.name === 'this' && types.isReferenced(node, parent)) {
                return types.thisExpression();
            }

            if(node.name === node.name.toLowerCase()) {
                return types.stringLiteral(node.name);
            }

            node.type = 'Identifier';
            return node;
        }

        if(types.isJSXMemberExpression(node)) {
            return types.memberExpression(
                buildJSXIdentifierExpression(node.object, node),
                buildJSXIdentifierExpression(node.property, node));
        }

        return node;
    }

    return {
        inherits : syntaxJSXPlugin,
        visitor : {
            JSXElement(path, file) {
                requireNode = true;

                const { node : { openingElement, children } } = path,
                    { name, attributes } = openingElement;

                let res = buildNodeExpr(buildJSXIdentifierExpression(name, path.node));

                if(attributes.length) {
                    res = buildAttrsExpr(attributes, res, file);
                }

                if(children.length) {
                    res = buildChildrenExpr(children, res);
                }

                path.replaceWith(res);
            },

            Program : {
                enter(_, { opts }) {
                    autoRequire = opts.autoRequire !== false;
                    requireNode = false;
                    requireNormalizer = false;
                },

                exit(path) {
                    if(!requireNode) {
                        return;
                    }

                    if(autoRequire) {
                        const importDeclaration = types.importDeclaration(
                            [
                                types.importSpecifier(
                                    types.identifier(NODE_BUILDER),
                                    types.identifier('node'))
                            ].concat(requireNormalizer? [
                                types.importSpecifier(
                                    types.identifier(CHILDREN_NORMALIZER),
                                    types.identifier('normalizeChildren'))
                            ] : []), types.stringLiteral(VIDOM));

                        path.unshiftContainer('body', importDeclaration);
                    }
                }
            }
        }
    };
}
