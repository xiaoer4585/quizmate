const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')
const { extractAll } = require('@electron/asar')

async function verify(appOutDir) {
  const resourcesDir = path.join(appOutDir, 'resources')
  const asarPath = path.join(resourcesDir, 'app.asar')
  const executablePath = path.join(appOutDir, 'QuizMate.exe')

  if (!fs.statSync(asarPath).isFile()) throw new Error(`Missing packaged ASAR: ${asarPath}`)
  if (!fs.statSync(executablePath).isFile()) throw new Error(`Missing packaged executable: ${executablePath}`)

  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quizmate-asar-'))
  try {
    extractAll(asarPath, extractDir)
    const packagePath = path.join(extractDir, 'package.json')
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
    if (packageJson.main !== 'out/main/index.js') throw new Error(`Unexpected main entry: ${packageJson.main}`)

    const mainPath = path.join(extractDir, packageJson.main)
    if (!fs.statSync(mainPath).isFile()) throw new Error(`Missing main entry: ${mainPath}`)

    const packagedRequire = createRequire(packagePath)
    const uuid = packagedRequire('uuid')
    if (typeof uuid.v4 !== 'function') throw new Error('Packaged uuid module did not expose v4()')

    process.stdout.write(`PACKAGED_APP_OK version=${packageJson.version} asar=${fs.statSync(asarPath).size}\n`)
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true })
  }
}

module.exports = async (context) => verify(context.appOutDir)

if (require.main === module) {
  const appOutDir = process.argv[2]
  if (!appOutDir) throw new Error('Usage: node scripts/verify-packaged-app.cjs <app-out-dir>')
  verify(path.resolve(appOutDir)).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
