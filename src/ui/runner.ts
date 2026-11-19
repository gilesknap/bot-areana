/** One PythonRunner for the whole app, created on first use so Pyodide only loads when needed. */
import { PythonRunner } from '../python/client';

let runner: PythonRunner | null = null;

export function getRunner(): PythonRunner {
  runner ??= new PythonRunner();
  return runner;
}
