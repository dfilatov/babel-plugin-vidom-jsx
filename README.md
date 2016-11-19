# babel-plugin-vidom-jsx
Plugin for babel to enable JSX in [Vidom](https://github.com/dfilatov/vidom).

## Installation
```
npm i --save-dev babel-plugin-vidom-jsx
```

## Usage

### via CLI
```
babel --plugins vidom-jsx file.js
```

### via babel.rc
```js
{
  "plugins": ["vidom-jsx"]
}
```

## Options

  * `autoRequire` automatically adds necessary `require` (false by default)
