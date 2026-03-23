const fs = require('fs');
const lines = [
'export type BackoffStrategy = "fixed" | "linear" | "exponential" | "jitter";',
'export type RetryCondition = "always" | "on_error" | "on_timeout" | "on_rate_limit" | "never";',
''
];
fs.writeFileSync('test-out.txt', lines.join('\n'));
console.log('ok');
