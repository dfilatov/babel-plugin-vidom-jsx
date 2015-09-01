const NODE_BUILDER = '__node__',
    CHILDREN_NORMALIZER = '__normalizer__';

export default function({ Plugin, types }) {
    function buildNodeExpr(tagExpr) {
        return types.callExpression(types.identifier(NODE_BUILDER), [tagExpr]);
    }

    function buildChildrenExpr(children, prevExpr) {
        return types.memberExpression(
            prevExpr,
            types.callExpression(
                types.identifier('children'),
                [normalizeChildren(children)]));
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
            pushAttrs = function() {
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
                        nsExpr = attr.value;
                    break;

                    case 'key':
                        keyExpr = attr.value;
                    break;

                    case 'html':
                        htmlExpr = attr.value;
                    break;

                    case 'dom-ref':
                        domRefExpr = attr.value;
                    break;

                    default:
                        attrList.push(attr);
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
            res = types.memberExpression(
                types.identifier('this'),
                types.callExpression(types.identifier('setDomRef'), [domRefExpr, res]));
        }

        if(nsExpr) {
            res = types.memberExpression(
                res,
                types.callExpression(types.identifier('ns'), [nsExpr]));
        }

        if(keyExpr) {
            res = types.memberExpression(
                res,
                types.callExpression(types.identifier('key'), [keyExpr]));
        }

        if(attrsExpr) {
            res = types.memberExpression(
                res,
                types.callExpression(types.identifier('attrs'), [attrsExpr]));
        }

        if(htmlExpr) {
            res = types.memberExpression(
                res,
                types.callExpression(types.identifier('html'), [htmlExpr]));
        }

        return res;
    }

    function normalizeChildren(children) {
        let normalizeInRuntime = false,
            res = children.reduce((acc, child) => {
                if(types.isLiteral(child)) {
                    if(typeof child.value === 'string') {
                        child = cleanJSXLiteral(child);
                    }

                    if(child) {
                        if(children.length > 1) {
                            acc.push(
                                types.memberExpression(
                                    buildNodeExpr(types.literal('span')),
                                    types.callExpression(
                                        types.identifier('children'),
                                        [child])));
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
                        acc.push(child);
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

    function cleanJSXLiteral(node) {
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
            return types.literal(str);
        }
    }

    let requireNode, requireNormalizer;

    return new Plugin('babel-vidom-jsx', {
        visitor : {
            JSXElement : function(node, parent, scope, file) {
                requireNode = true;

                const name = node.openingElement.name.name,
                    attrs = node.openingElement.attributes,
                    children = node.children;

                let res = buildNodeExpr(name === name.toLowerCase()?
                        types.literal(name) :
                        node.openingElement.name);

                if(attrs.length) {
                    res = buildAttrsExpr(attrs, res, file);
                }

                if(children.length) {
                    res = buildChildrenExpr(children, res);
                }

                return res;
            },

            Program : {
                enter : function() {
                    requireNode = false;
                    requireNormalizer = false;
                },

                exit : function(node) {
                    if(!requireNode) {
                        return;
                    }

                    node.body.unshift(
                        types.variableDeclaration(
                            'var',
                            [
                                types.variableDeclarator(
                                    types.identifier(NODE_BUILDER),
                                    types.memberExpression(
                                        types.callExpression(types.identifier('require'), [types.literal('vidom')]),
                                        types.identifier('node')))
                            ].concat(requireNormalizer?
                                types.variableDeclarator(
                                    types.identifier(CHILDREN_NORMALIZER),
                                    types.memberExpression(
                                        types.callExpression(types.identifier('require'), [types.literal('vidom')]),
                                        types.identifier('normalizeChildren'))) :
                                []
                            )));
                }
            }
        }
    });
}
