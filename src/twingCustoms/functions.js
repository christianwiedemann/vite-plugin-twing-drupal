import {  createFunction } from 'twing';
export default [
    createFunction(
        '__',
        function (t, n) {
          return Promise.resolve(t);
        },
        [
          { name: 't', default: '' },
          { name: 'n', default: 'mercury-theme' }
        ]
      ),
    createFunction('attach_scripts', function (t) { return Promise.resolve(null); }),
    //createFunction('testFunction', function (t) { return Promise.resolve('IT WORKS!'); }),
    createFunction('testFunction', () => {return Promise.resolve('IT WORKS!')}, []),
    createFunction('attach_styles', function (t) { return Promise.resolve(null); }),
    createFunction('attach_library', function (t) { return Promise.resolve(null); }),
]