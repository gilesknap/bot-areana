/**
 * Plain-English explanations for Python errors, aimed at people writing their first programs.
 * Pure functions of the exception type and message so they are easy to test and extend.
 */
import type { BotErrorName } from '../shared/api';
import { BOT_ERRORS } from '../shared/errors';

export interface Explanation {
  friendly: string;
  tip?: string;
}

type Rule = [RegExp, (m: RegExpMatchArray) => Explanation];

const SYNTAX_RULES: Rule[] = [
  [/expected ':'/, () => ({
    friendly: 'A line that starts a block (if, while, for, def, else) must end with a colon :',
    tip: 'Tip: write `while True:` - the colon is easy to forget.',
  })],
  [/unterminated string|EOL while scanning/, () => ({
    friendly: 'A piece of text is missing its closing quote mark.',
    tip: 'Tip: strings need a quote at both ends, like "hello".',
  })],
  [/unterminated triple-quoted string/, () => ({
    friendly: 'A """triple-quoted""" string is never closed.',
  })],
  [/'(.)' was never closed/, (m) => ({
    friendly: `A bracket ${m[1]} was opened but never closed.`,
    tip: 'Tip: every ( needs a matching ), every [ a ].',
  })],
  [/unmatched '(.)'|closing parenthesis '(.)' does not match/, (m) => ({
    friendly: `There is a closing bracket ${m[1] ?? m[2]} without a matching opening one.`,
  })],
  [/Maybe you meant '==' or ':=' instead of '='|cannot assign to/, () => ({
    friendly: 'You used = where Python expected a comparison or a name.',
    tip: 'Tip: = stores a value, == compares two values: `if x == 3:`',
  })],
  [/Perhaps you forgot a comma/, () => ({
    friendly: 'Python found two values next to each other with nothing between them.',
    tip: 'Tip: separate arguments with commas: bot.gps.bearing_to(400, 200)',
  })],
  [/invalid decimal literal/, () => ({
    friendly: 'A name or number is malformed - names cannot start with a digit.',
  })],
  [/'return' outside function/, () => ({ friendly: '`return` only works inside a function (def).' })],
  [/'break' outside loop|'continue' not properly in loop/, () => ({
    friendly: '`break` and `continue` only work inside a loop (while or for).',
  })],
];

const INDENT_RULES: Rule[] = [
  [/expected an indented block/, () => ({
    friendly: 'The line after a colon : needs to be indented.',
    tip: 'Tip: indent the body of if / while / for / def by 4 spaces.',
  })],
  [/unexpected indent/, () => ({
    friendly: 'This line is indented more than Python expected.',
    tip: 'Tip: only indent lines that belong to a block (after a line ending in :).',
  })],
  [/unindent does not match/, () => ({
    friendly: "This line's indentation doesn't line up with the lines above it.",
    tip: 'Tip: lines in the same block must start at exactly the same column.',
  })],
];

const CAPITALISED: Record<string, string> = { true: 'True', false: 'False', none: 'None' };

function explainNameError(message: string): Explanation {
  const name = /name '(\w+)' is not defined/.exec(message)?.[1];
  if (!name) return { friendly: 'Python met a name it does not know.' };
  if (CAPITALISED[name.toLowerCase()] && name !== CAPITALISED[name.toLowerCase()]) {
    const right = CAPITALISED[name.toLowerCase()];
    return { friendly: `Python doesn't know '${name}'. It is spelled ${right}, with a capital letter.` };
  }
  const suggestion = /Did you mean: '(\w+)'/.exec(message)?.[1];
  return {
    friendly: `Python doesn't know the name '${name}'.` + (suggestion ? ` Did you mean '${suggestion}'?` : ''),
    tip: 'Tip: check the spelling (Python cares about capitals), and set a variable before you use it. Parts live on bot, e.g. bot.drive.',
  };
}

function explainTypeError(message: string): Explanation {
  let m: RegExpExecArray | null;
  if ((m = /^(\S+)\(\) missing \d+ required positional arguments?: (.+)$/.exec(message))) {
    return {
      friendly: `${m[1]}() needs more information: you left out ${m[2]}.`,
      tip: `Tip: put the value inside the brackets, e.g. bot.drive.forward(100).`,
    };
  }
  if ((m = /^(\S+)\(\) takes (\d+) positional arguments? but (\d+) (?:was|were) given$/.exec(message))) {
    // Methods count `self`, which players never write, so take one off both numbers.
    const method = m[1]!.startsWith('bot.');
    const takes = Number(m[2]) - (method ? 1 : 0);
    const given = Number(m[3]) - (method ? 1 : 0);
    return {
      friendly: `${m[1]}() takes ${takes === 0 ? 'no values' : takes === 1 ? '1 value' : `${takes} values`} but you gave it ${given}.`,
    };
  }
  if ((m = /^(\S+)\(\) needs a number for (\w+), not (\w+)/.exec(message))) {
    const hint = m[3] === 'str' ? ' Numbers go without quotes: 100, not "100".' : '';
    return { friendly: `${m[1]}() needs a number for ${m[2]}, but got a ${m[3]}.${hint}` };
  }
  if (/'(method|builtin_function_or_method|function)' object/.test(message) || /instances of 'method'/.test(message)) {
    return {
      friendly: 'You used a method without calling it.',
      tip: 'Tip: add brackets to call it: bot.front_sensor.distance(), not bot.front_sensor.distance',
    };
  }
  if (/'NoneType' object/.test(message)) {
    return {
      friendly: 'You used a value that is None (nothing).',
      tip: "Tip: some calls return None, e.g. bot.drive.forward(100, wait=False) - don't use their result.",
    };
  }
  if (/can only concatenate str|unsupported operand type\(s\)/.test(message)) {
    return {
      friendly: 'You mixed two types that cannot be combined, like text and a number.',
      tip: 'Tip: use str(x) to turn a number into text, or print("x is", x).',
    };
  }
  if (/object is not callable/.test(message)) {
    return { friendly: 'You put brackets () after something that is not a function or method.' };
  }
  return { friendly: 'A value of the wrong type was used.' };
}

/** Explain a Python exception for the console. `message` is str(exception). */
export function explainError(type: string, message: string): Explanation {
  if (type in BOT_ERRORS) {
    const known = BOT_ERRORS[type as BotErrorName];
    const text = message || known.message;
    return { friendly: text[0]!.toUpperCase() + text.slice(1), tip: known.tip };
  }
  const match = (rules: Rule[]): Explanation | undefined => {
    for (const [re, fn] of rules) {
      const m = message.match(re);
      if (m) return fn(m);
    }
    return undefined;
  };
  switch (type) {
    case 'SyntaxError':
      return match(SYNTAX_RULES) ?? {
        friendly: "Python couldn't understand this line.",
        tip: 'Tip: look for a missing colon, bracket or quote here or on the line above.',
      };
    case 'IndentationError':
    case 'TabError':
      return match(INDENT_RULES) ?? { friendly: 'The indentation (spaces at the start of the line) is wrong here.' };
    case 'NameError':
    case 'UnboundLocalError':
      return explainNameError(message);
    case 'TypeError':
      return explainTypeError(message);
    case 'AttributeError':
      return {
        friendly: message.startsWith('bot') ? message : `That value doesn't have what you asked for: ${message}`,
        tip: 'Tip: the API panel lists everything your bot can do.',
      };
    case 'ZeroDivisionError':
      return { friendly: 'You divided by zero, which has no answer.', tip: 'Tip: check the number is not 0 before dividing.' };
    case 'IndexError':
      return { friendly: 'You asked for an item past the end of a list.', tip: 'Tip: lists start at 0; check len(x) first, or loop with `for item in x:`.' };
    case 'KeyError':
      return { friendly: `That key is not in the dictionary: ${message}` };
    case 'ValueError':
      return { friendly: `A value had the right type but a bad value: ${message}` };
    case 'ModuleNotFoundError':
    case 'ImportError':
      return { friendly: 'That module is not available in Bot Arena.', tip: 'Tip: math and random are available; anything that talks to the internet is not.' };
    case 'RecursionError':
      return { friendly: 'A function kept calling itself and never stopped.' };
    case 'RuntimeError':
      if (message.startsWith('input()')) return { friendly: 'input() cannot be used here: your bot cannot stop and ask questions.' };
      return { friendly: `Something went wrong: ${message}` };
    case 'InternalError':
      return { friendly: 'Something went wrong inside Bot Arena itself - not your code. Try running again.' };
    default:
      return { friendly: `Python stopped with a ${type}: ${message}` };
  }
}
