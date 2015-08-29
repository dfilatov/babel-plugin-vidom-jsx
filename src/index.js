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
            keyExpr,
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
                if(attr.name.name === 'key') {
                    keyExpr = attr.value;
                }
                else {
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

        if(attrsExpr) {
            res = types.memberExpression(
                res,
                types.callExpression(types.identifier('attrs'), [attrsExpr]));
        }

        if(keyExpr) {
            res = types.memberExpression(
                res,
                types.callExpression(types.identifier('key'), [keyExpr]));
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
                    child && acc.push(buildChildrenExpr([child], buildNodeExpr(types.literal('span'))));
                }
                else if(types.isJSXExpressionContainer(child)) {
                    if(!types.isJSXEmptyExpression(child.expression)) {
                        normalizeInRuntime = true;
                        needNormalizer = true;
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
            types.arrayExpression(res);
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

    let hasJSXExpr, needNormalizer;

    return new Plugin('babel-vidom-jsx', {
        visitor : {
            JSXElement : function(node, parent, scope, file) {
                hasJSXExpr = true;

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
                    hasJSXExpr = false;
                    needNormalizer = false;
                },

                exit : function(node) {
                    if(!hasJSXExpr) {
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
                            ].concat(needNormalizer?
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
