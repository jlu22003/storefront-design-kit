// A node:test reporter for the coverage gate: one JSON line per test that the
// runner reported, with whether it was skipped or marked todo. Suites and hooks
// are not tests, so they are left out.
//
//   node --test --test-reporter=./scripts/lib/node-test-reporter.mjs \
//     --test-reporter-destination=reports/node-tests.jsonl "tests/**/*.test.mjs"

export default async function* nodeTestReporter(source) {
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const { name, file, nesting, details, skip, todo } = event.data;
    // Node 22.12 sets details.type only on suites; later versions also mark tests 'test'.
    if (details?.type === 'suite') continue;
    yield `${JSON.stringify({
      name,
      file: file ?? null,
      nesting,
      passed: event.type === 'test:pass',
      skip: skip !== undefined && skip !== false,
      todo: todo !== undefined && todo !== false,
    })}\n`;
  }
}
