const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const staticDir = path.join(process.cwd(), '.next', 'static');
const files = fs.existsSync(staticDir)
  ? fs.readdirSync(staticDir, { recursive: true }).sort().map((file) => path.join(staticDir, file))
  : [];
const hash = crypto.createHash('sha256');
for (const file of files) {
  if (fs.statSync(file).isFile()) hash.update(file).update(fs.readFileSync(file));
}
const swPath = path.join(process.cwd(), 'public', 'sw.js');
const source = fs.readFileSync(swPath, 'utf8');
fs.writeFileSync(swPath, source.replace("'development'", `'${hash.digest('hex').slice(0, 16)}'`));
