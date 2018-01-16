import syntaxJSXPlugin from 'babel-plugin-syntax-jsx';

const VIDOM = 'vidom',
    ELEM_BUILDER = '__velem__';

export default function({ types }) {
    let autoRequire,
        requireElem;

    function buildElemExpr(tagExpr, argsExpr) {
        return types.callExpression(
            autoRequire?
                types.identifier(ELEM_BUILDER) :
                types.memberExpression(types.identifier(VIDOM), types.identifier('elem')),
            [tagExpr].concat(argsExpr));
    }

    function buildElemArgsExpr(attrs, children, file) {
        const res = [],
            objList = [];
        let attrList = [],
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

        if(objList.length > 0) {
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

        res.push(
            keyExpr || null,
            attrsExpr || null,
            htmlExpr? htmlExpr : normalizeChildren(children),
            refExpr || null,
            htmlExpr? types.booleanLiteral(false) : null);

        let notNullLen = res.length;

        while(notNullLen > 0) {
            if(res[notNullLen - 1] !== null) {
                break;
            }
            notNullLen--;
        }

        return (notNullLen < res.length? res.slice(0, notNullLen) : res)
            .map(expr => expr === null? types.nullLiteral() : expr);
    }

    function getValueExpr(value) {
        return types.isJSXExpressionContainer(value)? value.expression : value;
    }

    function normalizeChildren(children) {
        const res = children.reduce((acc, child) => {
            if(types.isJSXText(child)) {
                child = cleanJSXText(child);

                if(child) {
                    acc.push(child);
                }
            }
            else if(types.isJSXExpressionContainer(child)) {
                if(!types.isJSXEmptyExpression(child.expression)) {
                    acc.push(child.expression);
                }
            }
            else {
                acc.push(child);
            }

            return acc;
        }, []);

        return res.length > 0?
            res.length > 1?
                types.arrayExpression(res) :
                res[0] :
            null;
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

    function buildJSXIdentifierExpr(node, parent) {
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
                buildJSXIdentifierExpr(node.object, node),
                buildJSXIdentifierExpr(node.property, node));
        }

        return node;
    }

    return {
        inherits : syntaxJSXPlugin,
        visitor : {
            JSXElement(path, file) {
                requireElem = true;

                const {
                    node : {
                        openingElement : { name, attributes },
                        children
                    }
                } = path;

                path.replaceWith(
                    buildElemExpr(
                        buildJSXIdentifierExpr(name, path.node),
                        buildElemArgsExpr(attributes, children, file)));
            },

            Program : {
                enter(_, { opts }) {
                    autoRequire = opts.autoRequire !== false;
                    requireElem = false;
                },

                exit(path) {
                    if(!requireElem) {
                        return;
                    }

                    if(autoRequire) {
                        const importDeclaration = types.importDeclaration(
                            [
                                types.importSpecifier(
                                    types.identifier(ELEM_BUILDER),
                                    types.identifier('elem'))
                            ],
                            types.stringLiteral(VIDOM));

                        path.unshiftContainer('body', importDeclaration);
                    }
                }
            }
        }
    };
}
