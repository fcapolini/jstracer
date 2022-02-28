// #!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const escodegen_1 = require("escodegen");
const esprima_1 = require("esprima");
const fs_1 = __importDefault(require("fs"));
const yargs_1 = __importDefault(require("yargs"));
const jsstack = [];
(function () {
    return __awaiter(this, void 0, void 0, function* () {
        const options = yield yargs_1.default
            .epilog("Instruments a JavaScript file to trace its execution")
            .usage("Usage: -i <input file> -o <output file>")
            .option("i", { alias: "input", describe: "Input file name", type: "string", demandOption: true })
            .option("o", { alias: "output", describe: "Output file name", type: "string", demandOption: true })
            .argv;
        transform(options.i, options.o);
    });
})();
function transform(inFile, outFile) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`transform(${inFile}, ${outFile})`);
        const src = yield fs_1.default.promises.readFile(inFile);
        const parsed = parse(src.toString());
        patchFunctions(parsed.functions, '_jstrace_fn_entry_', '_jstrace_fn_exit_');
        const dst = (0, escodegen_1.generate)(parsed.ast);
        yield fs_1.default.promises.writeFile(outFile, dst);
    });
}
// function pippo() {
// 	jsstack.push('pippo');
// 	console.log(jsstack.join('/'));
// 	try {
// 		return pluto();
// 	} finally {
// 		jsstack.pop();
// 		console.log(jsstack.join('/'));
// 	}
// }
// function pluto() {
// 	jsstack.push('pluto');
// 	console.log(jsstack.join('/'));
// 	try {
// 		return 1;
// 	} finally {
// 		jsstack.pop();
// 		console.log(jsstack.join('/'));
// 	}
// }
/**
 * Parses the input JS file and collects all its function AST nodes.
 */
function parse(src) {
    const functions = [];
    const ast = (0, esprima_1.parseScript)(src, {
        loc: true,
        tolerant: true
    }, (node, _) => {
        if (node.type === "FunctionDeclaration"
            || node.type === 'FunctionExpression'
            || node.type === 'ArrowFunctionExpression') {
            functions.push(node);
        }
    });
    return { ast: ast, functions: functions };
}
/**
 * Wraps function bodies in try/finally clauses to make sure we can
 * reliably detect both entry and exit of function calls.
 */
function patchFunctions(functions, entryFunctionId, exitFunctionId) {
    functions.forEach(node => {
        var _a, _b;
        let block;
        if (node.body.type === 'BlockStatement') {
            block = node.body;
        }
        else {
            // it's an Expression
            block = {
                type: 'BlockStatement',
                body: [{ type: 'ReturnStatement', argument: node.body }]
            };
        }
        block.body.unshift(buildTracingFunctionCall(entryFunctionId, node.id, (_a = node.loc) === null || _a === void 0 ? void 0 : _a.start.line));
        const body = {
            type: 'BlockStatement',
            body: [{
                    type: 'TryStatement',
                    block: block,
                    handler: null,
                    finalizer: {
                        type: 'BlockStatement',
                        body: [buildTracingFunctionCall(exitFunctionId, node.id, (_b = node.loc) === null || _b === void 0 ? void 0 : _b.start.line)]
                    },
                }]
        };
        if (node.type === 'ArrowFunctionExpression') {
            // ensure arrow function isn't in Expression mode
            // (but rather in BlockStatement mode)
            node.expression = false;
        }
        node.body = body;
    });
}
function buildTracingFunctionCall(tracingFunctionId, tracedFunctionId, lineNr) {
    return {
        type: 'ExpressionStatement',
        expression: {
            type: 'CallExpression',
            callee: {
                type: 'Identifier',
                name: tracingFunctionId
            },
            arguments: [{
                    type: 'Literal',
                    value: tracedFunctionId ? tracedFunctionId : 'function'
                }, {
                    type: 'Literal',
                    value: lineNr ? lineNr : null
                }],
            optional: false
        },
    };
}
