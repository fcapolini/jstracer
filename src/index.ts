#!/usr/bin/env node

import { generate } from "escodegen";
import { parseScript } from "esprima";
import { ArrowFunctionExpression, BaseFunction, BlockStatement, Identifier, Program, Statement } from "estree";
import fs from "fs";
import yargs from "yargs";

const jsstack: any[] = [];

(async function () {
  // const options = await yargs
  //   .epilog("Instruments a JavaScript file to trace its execution")
  //   .usage("Usage: -i <input file> -o <output file>")
  //   .option("i", { alias: "input", describe: "Input file name", type: "string", demandOption: true })
  //   .option("o", { alias: "output", describe: "Output file name", type: "string", demandOption: true })
  //   .argv;

  // transform(options.i, options.o);
  transform('sample/input.js', 'sample/output.js');
})();

async function transform(inFile: string, outFile: string) {
  const src = await fs.promises.readFile(inFile);
  const parsed = parse(src.toString());
  patchFunctions(parsed.functions, '_jstrace_fn_entry_', '_jstrace_fn_exit_');
  const dst = generate(parsed.ast);
  await fs.promises.writeFile(outFile, dst);
}

// function pippo() {
//   jsstack.push('pippo');
//   console.log(jsstack.join('/'));
//   try {
//     return pluto();
//   } finally {
//     jsstack.pop();
//     console.log(jsstack.join('/'));
//   }
// }

// function pluto() {
//   jsstack.push('pluto');
//   console.log(jsstack.join('/'));
//   try {
//     return 1;
//   } finally {
//     jsstack.pop();
//     console.log(jsstack.join('/'));
//   }
// }

/**
 * Parses the input JS file and collects all its function AST nodes.
 */
function parse(src: string): { ast: Program, functions: BaseFunction[] } {
  const functions: BaseFunction[] = [];
  const ast = parseScript(src, {
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
function patchFunctions(functions: BaseFunction[],
      entryFunctionId: string,
      exitFunctionId: string) {
  functions.forEach(node => {
    let block: BlockStatement
    if (node.body.type === 'BlockStatement') {
      block = node.body;
    } else {
      // it's an Expression
      block = {
        type: 'BlockStatement',
        body: [{ type: 'ReturnStatement', argument: node.body }]
      };
    }
    const id:string|undefined = (node as any).id?.name;
    block.body.unshift(buildTracingFunctionCall(
      entryFunctionId, id, node.loc?.start.line, node.loc?.start.column
    ));
    const body: BlockStatement = {
      type: 'BlockStatement',
      body: [{
        type: 'TryStatement',
        block: block,
        handler: null,
        finalizer: {
          type: 'BlockStatement',
          body: [buildTracingFunctionCall(
            exitFunctionId, id, node.loc?.start.line, node.loc?.start.column
          )]
        },
      }]
    };
    if (node.type === 'ArrowFunctionExpression') {
      // ensure arrow function isn't in Expression mode
      // (but rather in BlockStatement mode)
      (node as ArrowFunctionExpression).expression = false;
    }
    node.body = body;
  });
}

function buildTracingFunctionCall(tracingFunctionId: string,
      tracedFunctionId?: string,
      lineNr?: number,
      colNr?: number): Statement {
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
        value: lineNr ? lineNr : null
      }, {
        type: 'Literal',
        value: colNr ? colNr + 1 : null
      }, {
        type: 'Literal',
        value: tracedFunctionId ? tracedFunctionId : null
      }],
      optional: false
    },
  }
}
