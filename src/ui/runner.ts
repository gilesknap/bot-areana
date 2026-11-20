/** One PythonRunner for the whole app. The app creates it at start-up so Pyodide boots in the background. */
import { PythonRunner } from '../python/client';

let runner: PythonRunner | null = null;

export function getRunner(): PythonRunner {
  runner ??= new PythonRunner();
  return runner;
}
