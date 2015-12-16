import syntaxJSXPlugin from 'babel-plugin-syntax-jsx';

const NODE_BUILDER = '__vnode__',
    CHILDREN_NORMALIZER = '__vnormalizer__';

export default function({ types }) {
    function buildNodeExpr(tagExpr) {
        return types.callExpression(types.identifier(NODE_BUILDER), [tagExpr]);
    }

    function buildChildrenExpr(children, prevExpr) {
        var normalizedChildren = normalizeChildren(children);
        return normalizedChildren?
            types.callExpression(
                types.memberExpression(
                    prevExpr,
                    types.identifier('children')),
                []) :
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
            domRefExpr,
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

                    case 'dom-ref':
                        domRefExpr = getValueExpr(attr.value);
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

        if(domRefExpr) {
            res = types.callExpression(
                types.memberExpression(
                    types.identifier('this'),
                    types.identifier('setDomRef')),
                [domRefExpr, res]);
        }

        if(nsExpr) {
            res = types.callExpression(
                types.memberExpression(
                    res,
                    types.identifier('ns')),
                [nsExpr]);
        }

        if(keyExpr) {
            res = types.callExpression(
                types.memberExpression(
                    res,
                    types.identifier('key')),
                [keyExpr]);
        }

        if(attrsExpr) {
            res = types.callExpression(
                types.memberExpression(res, types.identifier('attrs')),
                [attrsExpr]);
        }

        if(htmlExpr) {
            res = types.callExpression(
                types.memberExpression(
                    res,
                    types.identifier('html')),
                [htmlExpr]);
        }

        return res;
    }

    function getValueExpr(value) {
        return types.isJSXExpressionContainer(value)? value.expression : value;
    }

    function normalizeChildren(children) {
        let normalizeInRuntime = false,
            res = children.reduce((acc, child) => {
                if(types.isJSXText(child)) {
                    child = cleanJSXText(child);

                    if(child) {
                        if(children.length > 1) {
                            acc.push(
                                types.callExpression(
                                    types.memberExpression(
                                        buildNodeExpr(types.stringLiteral('span')),
                                        types.identifier('children')),
                                        [child]));
                        }
                        else {
                            acc.push(child);
                        }
                    }
                }
                else if(types.isJSXExpressionContainer(child)) {
                    if(!types.isJSXEmptyExpression(child.expression)) {
                        normalizeInRuntime = true;
                        requireNormalizer = true;
                        acc.push(child.expression);
                    }
                }
                else {
                    acc.push(child);
                }

                return acc;
            }, []);

        return normalizeInRuntime?
            types.callExpression(
                types.identifier(CHILDREN_NORMALIZER),
                [res.length > 1? types.arrayExpression(res) : res[0]]) :
            res.length > 1?
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

    let requireNode, requireNormalizer;

    return {
        inherits : syntaxJSXPlugin,
        visitor : {
            JSXElement : function(path, file) {
                requireNode = true;

                const node = path.node,
                    name = node.openingElement.name.name,
                    attrs = node.openingElement.attributes,
                    children = node.children;

                let res = buildNodeExpr(name === name.toLowerCase()?
                        types.stringLiteral(name) :
                        node.openingElement.name);

                if(attrs.length) {
                    res = buildAttrsExpr(attrs, res, file);
                }

                if(children.length) {
                    res = buildChildrenExpr(children, res);
                }

                path.replaceWith(res);
            },

            Program : {
                enter : function() {
                    requireNode = false;
                    requireNormalizer = false;
                },

                exit : function(path) {
                    if(!requireNode) {
                        return;
                    }

                    path.node.body.unshift(
                        types.variableDeclaration(
                            'var',
                            [
                                types.variableDeclarator(
                                    types.identifier(NODE_BUILDER),
                                    types.memberExpression(
                                        types.callExpression(types.identifier('require'), [types.stringLiteral('vidom')]),
                                        types.identifier('node')))
                            ].concat(requireNormalizer?
                                types.variableDeclarator(
                                    types.identifier(CHILDREN_NORMALIZER),
                                    types.memberExpression(
                                        types.callExpression(types.identifier('require'), [types.stringLiteral('vidom')]),
                                        types.identifier('normalizeChildren'))) :
                                []
                            )));
                }
            }
        }
    };
}
