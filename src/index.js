const NODE_BUILDER = '__vidomjsx__';

export default function({ Plugin, types }) {
    function buildNodeExpr(tagExpr) {
        return types.callExpression(types.identifier(NODE_BUILDER), [tagExpr]);
    }

    function buildChildrenExpr(children, prevExpr) {
        return types.memberExpression(
            prevExpr,
            types.callExpression(
                types.identifier('children'),
                children.length > 1?
                    [types.arrayExpression(normalizeChildren(children))] :
                    children));
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
        return children.map(child => {
            return types.isLiteral(child)?
                buildChildrenExpr([child], buildNodeExpr(types.literal('span'))) :
                child;
        });
    }

    let hasJSXExpr;

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
                            ]));
                }
            }
        }
    });
}
