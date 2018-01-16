import path from 'path';
import pluginTester from 'babel-plugin-tester';
import vidomJsxPlugin from '..';

pluginTester({
    plugin : vidomJsxPlugin,
    pluginName : 'vidom-jsx',
    fixtures : path.join(__dirname, 'fixtures')
})
